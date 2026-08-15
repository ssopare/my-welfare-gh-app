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
      if (
        plan.computationType !== 'fixed' &&
        plan.computationType !== 'voluntary' &&
        plan.computationType !== 'minimum'
      ) {
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

      // 1. Beneficiary Exemption: Beneficiaries of the plan are exempt from paying
      if (plan.beneficiaryMemberIds?.includes(memberId)) {
        throw new BadRequestException(
          'Member is a beneficiary of this plan and is exempt from contributing.',
        );
      }

      // 2. Defaulter / Suspended Exemption: Exempt them from one-time events until active/cleared
      if (
        plan.cadence === 'one_time' &&
        plan.goodStandingRequired &&
        (member.status === 'DEFAULTER' || member.status === 'SUSPENDED')
      ) {
        throw new BadRequestException(
          'Member is currently suspended or in default and is exempt from contributing until cleared.',
        );
      }

      const amount = plan.computationType === 'voluntary' ? '0.00' : plan.amountValue.toString();
      return {
        planId: plan.id,
        memberId,
        periodDate,
        amount,
        currency: plan.currency,
      };
    });
  }

  async evaluateBenefitEligibility(
    organisationId: string,
    ruleId: string,
    memberId: string,
    eventDate: Date,
    dependantId?: string,
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

      // FR-RULE-04's occurrenceCap, now that Claims exist to count against.
      // Only "lifetime" scope is implemented — fail loudly rather than
      // silently under-enforce a scope nothing evaluates yet, same pattern
      // as computationType/paymentAllocationPolicy elsewhere in this app.
      if (rule.occurrenceCapScope !== 'lifetime') {
        throw new NotImplementedException(
          `occurrenceCapScope "${rule.occurrenceCapScope}" is not yet implemented`,
        );
      }
      const priorClaimCount = await tx.claim.count({
        where: {
          benefitRuleId: rule.id,
          memberId,
          dependantId: dependantId ?? null,
          status: { not: 'REJECTED' },
        },
      });
      const capPassed = priorClaimCount < rule.occurrenceCapMax;
      checks.push({
        description: `No more than ${rule.occurrenceCapMax} claim(s) against this benefit (lifetime)`,
        passed: capPassed,
        detail: `${priorClaimCount} prior non-rejected claim(s) found for this member${dependantId ? '/dependant' : ''}.`,
      });

      // Deliberately not checked here: evidenceRequired. ClaimService.submit
      // enforces it against the evidence actually supplied at submission
      // time — evaluateBenefitEligibility only answers "could this member
      // qualify," which doesn't depend on paperwork that hasn't been
      // gathered yet.

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
