import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { requirePermission, requireSelfOrAdmin } from '../common/access.util';
import { LedgerService } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { RuleEngineService } from '../rule-engine/rule-engine.service';
import { ClaimEvidenceDto } from './dto/claim-evidence.dto';
import { DecideClaimDto } from './dto/decide-claim.dto';
import { DisburseClaimDto } from './dto/disburse-claim.dto';
import { SubmitClaimDto } from './dto/submit-claim.dto';

// §8.6, roadmap slice 7 — the slice that finally connects the rule engine
// (eligibility + amount), the ledger (disbursement postings) and RBAC
// (who may approve/disburse), each built in an earlier slice for exactly
// this moment.
@Injectable()
export class ClaimService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ruleEngine: RuleEngineService,
    private readonly ledger: LedgerService,
    private readonly rbac: RbacService,
  ) {}

  // FR-CLM-01/02: gated by RuleEngineService.evaluateBenefitEligibility
  // (slice 3, now including occurrenceCap) *before* anything is persisted
  // — an ineligible claim is rejected with the same explainable trace the
  // evaluate-eligibility endpoint returns, not a generic error.
  async submit(actor: AuthTokenPayload, ruleId: string, dto: SubmitClaimDto) {
    await requireSelfOrAdmin(this.rbac, actor, dto.memberId);
    const eventDate = new Date(dto.eventDate);

    const eligibility = await this.ruleEngine.evaluateBenefitEligibility(
      actor.organisationId,
      ruleId,
      dto.memberId,
      eventDate,
      dto.dependantId,
    );
    if (!eligibility.eligible) {
      throw new BadRequestException({
        message: 'Member is not eligible for this benefit',
        checks: eligibility.checks,
      });
    }

    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const rule = await tx.benefitRule.findUnique({ where: { id: ruleId } });
      if (!rule) {
        throw new NotFoundException('Benefit rule not found');
      }

      if (dto.dependantId) {
        const dependant = await tx.dependant.findUnique({
          where: { id: dto.dependantId },
        });
        if (!dependant || dependant.memberId !== dto.memberId) {
          throw new BadRequestException(
            'dependantId does not belong to this member',
          );
        }
      }

      const suppliedTypes = new Set(
        (dto.evidence ?? []).map((e) => e.evidenceType),
      );
      const missing = rule.evidenceRequired.filter(
        (type) => !suppliedTypes.has(type),
      );
      if (missing.length > 0) {
        throw new BadRequestException(
          `Missing required evidence: ${missing.join(', ')}`,
        );
      }

      // A rule with no approval stages configured pays out on eligibility
      // alone — "simple 1-2 stage chain" per Phase 1 scope also covers the
      // zero-stage case, rather than being stuck waiting on a decision
      // nothing will ever make.
      const status = rule.approvalChain.length === 0 ? 'APPROVED' : 'SUBMITTED';

      return tx.claim.create({
        data: {
          organisationId: actor.organisationId,
          memberId: dto.memberId,
          benefitRuleId: ruleId,
          dependantId: dto.dependantId,
          submittedBy: actor.memberId,
          eventDate,
          amountValue: eligibility.amount!.value,
          currency: eligibility.amount!.currency,
          status,
          evidence: dto.evidence?.length
            ? {
                create: dto.evidence.map((e) => ({
                  organisationId: actor.organisationId,
                  evidenceType: e.evidenceType,
                  description: e.description,
                  uploadedBy: actor.memberId,
                })),
              }
            : undefined,
        },
        include: { evidence: true },
      });
    });
  }

  // Fetches outside the check, then checks, then writes in its own
  // transaction — not fetch-then-check-inside-the-same-tx, because
  // requireSelfOrAdmin's RbacService call opens its own withTenant and
  // Prisma's interactive transactions don't nest (the same bug class fixed
  // in PaymentService.findOne and ObligationService last slice).
  async addEvidence(
    actor: AuthTokenPayload,
    claimId: string,
    dto: ClaimEvidenceDto,
  ) {
    const claim = await this.findClaimOrThrow(actor, claimId);
    await requireSelfOrAdmin(this.rbac, actor, claim.memberId);
    if (claim.status !== 'SUBMITTED') {
      throw new BadRequestException(
        `Claim is ${claim.status}; evidence can only be added while a claim is under review`,
      );
    }
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.claimEvidence.create({
        data: {
          claimId: claim.id,
          organisationId: actor.organisationId,
          evidenceType: dto.evidenceType,
          description: dto.description,
          uploadedBy: actor.memberId,
        },
      }),
    );
  }

  async listForMember(actor: AuthTokenPayload, memberId: string) {
    await requireSelfOrAdmin(this.rbac, actor, memberId);
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.claim.findMany({
        where: { memberId },
        include: { evidence: true, stageActions: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  // FR-CLM-04's two registers ("applications" vs "approved-and-paid") are
  // both just filtered views over this one list, not separate stores — the
  // caller passes ?status= to pick one.
  async list(actor: AuthTokenPayload, status?: string) {
    await this.requireClaimVisibility(actor);
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.claim.findMany({
        where: status ? { status: status as never } : undefined,
        include: { evidence: true, stageActions: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async findOne(actor: AuthTokenPayload, id: string) {
    const claim = await this.findClaimOrThrow(actor, id);
    if (actor.memberId !== claim.memberId) {
      await this.requireClaimVisibility(actor, {
        targetChapterId: claim.member.chapterId ?? undefined,
      });
    }
    return claim;
  }

  // FR-CLM-03: routes through benefitRule.approvalChain one stage at a
  // time, recording every decision (never overwritten) via
  // ClaimStageAction. Phase 1 uses one flat claim:approve permission at
  // every stage rather than differentiating who may approve *which* stage
  // — see the comment on STARTER_ROLE_TEMPLATES for why.
  async decide(actor: AuthTokenPayload, claimId: string, dto: DecideClaimDto) {
    // Fetched (and its own transaction closed) before the permission check
    // — chapter-scoped approve grants (e.g. Convener) need the claim's
    // member's chapterId to check against, and RbacService.hasPermission
    // opens its own withTenant, which can't nest inside this one (the same
    // "fetch outside, then check, then write" pattern as addEvidence).
    const claimForContext = await this.prisma.withTenant(
      actor.organisationId,
      async (tx) => {
        const claim = await tx.claim.findUnique({
          where: { id: claimId },
          include: { member: true },
        });
        if (!claim) {
          throw new NotFoundException('Claim not found');
        }
        return claim;
      },
    );
    await requirePermission(this.rbac, actor, 'claim', 'approve', {
      targetChapterId: claimForContext.member.chapterId ?? undefined,
    });
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const claim = await tx.claim.findUnique({ where: { id: claimId } });
      if (!claim) {
        throw new NotFoundException('Claim not found');
      }
      if (claim.status !== 'SUBMITTED') {
        throw new BadRequestException(
          `Claim is ${claim.status}, not awaiting a decision`,
        );
      }

      const organisation = await tx.organisation.findUnique({
        where: { id: actor.organisationId },
      });
      if (
        organisation?.makerCheckerEnabled &&
        claim.submittedBy === actor.memberId
      ) {
        throw new ForbiddenException(
          'Maker-checker is enabled: you cannot decide a claim you submitted yourself',
        );
      }

      const rule = await tx.benefitRule.findUnique({
        where: { id: claim.benefitRuleId },
      });
      if (!rule) {
        throw new NotFoundException('Benefit rule not found');
      }
      const stageName =
        rule.approvalChain[claim.currentStageIndex] ?? 'default';

      await tx.claimStageAction.create({
        data: {
          claimId: claim.id,
          organisationId: actor.organisationId,
          stageIndex: claim.currentStageIndex,
          stageName,
          actorMemberId: actor.memberId,
          decision: dto.decision,
          comment: dto.comment,
        },
      });

      if (dto.decision === 'REJECT') {
        return tx.claim.update({
          where: { id: claim.id },
          data: { status: 'REJECTED' },
        });
      }

      const isFinalStage =
        claim.currentStageIndex >= rule.approvalChain.length - 1;
      return tx.claim.update({
        where: { id: claim.id },
        data: isFinalStage
          ? { status: 'APPROVED' }
          : { currentStageIndex: claim.currentStageIndex + 1 },
      });
    });
  }

  // The Obligation/payment split (§12.4) applied to the benefit side:
  // "approved" and "paid" are distinct states, and this is the only thing
  // that moves a claim from one to the other, by posting a real balanced
  // JournalEntry (Benefits Expense debit / Cash credit) — reusing
  // ledger.disburse, the exact permission slice 6 seeded but left
  // unwired ("no enforcement point yet").
  async disburse(
    actor: AuthTokenPayload,
    claimId: string,
    dto: DisburseClaimDto,
  ) {
    await requirePermission(this.rbac, actor, 'ledger', 'disburse');
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const claim = await tx.claim.findUnique({ where: { id: claimId } });
      if (!claim) {
        throw new NotFoundException('Claim not found');
      }
      if (claim.status !== 'APPROVED') {
        throw new BadRequestException(
          `Claim is ${claim.status}, not approved for disbursement`,
        );
      }

      const [expenseAccount, cashAccount] = await Promise.all([
        tx.ledgerAccount.findFirst({
          where: { fundId: dto.fundId, name: 'Benefits Expense' },
        }),
        tx.ledgerAccount.findFirst({
          where: { fundId: dto.fundId, name: 'Cash' },
        }),
      ]);
      if (!expenseAccount || !cashAccount) {
        throw new NotFoundException(
          'This fund is missing its standard Benefits Expense/Cash accounts',
        );
      }

      const journalEntry = await this.ledger.postJournalEntryInTx(
        tx,
        actor.organisationId,
        {
          fundId: dto.fundId,
          description: `Benefit disbursement for claim ${claim.id}`,
          sourceType: 'benefit_disbursement',
          sourceId: claim.id,
          createdBy: actor.memberId,
          lines: [
            {
              ledgerAccountId: expenseAccount.id,
              debit: claim.amountValue.toString(),
              memberId: claim.memberId,
            },
            {
              ledgerAccountId: cashAccount.id,
              credit: claim.amountValue.toString(),
              memberId: claim.memberId,
            },
          ],
        },
      );

      return tx.claim.update({
        where: { id: claim.id },
        data: { status: 'PAID', journalEntryId: journalEntry.id },
      });
    });
  }

  private async findClaimOrThrow(actor: AuthTokenPayload, id: string) {
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const claim = await tx.claim.findUnique({
        where: { id },
        include: { evidence: true, stageActions: true, member: true },
      });
      if (!claim) {
        throw new NotFoundException('Claim not found');
      }
      return claim;
    });
  }

  // Org-wide claim visibility (the register list, or viewing someone
  // else's claim) belongs to whoever can either audit claims or is in the
  // approval chain for them — not just admins. `targetChapterId` lets a
  // chapter-scoped grant (Convener) see a specific claim from their own
  // chapter; omitted for the unfiltered list() call, where there's no
  // single chapter to check against and only an organisation-scoped grant
  // should be able to see everything at once.
  private async requireClaimVisibility(
    actor: AuthTokenPayload,
    context: { targetChapterId?: string } = {},
  ) {
    const [canView, canApprove] = await Promise.all([
      this.rbac.hasPermission(
        actor.organisationId,
        actor.memberId,
        'claim',
        'view',
        context,
      ),
      this.rbac.hasPermission(
        actor.organisationId,
        actor.memberId,
        'claim',
        'approve',
        context,
      ),
    ]);
    if (!canView && !canApprove) {
      throw new ForbiddenException('Missing permission: claim:view');
    }
  }
}
