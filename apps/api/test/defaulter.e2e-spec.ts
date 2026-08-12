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
}

interface LedgerAccountResponse {
  id: string;
  name: string;
  type: string;
}

interface FundResponse {
  id: string;
  name: string;
  ledgerAccounts: LedgerAccountResponse[];
}

interface ObligationResponse {
  id: string;
  status: string;
}

interface MemberDetailResponse {
  status: string;
}

interface PolicyResponse {
  defaulterThresholdMonths: number;
  forfeitureThresholdMonths: number;
}

// Phase 1 roadmap slice 8: Defaulter/anti-abuse (§14), Phase 1 scope only
// (FR-DEF-01/02 — threshold-based status transitions, oldest-arrears-first
// allocation; FR-DEF-03/04's consistency score and dumping-pattern
// detection are Phase 2). Real HTTP requests, real Postgres, same style as
// the earlier e2e specs.
describe('Defaulter/anti-abuse (e2e)', () => {
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
        tx.defaulterPolicy.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.journalLine.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.journalEntry.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.obligation.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.ledgerAccount.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.fund.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.contributionPlan.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.roleAssignment.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.role.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.memberStatusChange.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.member.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.subscription.deleteMany({ where: { organisationId } }),
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
    return `+233-defaulter-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function daysAgo(days: number): string {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
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
        name: 'Test Admin',
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
        name: 'Test Member',
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

  async function createFund(adminToken: string): Promise<FundResponse> {
    const res = await request(app.getHttpServer())
      .post('/funds')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'General Welfare Fund' })
      .expect(201);
    return res.body as FundResponse;
  }

  async function createActivePlan(
    adminToken: string,
    overrides: Record<string, unknown> = {},
  ): Promise<RuleResponse> {
    const createRes = await request(app.getHttpServer())
      .post('/contribution-plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Monthly Due',
        cadence: 'monthly',
        amountValue: '20.00',
        currency: 'GHS',
        ...overrides,
      })
      .expect(201);
    const plan = createRes.body as RuleResponse;
    const activateRes = await request(app.getHttpServer())
      .post(`/contribution-plans/${plan.id}/activate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);
    return activateRes.body as RuleResponse;
  }

  async function createPastObligation(
    adminToken: string,
    planId: string,
    memberId: string,
    dueDate: string,
  ): Promise<ObligationResponse> {
    const res = await request(app.getHttpServer())
      .post(`/contribution-plans/${planId}/obligations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ memberId, dueDate })
      .expect(201);
    return res.body as ObligationResponse;
  }

  async function setPolicy(
    adminToken: string,
    defaulterThresholdMonths: number,
    forfeitureThresholdMonths: number,
  ) {
    await request(app.getHttpServer())
      .post('/defaulter-policy')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ defaulterThresholdMonths, forfeitureThresholdMonths })
      .expect(201);
  }

  async function reassess(
    adminToken: string,
    memberId: string,
    planId: string,
  ) {
    const res = await request(app.getHttpServer())
      .post(
        `/members/${memberId}/contribution-plans/${planId}/reassess-standing`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    return res.body as { status: string } | null;
  }

  async function getMemberStatus(memberToken: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .get('/members/me')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    return (res.body as MemberDetailResponse).status;
  }

  it('does nothing without a configured policy (opt-in)', async () => {
    const admin = await registerOrganisation('Defaulter No Policy Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    const plan = await createActivePlan(admin.accessToken);

    await createPastObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      daysAgo(90),
    );

    await reassess(admin.accessToken, member.identity.memberId, plan.id);
    // No policy configured: reassess is a no-op, status stays whatever it
    // was set to above, regardless of the 90-day-overdue obligation.
    expect(await getMemberStatus(member.accessToken)).toBe('ACTIVE');
  });

  it('transitions ACTIVE -> DEFAULTER at the configured threshold, then -> SUSPENDED at the deeper one', async () => {
    const admin = await registerOrganisation('Defaulter Thresholds Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    const plan = await createActivePlan(admin.accessToken);
    await setPolicy(admin.accessToken, 2, 3);

    await createPastObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      daysAgo(60),
    );
    await createPastObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      daysAgo(30),
    );

    const afterTwoMissed = await reassess(
      admin.accessToken,
      member.identity.memberId,
      plan.id,
    );
    expect(afterTwoMissed?.status).toBe('DEFAULTER');

    await createPastObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      daysAgo(1),
    );
    const afterThreeMissed = await reassess(
      admin.accessToken,
      member.identity.memberId,
      plan.id,
    );
    expect(afterThreeMissed?.status).toBe('SUSPENDED');
  });

  it('a payment that clears all arrears automatically restores ACTIVE (no reinstatement wait configured)', async () => {
    const admin = await registerOrganisation('Defaulter Reinstate Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    const plan = await createActivePlan(admin.accessToken);
    await setPolicy(admin.accessToken, 2, 5);
    const fund = await createFund(admin.accessToken);

    await createPastObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      daysAgo(60),
    );
    await createPastObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      daysAgo(30),
    );
    await reassess(admin.accessToken, member.identity.memberId, plan.id);
    expect(await getMemberStatus(member.accessToken)).toBe('DEFAULTER');

    // Pay off both obligations in full — no explicit reassess call: the
    // automatic hook inside recordContributionPaymentInTx should restore
    // good standing by itself.
    await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        fundId: fund.id,
        amountValue: '40.00',
        currency: 'GHS',
      })
      .expect(201);

    expect(await getMemberStatus(member.accessToken)).toBe('ACTIVE');
  });

  it('reinstatement moves to PROBATION, not ACTIVE, when the plan configures a waiting period', async () => {
    const admin = await registerOrganisation('Defaulter Waiting Period Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    const plan = await createActivePlan(admin.accessToken, {
      reinstatementWaitingPeriodMonths: 1,
    });
    await setPolicy(admin.accessToken, 2, 5);
    const fund = await createFund(admin.accessToken);

    await createPastObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      daysAgo(60),
    );
    await createPastObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      daysAgo(30),
    );
    await reassess(admin.accessToken, member.identity.memberId, plan.id);
    expect(await getMemberStatus(member.accessToken)).toBe('DEFAULTER');

    await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        fundId: fund.id,
        amountValue: '40.00',
        currency: 'GHS',
      })
      .expect(201);

    expect(await getMemberStatus(member.accessToken)).toBe('PROBATION');
  });

  it('policy set/get/reassess are admin-only', async () => {
    const admin = await registerOrganisation('Defaulter Admin Gate Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const plan = await createActivePlan(admin.accessToken);

    await request(app.getHttpServer())
      .post('/defaulter-policy')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ defaulterThresholdMonths: 2, forfeitureThresholdMonths: 3 })
      .expect(403);

    await setPolicy(admin.accessToken, 2, 3);

    await request(app.getHttpServer())
      .get('/defaulter-policy')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(
        `/members/${member.identity.memberId}/contribution-plans/${plan.id}/reassess-standing`,
      )
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(403);
  });

  it('rejects a policy where the defaulter threshold is not below the forfeiture threshold', async () => {
    const admin = await registerOrganisation('Defaulter Invalid Policy Org');
    await request(app.getHttpServer())
      .post('/defaulter-policy')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ defaulterThresholdMonths: 3, forfeitureThresholdMonths: 3 })
      .expect(400);
  });

  it("cross-tenant: one organisation's policy is invisible to another", async () => {
    const orgA = await registerOrganisation('Defaulter Cross-Tenant Org A');
    const orgB = await registerOrganisation('Defaulter Cross-Tenant Org B');

    await setPolicy(orgA.accessToken, 2, 3);

    const policyB = await request(app.getHttpServer())
      .get('/defaulter-policy')
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .expect(200);
    expect(
      (policyB.body as Partial<PolicyResponse>).defaulterThresholdMonths,
    ).toBeUndefined();

    const policyA = await request(app.getHttpServer())
      .get('/defaulter-policy')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .expect(200);
    expect((policyA.body as PolicyResponse).defaulterThresholdMonths).toBe(2);
  });
});
