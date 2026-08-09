import {
  BadRequestException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface EligibilityCheck {
  description: string;
  passed: boolean;
  detail: string;
}

// FR-RULE-05: every eligibility determination must be traceable to the
// specific conditions evaluated, in a form renderable as a plain-language
// explanation — this *is* that trace, not a boolean plus an afterthought.
export interface EligibilityResult {
  eligible: boolean;
  checks: EligibilityCheck[];
  amount?: { value: string; currency: string };
}

function monthsBetween(from: Date, to: Date): number {
  let months =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) {
    months -= 1;
  }
  return Math.max(0, months);
}

@Injectable()
export class RuleEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async computeContributionObligation(
    organisationId: string,
    planId: string,
    memberId: string,
    periodDate: Date,
  ) {
    return this.prisma.withTenant(organisationId, async (tx) => {
      const plan = await tx.contributionPlan.findUnique({
        where: { id: planId },
      });
      if (!plan) {
        throw new NotFoundException('Contribution plan not found');
      }
      if (plan.status !== 'ACTIVE') {
        throw new BadRequestException('Contribution plan is not active');
      }
      if (plan.computationType !== 'fixed') {
        // Phase 1 scope: only fixed amounts are evidenced as needed by the
        // source constitutions' worked examples (§11.2/11.3). Fail loudly
        // rather than silently compute the wrong number for a
        // computationType nothing has implemented yet.
        throw new NotImplementedException(
          `computationType "${plan.computationType}" is not yet implemented`,
        );
      }

      const member = await tx.member.findUnique({ where: { id: memberId } });
      if (!member) {
        throw new NotFoundException('Member not found');
      }
      if (plan.chapterId && member.chapterId !== plan.chapterId) {
        throw new BadRequestException(
          "Member does not belong to this plan's chapter",
        );
      }

      return {
        planId: plan.id,
        memberId,
        periodDate,
        amount: plan.amountValue.toString(),
        currency: plan.currency,
      };
    });
  }

  async evaluateBenefitEligibility(
    organisationId: string,
    ruleId: string,
    memberId: string,
    eventDate: Date,
  ): Promise<EligibilityResult> {
    return this.prisma.withTenant(organisationId, async (tx) => {
      const rule = await tx.benefitRule.findUnique({ where: { id: ruleId } });
      if (!rule) {
        throw new NotFoundException('Benefit rule not found');
      }
      if (rule.status !== 'ACTIVE') {
        throw new BadRequestException('Benefit rule is not active');
      }

      const member = await tx.member.findUnique({
        where: { id: memberId },
        include: { statusChanges: { orderBy: { changedAt: 'desc' } } },
      });
      if (!member) {
        throw new NotFoundException('Member not found');
      }

      const checks: EligibilityCheck[] = [];
      const eventDateLabel = eventDate.toISOString().slice(0, 10);

      if (rule.chapterId) {
        const passed = member.chapterId === rule.chapterId;
        checks.push({
          description: 'Member belongs to the chapter this rule applies to',
          passed,
          detail: passed
            ? 'Chapter matches.'
            : 'Member is in a different chapter, or none.',
        });
      }

      if (rule.minTenureMonths != null) {
        const tenureMonths = monthsBetween(member.joinDate, eventDate);
        const passed = tenureMonths >= rule.minTenureMonths;
        checks.push({
          description: `At least ${rule.minTenureMonths} month(s) of tenure by the event date`,
          passed,
          detail: `Member had been enrolled ${tenureMonths} month(s) as of ${eventDateLabel}.`,
        });
      }

      if (rule.goodStandingRequired) {
        // §11.1: eligibility is evaluated against the event date, not
        // "whichever date is convenient" — so this reads the member's
        // status *as it stood on eventDate* from the MemberStatusChange
        // audit trail (statusChanges is already ordered newest-first), not
        // today's current status.
        const statusAsOfEvent =
          member.statusChanges.find((c) => c.changedAt <= eventDate)
            ?.toStatus ?? member.status;
        const passed = statusAsOfEvent === 'ACTIVE';
        checks.push({
          description: 'Member in good standing (ACTIVE) as of the event date',
          passed,
          detail: `Status as of ${eventDateLabel} was ${statusAsOfEvent}.`,
        });
      }

      // Deliberately not checked here: occurrenceCap and evidenceRequired.
      // Both need Claims history to evaluate against, and Claims doesn't
      // exist until roadmap slice 7. Leaving them out of `checks` entirely
      // (rather than a fake always-passing entry) means nothing here can be
      // mistaken for a real pass once Claims lands and this needs wiring up
      // for real.

      const eligible = checks.every((c) => c.passed);
      return {
        eligible,
        checks,
        amount: eligible
          ? { value: rule.amountValue.toString(), currency: rule.currency }
          : undefined,
      };
    });
  }
}
