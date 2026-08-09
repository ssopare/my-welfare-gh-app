import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface AccessTokenResponse {
  accessToken: string;
}

interface MeResponse {
  sub: string;
  memberId: string;
  organisationId: string;
  role: 'ADMIN' | 'MEMBER';
}

interface RuleResponse {
  id: string;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  supersedesId: string | null;
}

interface ObligationResponse {
  amount: string;
  currency: string;
}

interface EligibilityCheckResponse {
  description: string;
  passed: boolean;
  detail: string;
}

interface EligibilityResponse {
  eligible: boolean;
  checks: EligibilityCheckResponse[];
  amount?: { value: string; currency: string };
}

// Phase 1 roadmap slice 3: rule engine core (§11) on top of slices 1-2's
// auth + membership. Exercises real HTTP requests against the real
// Postgres/RLS — same style as the earlier e2e specs.
describe('Rule engine (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdOrgIds: string[] = [];
  const createdAccountIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    for (const organisationId of createdOrgIds) {
      await prisma.withTenant(organisationId, (tx) =>
        tx.roleAssignment.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.role.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.contributionPlan.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.benefitRule.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.dependant.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.memberStatusChange.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.member.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.organisation.delete({ where: { id: organisationId } }),
      );
    }
    for (const accountId of createdAccountIds) {
      await prisma.account.delete({ where: { id: accountId } });
    }
    await app.close();
  });

  function uniquePhone() {
    return `+233-rule-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function registerOrganisation(legalName: string): Promise<{
    accessToken: string;
    identity: MeResponse;
  }> {
    const res = await request(app.getHttpServer())
      .post('/auth/register-organisation')
      .send({
        phoneNumber: uniquePhone(),
        password: 'correct-horse-battery-staple',
        legalName,
        organisationType: 'voluntary',
      })
      .expect(201);
    const { accessToken } = res.body as AccessTokenResponse;
    const identity = await me(accessToken);
    createdOrgIds.push(identity.organisationId);
    createdAccountIds.push(identity.sub);
    return { accessToken, identity };
  }

  async function me(accessToken: string): Promise<MeResponse> {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    return res.body as MeResponse;
  }

  async function joinOrganisation(organisationId: string): Promise<{
    accessToken: string;
    identity: MeResponse;
  }> {
    const res = await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber: uniquePhone(),
        password: 'correct-horse-battery-staple',
        organisationId,
      })
      .expect(201);
    const { accessToken } = res.body as AccessTokenResponse;
    const identity = await me(accessToken);
    createdAccountIds.push(identity.sub);
    return { accessToken, identity };
  }

  async function setStatus(
    adminToken: string,
    memberId: string,
    status: string,
  ) {
    await request(app.getHttpServer())
      .patch(`/members/${memberId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status })
      .expect(200);
  }

  describe('ContributionPlan versioning', () => {
    it('creates, activates, and supersedes a plan; non-admin cannot create', async () => {
      const admin = await registerOrganisation('Rule Engine Plan Org');
      const member = await joinOrganisation(admin.identity.organisationId);

      await request(app.getHttpServer())
        .post('/contribution-plans')
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({
          name: 'Monthly Due',
          cadence: 'monthly',
          amountValue: '20.00',
          currency: 'GHS',
        })
        .expect(403);

      const createRes = await request(app.getHttpServer())
        .post('/contribution-plans')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          name: 'Monthly Due',
          cadence: 'monthly',
          amountValue: '20.00',
          currency: 'GHS',
        })
        .expect(201);
      const v1 = createRes.body as RuleResponse;
      expect(v1.status).toBe('DRAFT');

      const activateRes = await request(app.getHttpServer())
        .post(`/contribution-plans/${v1.id}/activate`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({})
        .expect(201);
      expect((activateRes.body as RuleResponse).status).toBe('ACTIVE');

      // Amendment: v2 supersedes v1.
      const v2Res = await request(app.getHttpServer())
        .post('/contribution-plans')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          name: 'Monthly Due (raised)',
          cadence: 'monthly',
          amountValue: '30.00',
          currency: 'GHS',
          supersedesId: v1.id,
        })
        .expect(201);
      const v2 = v2Res.body as RuleResponse;

      const v2ActivateRes = await request(app.getHttpServer())
        .post(`/contribution-plans/${v2.id}/activate`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({})
        .expect(201);
      const activatedV2 = v2ActivateRes.body as RuleResponse;
      expect(activatedV2.status).toBe('ACTIVE');
      expect(activatedV2.supersedesId).toBe(v1.id);

      const listRes = await request(app.getHttpServer())
        .get('/contribution-plans')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      const active = listRes.body as RuleResponse[];
      expect(active.map((p) => p.id)).toEqual([activatedV2.id]);
      expect(active.map((p) => p.id)).not.toContain(v1.id);

      // v1 is now SUPERSEDED, not DRAFT, so it can never be activated again.
      await request(app.getHttpServer())
        .post(`/contribution-plans/${v1.id}/activate`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({})
        .expect(400);
    });

    it('rejects a draft plan, which then can never be activated', async () => {
      const admin = await registerOrganisation('Rule Engine Reject Org');
      const createRes = await request(app.getHttpServer())
        .post('/contribution-plans')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          name: 'Registration Fee',
          cadence: 'one_time',
          amountValue: '50.00',
          currency: 'GHS',
        })
        .expect(201);
      const plan = createRes.body as RuleResponse;

      const rejectRes = await request(app.getHttpServer())
        .post(`/contribution-plans/${plan.id}/reject`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(201);
      expect((rejectRes.body as RuleResponse).status).toBe('REJECTED');

      await request(app.getHttpServer())
        .post(`/contribution-plans/${plan.id}/activate`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({})
        .expect(400);
    });

    it('computes a fixed-amount obligation, self or admin only, cross-tenant isolated', async () => {
      const admin = await registerOrganisation('Rule Engine Obligation Org');
      const member = await joinOrganisation(admin.identity.organisationId);
      const otherOrgAdmin = await registerOrganisation('Rule Engine Other Org');

      const createRes = await request(app.getHttpServer())
        .post('/contribution-plans')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          name: 'Monthly Due',
          cadence: 'monthly',
          amountValue: '25.50',
          currency: 'GHS',
        })
        .expect(201);
      const plan = createRes.body as RuleResponse;
      await request(app.getHttpServer())
        .post(`/contribution-plans/${plan.id}/activate`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({})
        .expect(201);

      const selfRes = await request(app.getHttpServer())
        .post(`/contribution-plans/${plan.id}/compute-obligation`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ memberId: member.identity.memberId, periodDate: '2026-09-01' })
        .expect(201);
      const obligation = selfRes.body as ObligationResponse;
      expect(obligation.amount).toBe('25.5');
      expect(obligation.currency).toBe('GHS');

      // Another member of the same org cannot compute *this* member's
      // obligation without being an admin.
      const otherMember = await joinOrganisation(admin.identity.organisationId);
      await request(app.getHttpServer())
        .post(`/contribution-plans/${plan.id}/compute-obligation`)
        .set('Authorization', `Bearer ${otherMember.accessToken}`)
        .send({ memberId: member.identity.memberId, periodDate: '2026-09-01' })
        .expect(403);

      // A different org's admin can't even see this plan exists.
      await request(app.getHttpServer())
        .post(`/contribution-plans/${plan.id}/compute-obligation`)
        .set('Authorization', `Bearer ${otherOrgAdmin.accessToken}`)
        .send({ memberId: member.identity.memberId, periodDate: '2026-09-01' })
        .expect(404);
    });
  });

  describe('BenefitRule eligibility evaluation', () => {
    it('produces an explainable pass/fail trace against tenure and point-in-time good standing', async () => {
      const admin = await registerOrganisation('Rule Engine Benefit Org');
      const member = await joinOrganisation(admin.identity.organisationId);
      // A freshly-joined member is PENDING; approve to ACTIVE so the "good
      // standing" checks below have a real ACTIVE→SUSPENDED→ACTIVE history
      // to read from MemberStatusChange, not just the PENDING default.
      await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');

      const createRes = await request(app.getHttpServer())
        .post('/benefit-rules')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          name: 'Bereavement Benefit',
          triggerEvent: 'dependant.death',
          subjectTypes: ['spouse', 'child', 'parent'],
          amountValue: '3000.00',
          currency: 'GHS',
          occurrenceCapMax: 1,
          minTenureMonths: 3,
          goodStandingRequired: true,
        })
        .expect(201);
      const rule = createRes.body as RuleResponse;
      await request(app.getHttpServer())
        .post(`/benefit-rules/${rule.id}/activate`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({})
        .expect(201);

      // Case 1: event "today" fails tenure (member joined moments ago).
      const tooSoonRes = await request(app.getHttpServer())
        .post(`/benefit-rules/${rule.id}/evaluate-eligibility`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          memberId: member.identity.memberId,
          eventDate: new Date().toISOString(),
        })
        .expect(201);
      const tooSoon = tooSoonRes.body as EligibilityResponse;
      expect(tooSoon.eligible).toBe(false);
      const tenureCheck = tooSoon.checks.find((c) =>
        c.description.includes('tenure'),
      );
      expect(tenureCheck?.passed).toBe(false);
      expect(tooSoon.amount).toBeUndefined();

      // Case 2: an event date far enough in the future satisfies tenure,
      // and the member is currently ACTIVE — eligible.
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 1);
      const eligibleRes = await request(app.getHttpServer())
        .post(`/benefit-rules/${rule.id}/evaluate-eligibility`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          memberId: member.identity.memberId,
          eventDate: farFuture.toISOString(),
        })
        .expect(201);
      const eligible = eligibleRes.body as EligibilityResponse;
      expect(eligible.eligible).toBe(true);
      expect(eligible.checks.every((c) => c.passed)).toBe(true);
      expect(eligible.amount).toEqual({ value: '3000', currency: 'GHS' });

      // Case 3: suspend the member, then check eligibility for an event
      // *during* the suspension — must fail good standing even though the
      // member is later reinstated, proving the check reads point-in-time
      // status from MemberStatusChange, not today's current status.
      await setStatus(admin.accessToken, member.identity.memberId, 'SUSPENDED');
      const duringSuspension = new Date();
      const duringSuspensionRes = await request(app.getHttpServer())
        .post(`/benefit-rules/${rule.id}/evaluate-eligibility`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          memberId: member.identity.memberId,
          eventDate: duringSuspension.toISOString(),
        })
        .expect(201);
      const suspendedResult = duringSuspensionRes.body as EligibilityResponse;
      const standingCheck = suspendedResult.checks.find((c) =>
        c.description.includes('good standing'),
      );
      expect(standingCheck?.passed).toBe(false);
      expect(standingCheck?.detail).toContain('SUSPENDED');

      await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
      const afterReinstatementRes = await request(app.getHttpServer())
        .post(`/benefit-rules/${rule.id}/evaluate-eligibility`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          memberId: member.identity.memberId,
          eventDate: duringSuspension.toISOString(),
        })
        .expect(201);
      // Same historical eventDate, evaluated again after reinstatement:
      // still fails, because the *event* happened during the suspension —
      // current status must not retroactively change a past determination.
      const stillSuspendedAtThatDate =
        afterReinstatementRes.body as EligibilityResponse;
      expect(
        stillSuspendedAtThatDate.checks.find((c) =>
          c.description.includes('good standing'),
        )?.passed,
      ).toBe(false);
    });

    it("a member can check their own eligibility; cannot check another member's without admin", async () => {
      const admin = await registerOrganisation('Rule Engine Self-Check Org');
      const memberA = await joinOrganisation(admin.identity.organisationId);
      const memberB = await joinOrganisation(admin.identity.organisationId);

      const createRes = await request(app.getHttpServer())
        .post('/benefit-rules')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          name: 'Birth Benefit',
          triggerEvent: 'member.birth',
          subjectTypes: ['self'],
          amountValue: '300.00',
          currency: 'GHS',
          occurrenceCapMax: 3,
        })
        .expect(201);
      const rule = createRes.body as RuleResponse;
      await request(app.getHttpServer())
        .post(`/benefit-rules/${rule.id}/activate`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({})
        .expect(201);

      await request(app.getHttpServer())
        .post(`/benefit-rules/${rule.id}/evaluate-eligibility`)
        .set('Authorization', `Bearer ${memberA.accessToken}`)
        .send({
          memberId: memberA.identity.memberId,
          eventDate: new Date().toISOString(),
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/benefit-rules/${rule.id}/evaluate-eligibility`)
        .set('Authorization', `Bearer ${memberA.accessToken}`)
        .send({
          memberId: memberB.identity.memberId,
          eventDate: new Date().toISOString(),
        })
        .expect(403);
    });
  });
});
