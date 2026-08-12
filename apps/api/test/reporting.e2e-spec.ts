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

interface ChapterResponse {
  id: string;
  name: string;
}

interface RoleResponse {
  id: string;
  name: string;
}

interface ContributionSummaryRow {
  contributionPlanId: string;
  chapterId: string | null;
  memberCount: number;
  expectedTotal: string;
  collectedTotal: string;
  outstandingTotal: string;
}

interface MemberStatementResponse {
  status: string;
  paidThroughDate: string | null;
  obligations: { id: string; status: string }[];
  payments: { sourceType: string | null }[];
  claims: { id: string; status: string }[];
}

interface DefaulterRegisterRow {
  memberId: string;
  status: string;
  contributionPlanId: string;
  consecutiveMissedCount: number;
  arrearsOwed: string;
  agingBuckets: {
    days0To30: string;
    days31To60: string;
    days61To90: string;
    days90Plus: string;
  };
}

interface DisbursementReportRow {
  claimId: string;
  memberId: string;
  phoneNumber: string;
  amountValue: string;
  approverTrail: {
    stageName: string;
    decision: string;
    actorMemberId: string;
    actorPhoneNumber?: string;
  }[];
}

// Phase 1 roadmap slice 9: Reporting (§16), Phase 1 scope only per the
// roadmap table (contribution summary, member statement, defaulter
// register, disbursement report — forecasting/solvency, income/expense
// registers, and the wallet statement are Phase 2). Every report here is a
// pure query over data earlier slices already built — no new writes, no
// new schema. Real HTTP requests, real Postgres, same style as the earlier
// e2e specs.
describe('Reporting (e2e)', () => {
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
        tx.claimStageAction.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.claimEvidence.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.claim.deleteMany({ where: { organisationId } }),
      );
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
        tx.benefitRule.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.contributionPlan.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.dependant.deleteMany({ where: { organisationId } }),
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
        tx.notification.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.member.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.chapter.deleteMany({ where: { organisationId } }),
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
    return `+233-report-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

  async function createActivePlan(adminToken: string): Promise<RuleResponse> {
    const createRes = await request(app.getHttpServer())
      .post('/contribution-plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Monthly Due',
        cadence: 'monthly',
        amountValue: '20.00',
        currency: 'GHS',
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
  ) {
    const res = await request(app.getHttpServer())
      .post(`/contribution-plans/${planId}/obligations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ memberId, dueDate })
      .expect(201);
    return res.body as { id: string };
  }

  async function payContribution(
    adminToken: string,
    memberId: string,
    fundId: string,
    amountValue: string,
  ) {
    await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ memberId, fundId, amountValue, currency: 'GHS' })
      .expect(201);
  }

  async function createChapter(
    adminToken: string,
    name: string,
  ): Promise<ChapterResponse> {
    const res = await request(app.getHttpServer())
      .post('/chapters')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name })
      .expect(201);
    return res.body as ChapterResponse;
  }

  async function assignChapter(
    adminToken: string,
    memberId: string,
    chapterId: string,
  ) {
    await request(app.getHttpServer())
      .patch(`/members/${memberId}/chapter`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ chapterId })
      .expect(200);
  }

  async function grantTreasurer(adminToken: string, memberId: string) {
    const rolesRes = await request(app.getHttpServer())
      .get('/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const treasurerRole = (rolesRes.body as RoleResponse[]).find(
      (r) => r.name === 'Treasurer',
    );
    await request(app.getHttpServer())
      .post(`/roles/${treasurerRole?.id}/assignments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ memberId })
      .expect(201);
  }

  it('contribution summary groups expected vs collected by plan and chapter', async () => {
    const admin = await registerOrganisation('Report Summary Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    const chapter = await createChapter(admin.accessToken, 'North Chapter');
    await assignChapter(
      admin.accessToken,
      member.identity.memberId,
      chapter.id,
    );
    const plan = await createActivePlan(admin.accessToken);
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
    await payContribution(
      admin.accessToken,
      member.identity.memberId,
      fund.id,
      '20.00',
    );

    const res = await request(app.getHttpServer())
      .get(`/reports/contribution-summary?planId=${plan.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const rows = res.body as ContributionSummaryRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0].chapterId).toBe(chapter.id);
    expect(rows[0].memberCount).toBe(1);
    expect(rows[0].expectedTotal).toBe('40');
    expect(rows[0].collectedTotal).toBe('20');
    expect(rows[0].outstandingTotal).toBe('20');
  });

  it('fund position trend returns 6 month-end running balances, ending with the current cash total', async () => {
    const admin = await registerOrganisation('Report Fund Trend Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    const plan = await createActivePlan(admin.accessToken);
    const fund = await createFund(admin.accessToken);

    await createPastObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      daysAgo(10),
    );
    await payContribution(
      admin.accessToken,
      member.identity.memberId,
      fund.id,
      '20.00',
    );

    // Cross-checked against the already-tested balance endpoint, not just
    // this new one's own arithmetic.
    const cashAccount = fund.ledgerAccounts.find((a) => a.name === 'Cash');
    const balanceRes = await request(app.getHttpServer())
      .get(`/ledger-accounts/${cashAccount?.id}/balance`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const currentCashBalance = (balanceRes.body as { balance: string }).balance;

    const trendRes = await request(app.getHttpServer())
      .get('/reports/fund-position-trend')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const trend = trendRes.body as { month: string; balance: string }[];
    expect(trend).toHaveLength(6);
    // Earliest month, well before this org existed, has nothing posted.
    expect(trend[0].balance).toBe('0');
    // The current month reflects everything posted so far.
    expect(trend[5].balance).toBe(currentCashBalance);
  });

  it('contributions vs. claims returns 6 real monthly totals, current month reflecting both a payment and a disbursement', async () => {
    const admin = await registerOrganisation('Report Contrib Vs Claims Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const approver = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    await grantTreasurer(admin.accessToken, approver.identity.memberId);
    const plan = await createActivePlan(admin.accessToken);
    const fund = await createFund(admin.accessToken);

    await createPastObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      daysAgo(10),
    );
    await payContribution(
      admin.accessToken,
      member.identity.memberId,
      fund.id,
      '20.00',
    );

    const ruleRes = await request(app.getHttpServer())
      .post('/benefit-rules')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: 'Bereavement Benefit',
        triggerEvent: 'member.death',
        subjectTypes: ['self'],
        amountValue: '75.00',
        currency: 'GHS',
        occurrenceCapMax: 1,
        approvalChain: ['treasurer_disburse'],
      })
      .expect(201);
    const rule = ruleRes.body as RuleResponse;
    await request(app.getHttpServer())
      .post(`/benefit-rules/${rule.id}/activate`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({})
      .expect(201);
    const claimRes = await request(app.getHttpServer())
      .post(`/benefit-rules/${rule.id}/claims`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ memberId: member.identity.memberId, eventDate: new Date().toISOString() })
      .expect(201);
    const claim = claimRes.body as { id: string };
    await request(app.getHttpServer())
      .post(`/claims/${claim.id}/decide`)
      .set('Authorization', `Bearer ${approver.accessToken}`)
      .send({ decision: 'APPROVE' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/claims/${claim.id}/disburse`)
      .set('Authorization', `Bearer ${approver.accessToken}`)
      .send({ fundId: fund.id })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/reports/contributions-vs-claims')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const rows = res.body as { month: string; contributions: string; claimsPaid: string }[];
    expect(rows).toHaveLength(6);
    // Earliest month, well before this org existed, has nothing posted.
    expect(rows[0].contributions).toBe('0');
    expect(rows[0].claimsPaid).toBe('0');
    // The current month reflects both the payment and the disbursement.
    expect(rows[5].contributions).toBe('20');
    expect(rows[5].claimsPaid).toBe('75');

    // An ordinary member without ledger:view cannot read this report.
    await request(app.getHttpServer())
      .get('/reports/contributions-vs-claims')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(403);
  });

  it("a member's statement shows payment history, claims, and a paid-through date that stops at the first gap", async () => {
    const admin = await registerOrganisation('Report Statement Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    const plan = await createActivePlan(admin.accessToken);
    const fund = await createFund(admin.accessToken);

    const older = await createPastObligation(
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
    // Only enough to pay the older obligation in full (oldest-first
    // allocation) — the newer one stays open, so paid-through should stop
    // at the older obligation's due date, not the newer one.
    await payContribution(
      admin.accessToken,
      member.identity.memberId,
      fund.id,
      '20.00',
    );

    const res = await request(app.getHttpServer())
      .get(`/members/${member.identity.memberId}/statement`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(200);
    const statement = res.body as MemberStatementResponse;
    expect(statement.obligations).toHaveLength(2);
    expect(
      statement.payments.some((p) => p.sourceType === 'contribution_payment'),
    ).toBe(true);
    const olderObligation = statement.obligations.find(
      (o) => o.id === older.id,
    );
    expect(olderObligation?.status).toBe('PAID');
    expect(statement.paidThroughDate).not.toBeNull();

    // Another ordinary member cannot read this statement.
    const otherMember = await joinOrganisation(admin.identity.organisationId);
    await request(app.getHttpServer())
      .get(`/members/${member.identity.memberId}/statement`)
      .set('Authorization', `Bearer ${otherMember.accessToken}`)
      .expect(403);
  });

  it('the defaulter register lists only DEFAULTER/SUSPENDED members with missed count and arrears', async () => {
    const admin = await registerOrganisation('Report Defaulter Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const goodMember = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    await setStatus(admin.accessToken, goodMember.identity.memberId, 'ACTIVE');
    const plan = await createActivePlan(admin.accessToken);

    await request(app.getHttpServer())
      .post('/defaulter-policy')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ defaulterThresholdMonths: 2, forfeitureThresholdMonths: 5 })
      .expect(201);

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
    await request(app.getHttpServer())
      .post(
        `/members/${member.identity.memberId}/contribution-plans/${plan.id}/reassess-standing`,
      )
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/reports/defaulter-register')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const rows = res.body as DefaulterRegisterRow[];
    expect(rows.some((r) => r.memberId === goodMember.identity.memberId)).toBe(
      false,
    );
    const row = rows.find((r) => r.memberId === member.identity.memberId);
    expect(row?.status).toBe('DEFAULTER');
    expect(row?.consecutiveMissedCount).toBe(2);
    expect(row?.arrearsOwed).toBe('40');
    // One obligation ~60 days overdue, one ~30 days overdue — aging split
    // across the 0-30 and 31-60 buckets, nothing in the deeper ones.
    expect(row?.agingBuckets).toEqual({
      days0To30: '20',
      days31To60: '20',
      days61To90: '0',
      days90Plus: '0',
    });
  });

  it('the disbursement report lists a PAID claim with its amount and approver trail', async () => {
    const admin = await registerOrganisation('Report Disbursement Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const approver = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    await grantTreasurer(admin.accessToken, approver.identity.memberId);
    const fund = await createFund(admin.accessToken);

    const ruleRes = await request(app.getHttpServer())
      .post('/benefit-rules')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: 'Bereavement Benefit',
        triggerEvent: 'member.death',
        subjectTypes: ['self'],
        amountValue: '500.00',
        currency: 'GHS',
        occurrenceCapMax: 1,
        approvalChain: ['treasurer_disburse'],
      })
      .expect(201);
    const rule = ruleRes.body as RuleResponse;
    await request(app.getHttpServer())
      .post(`/benefit-rules/${rule.id}/activate`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({})
      .expect(201);

    const claimRes = await request(app.getHttpServer())
      .post(`/benefit-rules/${rule.id}/claims`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        eventDate: new Date().toISOString(),
      })
      .expect(201);
    const claim = claimRes.body as { id: string };

    await request(app.getHttpServer())
      .post(`/claims/${claim.id}/decide`)
      .set('Authorization', `Bearer ${approver.accessToken}`)
      .send({ decision: 'APPROVE' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/claims/${claim.id}/disburse`)
      .set('Authorization', `Bearer ${approver.accessToken}`)
      .send({ fundId: fund.id })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/reports/disbursements')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const rows = res.body as DisbursementReportRow[];
    const row = rows.find((r) => r.claimId === claim.id);
    expect(row).toBeDefined();
    expect(row?.memberId).toBe(member.identity.memberId);
    expect(row?.phoneNumber).toBeTruthy();
    expect(row?.amountValue).toBe('500');
    expect(row?.approverTrail).toHaveLength(1);
    expect(row?.approverTrail[0]).toMatchObject({
      stageName: 'treasurer_disburse',
      decision: 'APPROVE',
      actorMemberId: approver.identity.memberId,
    });
    expect(typeof row?.approverTrail[0].actorPhoneNumber).toBe('string');

    // An ordinary member without ledger:view cannot read this report.
    await request(app.getHttpServer())
      .get('/reports/disbursements')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(403);
  });

  it("cross-tenant: one organisation's reports never include another's data", async () => {
    const orgA = await registerOrganisation('Report Cross-Tenant Org A');
    const memberA = await joinOrganisation(orgA.identity.organisationId);
    await setStatus(orgA.accessToken, memberA.identity.memberId, 'ACTIVE');
    const planA = await createActivePlan(orgA.accessToken);
    await createPastObligation(
      orgA.accessToken,
      planA.id,
      memberA.identity.memberId,
      daysAgo(10),
    );

    const orgB = await registerOrganisation('Report Cross-Tenant Org B');

    const summaryB = await request(app.getHttpServer())
      .get('/reports/contribution-summary')
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .expect(200);
    expect(summaryB.body as ContributionSummaryRow[]).toHaveLength(0);

    await request(app.getHttpServer())
      .get(`/members/${memberA.identity.memberId}/statement`)
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .expect(404);
  });
});
