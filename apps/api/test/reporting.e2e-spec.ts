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

interface AdvanceContributionRow {
  memberId: string;
  phoneNumber: string;
  creditBalance: string;
  nextObligation: {
    obligationId: string;
    dueDate: string;
    amountOutstanding: string;
  } | null;
}

interface ArrearsAllocationRow {
  memberId: string;
  phoneNumber: string;
  obligationId: string;
  contributionPeriod: string;
  cashCollectionDate: string;
  amount: string;
  daysLate: number;
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

interface ManualPaymentReportRow {
  journalEntryId: string;
  amountValue: string;
  memberId: string;
  memberName: string | null;
  recordedByMemberId: string;
  recordedByName: string | null;
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
      // Must go before journalLine/journalEntry/fund deletes below —
      // PaymentIntent FK-references all three (only ever created by the
      // manual-payments report test's real initiate+webhook payment, but
      // unconditionally safe to run for every org here).
      await prisma.withTenant(organisationId, (tx) =>
        tx.paymentIntent.updateMany({
          where: { organisationId },
          data: { journalEntryId: null },
        }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.paymentIntent.deleteMany({ where: { organisationId } }),
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
    const res = await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ memberId, fundId, amountValue, currency: 'GHS' })
      .expect(201);
    return res.body as { journalEntry: { id: string } };
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
      .get('/reports/contributions-vs-claims')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const rows = res.body as {
      month: string;
      contributions: string;
      claimsPaid: string;
    }[];
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
    // payContribution above is the manual/admin-attested path, not a
    // Paystack-verified one — see ObligationService.recordContributionPaymentInTx.
    expect(
      statement.payments.some(
        (p) => p.sourceType === 'contribution_payment_manual',
      ),
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

  it('the manual-payments report lists only admin-attested contributions, with who recorded each — never a Paystack-verified one', async () => {
    const admin = await registerOrganisation('Manual Payments Report Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    const fund = await createFund(admin.accessToken);
    const plan = await createActivePlan(admin.accessToken);
    await createPastObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-08-01',
    );

    // A manual attestation — the treasurer claiming they collected this
    // themselves, nothing independently confirming it.
    await payContribution(
      admin.accessToken,
      member.identity.memberId,
      fund.id,
      '20.00',
    );

    // A second member's obligation, settled the real way — initiated and
    // confirmed via the (mock) payment provider, never touching
    // /payments/contribution at all. Must NOT show up in this report.
    const memberB = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, memberB.identity.memberId, 'ACTIVE');
    await createPastObligation(
      admin.accessToken,
      plan.id,
      memberB.identity.memberId,
      '2026-08-01',
    );
    const intentRes = await request(app.getHttpServer())
      .post('/payments/contribution/initiate')
      .set('Authorization', `Bearer ${memberB.accessToken}`)
      .send({
        memberId: memberB.identity.memberId,
        fundId: fund.id,
        amountValue: '20.00',
        currency: 'GHS',
        channel: 'MOBILE_MONEY',
      })
      .expect(201);
    const intent = intentRes.body as { providerReference: string };
    await request(app.getHttpServer())
      .post('/payments/webhook')
      .send({
        organisationId: admin.identity.organisationId,
        providerReference: intent.providerReference,
        status: 'succeeded',
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/reports/manual-payments')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const rows = res.body as ManualPaymentReportRow[];

    expect(rows).toHaveLength(1);
    expect(rows[0].memberId).toBe(member.identity.memberId);
    expect(rows[0].amountValue).toBe('20');
    expect(rows[0].recordedByMemberId).toBe(admin.identity.memberId);
    expect(rows[0].recordedByName).toBe('Test Admin');
    // The real, verified payment for memberB never appears here.
    expect(rows.some((r) => r.memberId === memberB.identity.memberId)).toBe(
      false,
    );

    // An ordinary member without ledger:view cannot read this report.
    await request(app.getHttpServer())
      .get('/reports/manual-payments')
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

  it('income & expenditure statement totals a real payment and a real disbursement, and excludes a fund transfer', async () => {
    const admin = await registerOrganisation('Report I&E Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const approver = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    await grantTreasurer(admin.accessToken, approver.identity.memberId);
    const fund = await createFund(admin.accessToken);
    const secondFundRes = await request(app.getHttpServer())
      .post('/funds')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Second Fund' })
      .expect(201);
    const secondFund = secondFundRes.body as FundResponse;

    const plan = await createActivePlan(admin.accessToken);
    await createPastObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      daysAgo(5),
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
        name: 'Medical Support',
        triggerEvent: 'member.hospitalisation',
        subjectTypes: ['self'],
        amountValue: '15.00',
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

    // A fund transfer — must not show up as income or expenditure anywhere.
    await request(app.getHttpServer())
      .post(`/funds/${fund.id}/transfer`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ toFundId: secondFund.id, amountValue: '3.00' })
      .expect(201);

    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await request(app.getHttpServer())
      .get(`/reports/income-expenditure?from=${from}&to=${to}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const statement = res.body as {
      incomeLines: { accountName: string; amount: string }[];
      expenseLines: { accountName: string; amount: string }[];
      totalIncome: string;
      totalExpense: string;
      surplusOrDeficit: string;
    };
    expect(statement.totalIncome).toBe('20');
    expect(statement.totalExpense).toBe('15');
    expect(statement.surplusOrDeficit).toBe('5');
    expect(
      statement.incomeLines.some((l) => l.accountName === 'Fund Equity'),
    ).toBe(false);
    expect(
      statement.expenseLines.some((l) => l.accountName === 'Fund Equity'),
    ).toBe(false);

    // A member without ledger:view cannot read this statement.
    await request(app.getHttpServer())
      .get(`/reports/income-expenditure?from=${from}&to=${to}`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(403);
  });

  it('trial balance balances (total debit = total credit) after a real payment', async () => {
    const admin = await registerOrganisation('Report Trial Balance Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    const fund = await createFund(admin.accessToken);
    const plan = await createActivePlan(admin.accessToken);
    await createPastObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      daysAgo(5),
    );
    await payContribution(
      admin.accessToken,
      member.identity.memberId,
      fund.id,
      '20.00',
    );

    const res = await request(app.getHttpServer())
      .get('/reports/trial-balance')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const trialBalance = res.body as {
      accounts: {
        accountName: string;
        debitBalance: string;
        creditBalance: string;
      }[];
      totalDebit: string;
      totalCredit: string;
      balanced: boolean;
    };
    expect(trialBalance.balanced).toBe(true);
    expect(trialBalance.totalDebit).toBe(trialBalance.totalCredit);
    const cash = trialBalance.accounts.find((a) => a.accountName === 'Cash');
    expect(cash?.debitBalance).toBe('20');
    const income = trialBalance.accounts.find(
      (a) => a.accountName === 'Contributions Income',
    );
    expect(income?.creditBalance).toBe('20');
  });

  it("general ledger for the Cash account shows a running balance that matches the account's own balance endpoint", async () => {
    const admin = await registerOrganisation('Report General Ledger Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    const fund = await createFund(admin.accessToken);
    const plan = await createActivePlan(admin.accessToken);
    await createPastObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      daysAgo(5),
    );
    await payContribution(
      admin.accessToken,
      member.identity.memberId,
      fund.id,
      '20.00',
    );

    const cashAccount = fund.ledgerAccounts.find((a) => a.name === 'Cash');
    const balanceRes = await request(app.getHttpServer())
      .get(`/ledger-accounts/${cashAccount?.id}/balance`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const currentBalance = (balanceRes.body as { balance: string }).balance;

    const res = await request(app.getHttpServer())
      .get(`/reports/general-ledger/${cashAccount?.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const gl = res.body as {
      entries: { debit: string; credit: string; runningBalance: string }[];
      openingBalance: string;
      closingBalance: string;
    };
    expect(gl.openingBalance).toBe('0');
    expect(gl.entries).toHaveLength(1);
    expect(gl.entries[0].debit).toBe('20');
    expect(gl.entries[0].runningBalance).toBe('20');
    expect(gl.closingBalance).toBe(currentBalance);
  });

  it('advance contributions: an overshoot past the monthly-extension cap parks a real credit balance, and a zero-balance member is excluded', async () => {
    const admin = await registerOrganisation('Report Advance Contrib Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const quietMember = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    await setStatus(admin.accessToken, quietMember.identity.memberId, 'ACTIVE');
    const plan = await createActivePlan(admin.accessToken);
    const fund = await createFund(admin.accessToken);

    await createPastObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      daysAgo(5),
    );
    // Original $20 obligation + 24 months of auto-extension (the safety
    // cap) = $500 fully absorbed; the last $20 has nowhere left to go and
    // parks as a real Member.creditBalance, not a rejection.
    await payContribution(
      admin.accessToken,
      member.identity.memberId,
      fund.id,
      '520.00',
    );

    const res = await request(app.getHttpServer())
      .get('/reports/advance-contributions')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const rows = res.body as AdvanceContributionRow[];
    const row = rows.find((r) => r.memberId === member.identity.memberId);
    expect(row).toBeDefined();
    expect(row?.creditBalance).toBe('20');
    expect(row?.phoneNumber).toBeTruthy();
    // Every generated monthly obligation, including the extensions, ended
    // up fully paid — nothing left open to report as "next".
    expect(row?.nextObligation).toBeNull();

    expect(rows.some((r) => r.memberId === quietMember.identity.memberId)).toBe(
      false,
    );

    await request(app.getHttpServer())
      .get('/reports/advance-contributions')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(403);
  });

  it('arrears allocation distinguishes the contribution period from the real, later cash-collection date', async () => {
    const admin = await registerOrganisation('Report Arrears Allocation Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    const plan = await createActivePlan(admin.accessToken);
    const fund = await createFund(admin.accessToken);

    // Due 30 days ago, paid just now — a genuinely late payment.
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
      .get(`/reports/arrears-allocation?memberId=${member.identity.memberId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const rows = res.body as ArrearsAllocationRow[];
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.amount).toBe('20');
    expect(row.phoneNumber).toBeTruthy();
    const contributionPeriod = new Date(row.contributionPeriod).getTime();
    const cashCollectionDate = new Date(row.cashCollectionDate).getTime();
    expect(cashCollectionDate).toBeGreaterThan(contributionPeriod);
    expect(row.daysLate).toBeGreaterThanOrEqual(29);

    await request(app.getHttpServer())
      .get('/reports/arrears-allocation')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(403);
  });

  it('benefit expenditure analytics buckets claims by status and only counts PAID ones toward totals', async () => {
    const admin = await registerOrganisation('Report Benefit Expenditure Org');
    const submittedMember = await joinOrganisation(
      admin.identity.organisationId,
    );
    const approvedMember = await joinOrganisation(
      admin.identity.organisationId,
    );
    const paidMember = await joinOrganisation(admin.identity.organisationId);
    const rejectedMember = await joinOrganisation(
      admin.identity.organisationId,
    );
    const approver = await joinOrganisation(admin.identity.organisationId);
    for (const m of [
      submittedMember,
      approvedMember,
      paidMember,
      rejectedMember,
    ]) {
      await setStatus(admin.accessToken, m.identity.memberId, 'ACTIVE');
    }
    await grantTreasurer(admin.accessToken, approver.identity.memberId);
    const fund = await createFund(admin.accessToken);

    const ruleRes = await request(app.getHttpServer())
      .post('/benefit-rules')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: 'Medical Support',
        triggerEvent: 'member.hospitalisation',
        subjectTypes: ['self'],
        amountValue: '50.00',
        currency: 'GHS',
        occurrenceCapMax: 10,
        approvalChain: ['treasurer_disburse'],
      })
      .expect(201);
    const rule = ruleRes.body as RuleResponse;
    await request(app.getHttpServer())
      .post(`/benefit-rules/${rule.id}/activate`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({})
      .expect(201);

    const submitClaim = async (memberToken: string, memberId: string) => {
      const claimRes = await request(app.getHttpServer())
        .post(`/benefit-rules/${rule.id}/claims`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ memberId, eventDate: new Date().toISOString() })
        .expect(201);
      return (claimRes.body as { id: string }).id;
    };

    await submitClaim(
      submittedMember.accessToken,
      submittedMember.identity.memberId,
    );

    const approvedClaimId = await submitClaim(
      approvedMember.accessToken,
      approvedMember.identity.memberId,
    );
    await request(app.getHttpServer())
      .post(`/claims/${approvedClaimId}/decide`)
      .set('Authorization', `Bearer ${approver.accessToken}`)
      .send({ decision: 'APPROVE' })
      .expect(201);

    const paidClaimId = await submitClaim(
      paidMember.accessToken,
      paidMember.identity.memberId,
    );
    await request(app.getHttpServer())
      .post(`/claims/${paidClaimId}/decide`)
      .set('Authorization', `Bearer ${approver.accessToken}`)
      .send({ decision: 'APPROVE' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/claims/${paidClaimId}/disburse`)
      .set('Authorization', `Bearer ${approver.accessToken}`)
      .send({ fundId: fund.id })
      .expect(201);

    const rejectedClaimId = await submitClaim(
      rejectedMember.accessToken,
      rejectedMember.identity.memberId,
    );
    await request(app.getHttpServer())
      .post(`/claims/${rejectedClaimId}/decide`)
      .set('Authorization', `Bearer ${approver.accessToken}`)
      .send({ decision: 'REJECT' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/reports/benefit-expenditure')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const analytics = res.body as {
      byBenefitType: {
        benefitRuleId: string;
        totalPaid: string;
        beneficiaryCount: number;
        averageBenefit: string;
        statusCounts: {
          submitted: number;
          approved: number;
          rejected: number;
          paid: number;
        };
      }[];
      totalBenefitsPaid: string;
    };
    const group = analytics.byBenefitType.find(
      (g) => g.benefitRuleId === rule.id,
    );
    expect(group).toBeDefined();
    expect(group?.statusCounts).toEqual({
      submitted: 1,
      approved: 1,
      rejected: 1,
      paid: 1,
    });
    expect(group?.totalPaid).toBe('50');
    expect(group?.beneficiaryCount).toBe(1);
    expect(group?.averageBenefit).toBe('50');

    await request(app.getHttpServer())
      .get('/reports/benefit-expenditure')
      .set('Authorization', `Bearer ${submittedMember.accessToken}`)
      .expect(403);
  });

  it('financial health computes collection/arrears rates and lands on the documented At Risk boundary (50% collected, 50% arrears)', async () => {
    const admin = await registerOrganisation('Report Financial Health Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    const plan = await createActivePlan(admin.accessToken);
    const fund = await createFund(admin.accessToken);

    // Two $20 obligations due in-window; only the older is paid
    // (allocation is always oldest-first) — 50% collected, 50% arrears.
    await createPastObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      daysAgo(10),
    );
    await createPastObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      daysAgo(5),
    );
    await payContribution(
      admin.accessToken,
      member.identity.memberId,
      fund.id,
      '20.00',
    );

    const from = daysAgo(20);
    const to = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await request(app.getHttpServer())
      .get(`/reports/financial-health?from=${from}&to=${to}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const health = res.body as {
      collectionRate: string | null;
      arrearsRate: string | null;
      financialHealth: string;
      expenseRatio: string | null;
      administrativeCostRatio: string | null;
      notAvailable: string | null;
    };
    expect(health.collectionRate).toBe('50');
    expect(health.arrearsRate).toBe('50');
    expect(health.financialHealth).toBe('At Risk');
    expect(health.expenseRatio).toBeNull();
    expect(health.administrativeCostRatio).toBeNull();
    expect(health.notAvailable).toContain('administrative');

    await request(app.getHttpServer())
      .get('/reports/financial-health')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(403);
  });

  it('financial health: creating an isAdministrative account turns the ratio gate on, even with zero activity on it', async () => {
    const admin = await registerOrganisation(
      'Report Financial Health Admin Account Org',
    );
    const member = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    const plan = await createActivePlan(admin.accessToken);
    const fund = await createFund(admin.accessToken);
    await createPastObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      daysAgo(5),
    );
    await payContribution(
      admin.accessToken,
      member.identity.memberId,
      fund.id,
      '20.00',
    );

    const before = await request(app.getHttpServer())
      .get('/reports/financial-health')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(
      (before.body as { expenseRatio: string | null }).expenseRatio,
    ).toBeNull();
    expect(
      (before.body as { notAvailable: string | null }).notAvailable,
    ).not.toBeNull();

    await request(app.getHttpServer())
      .post(`/funds/${fund.id}/accounts`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: 'Administrative Expenses',
        type: 'EXPENSE',
        isAdministrative: true,
      })
      .expect(201);

    const after = await request(app.getHttpServer())
      .get('/reports/financial-health')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const health = after.body as {
      expenseRatio: string | null;
      administrativeCostRatio: string | null;
      notAvailable: string | null;
    };
    // The account exists but nothing has ever posted to it — '0', not
    // null: the gate is "does this category exist," not "does it have a
    // balance."
    expect(health.expenseRatio).toBe('0');
    expect(health.administrativeCostRatio).toBe('0');
    expect(health.notAvailable).toBeNull();
  });

  it('cash flow statement categorizes Cash movements into operating/financing, nets a consolidated transfer to zero, and reconciles', async () => {
    const admin = await registerOrganisation('Report Cash Flow Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const approver = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    await grantTreasurer(admin.accessToken, approver.identity.memberId);
    const fund = await createFund(admin.accessToken);
    const secondFundRes = await request(app.getHttpServer())
      .post('/funds')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Second Fund' })
      .expect(201);
    const secondFund = secondFundRes.body as FundResponse;

    const plan = await createActivePlan(admin.accessToken);
    await createPastObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      daysAgo(5),
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
        name: 'Medical Support',
        triggerEvent: 'member.hospitalisation',
        subjectTypes: ['self'],
        amountValue: '15.00',
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

    await request(app.getHttpServer())
      .post(`/funds/${fund.id}/transfer`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ toFundId: secondFund.id, amountValue: '3.00' })
      .expect(201);

    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const consolidatedRes = await request(app.getHttpServer())
      .get(`/reports/cash-flow?from=${from}&to=${to}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const consolidated = consolidatedRes.body as {
      operating: { inflow: string; outflow: string };
      financing: { inflow: string; outflow: string };
      investing: { inflow: string; outflow: string };
      openingCash: string;
      closingCash: string;
      netCashMovement: string;
      reconciles: boolean;
    };
    expect(consolidated.operating.inflow).toBe('20');
    expect(consolidated.operating.outflow).toBe('15');
    // Both funds' Cash accounts are in scope here, so the transfer's out
    // and in legs both count — net zero, matching §31's elimination rule.
    expect(consolidated.financing.inflow).toBe('3');
    expect(consolidated.financing.outflow).toBe('3');
    expect(consolidated.investing.inflow).toBe('0');
    expect(consolidated.openingCash).toBe('0');
    expect(consolidated.closingCash).toBe('5');
    expect(consolidated.netCashMovement).toBe('5');
    expect(consolidated.reconciles).toBe(true);

    const singleFundRes = await request(app.getHttpServer())
      .get(`/reports/cash-flow?fundId=${fund.id}&from=${from}&to=${to}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const singleFund = singleFundRes.body as {
      financing: { inflow: string; outflow: string };
      closingCash: string;
      reconciles: boolean;
    };
    // For this one fund, the transfer is a real outflow, not netted away.
    expect(singleFund.financing.inflow).toBe('0');
    expect(singleFund.financing.outflow).toBe('3');
    expect(singleFund.closingCash).toBe('2');
    expect(singleFund.reconciles).toBe(true);

    await request(app.getHttpServer())
      .get(`/reports/cash-flow?from=${from}&to=${to}`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(403);
  });

  it('fund position report shows per-fund figures honestly and rolls committed-but-unpaid benefits up organisation-wide, not per fund', async () => {
    const admin = await registerOrganisation('Report Fund Position Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const approver = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    await grantTreasurer(admin.accessToken, approver.identity.memberId);
    const fund = await createFund(admin.accessToken);
    const secondFundRes = await request(app.getHttpServer())
      .post('/funds')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Second Fund' })
      .expect(201);
    const secondFund = secondFundRes.body as FundResponse;

    const plan = await createActivePlan(admin.accessToken);
    await createPastObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      daysAgo(5),
    );
    await payContribution(
      admin.accessToken,
      member.identity.memberId,
      fund.id,
      '20.00',
    );

    const paidRuleRes = await request(app.getHttpServer())
      .post('/benefit-rules')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: 'Medical Support',
        triggerEvent: 'member.hospitalisation',
        subjectTypes: ['self'],
        amountValue: '15.00',
        currency: 'GHS',
        occurrenceCapMax: 1,
        approvalChain: ['treasurer_disburse'],
      })
      .expect(201);
    const paidRule = paidRuleRes.body as RuleResponse;
    await request(app.getHttpServer())
      .post(`/benefit-rules/${paidRule.id}/activate`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({})
      .expect(201);
    const paidClaimRes = await request(app.getHttpServer())
      .post(`/benefit-rules/${paidRule.id}/claims`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        eventDate: new Date().toISOString(),
      })
      .expect(201);
    const paidClaim = paidClaimRes.body as { id: string };
    await request(app.getHttpServer())
      .post(`/claims/${paidClaim.id}/decide`)
      .set('Authorization', `Bearer ${approver.accessToken}`)
      .send({ decision: 'APPROVE' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/claims/${paidClaim.id}/disburse`)
      .set('Authorization', `Bearer ${approver.accessToken}`)
      .send({ fundId: fund.id })
      .expect(201);

    // Approved but never disbursed — committed, unattributable to a fund.
    const committedRuleRes = await request(app.getHttpServer())
      .post('/benefit-rules')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: 'Bereavement Support',
        triggerEvent: 'member.death',
        subjectTypes: ['self'],
        amountValue: '25.00',
        currency: 'GHS',
        occurrenceCapMax: 1,
        approvalChain: ['treasurer_disburse'],
      })
      .expect(201);
    const committedRule = committedRuleRes.body as RuleResponse;
    await request(app.getHttpServer())
      .post(`/benefit-rules/${committedRule.id}/activate`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({})
      .expect(201);
    const committedClaimRes = await request(app.getHttpServer())
      .post(`/benefit-rules/${committedRule.id}/claims`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        eventDate: new Date().toISOString(),
      })
      .expect(201);
    const committedClaim = committedClaimRes.body as { id: string };
    await request(app.getHttpServer())
      .post(`/claims/${committedClaim.id}/decide`)
      .set('Authorization', `Bearer ${approver.accessToken}`)
      .send({ decision: 'APPROVE' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/funds/${fund.id}/transfer`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ toFundId: secondFund.id, amountValue: '3.00' })
      .expect(201);

    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await request(app.getHttpServer())
      .get(`/reports/fund-position?from=${from}&to=${to}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const report = res.body as {
      funds: {
        fundId: string;
        income: string;
        expenses: string;
        transfersIn: string;
        transfersOut: string;
        surplusOrDeficit: string;
        cashAvailable: string;
      }[];
      organisationSummary: {
        totalCashAvailable: string;
        totalCommittedBenefits: string;
        availableUncommittedFunds: string;
        note: string;
      };
    };

    const fundRow = report.funds.find((f) => f.fundId === fund.id);
    expect(fundRow?.income).toBe('20');
    expect(fundRow?.expenses).toBe('15');
    expect(fundRow?.transfersOut).toBe('3');
    expect(fundRow?.surplusOrDeficit).toBe('5');
    expect(fundRow?.cashAvailable).toBe('2');

    const secondFundRow = report.funds.find((f) => f.fundId === secondFund.id);
    expect(secondFundRow?.transfersIn).toBe('3');
    expect(secondFundRow?.cashAvailable).toBe('3');

    // The committed-but-unpaid Bereavement claim (GHS 25) is real, but
    // shows up organisation-wide only — it was never attributed to
    // either fund, because no fund was chosen for it yet.
    expect(report.organisationSummary.totalCommittedBenefits).toBe('25');
    expect(report.organisationSummary.totalCashAvailable).toBe('5');
    expect(report.organisationSummary.availableUncommittedFunds).toBe('-20');
    expect(report.organisationSummary.note.length).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .get(`/reports/fund-position?from=${from}&to=${to}`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(403);
  });

  it('reversals & adjustments links a reversal to its original and nets it out of Contributions Income collection', async () => {
    const admin = await registerOrganisation('Report Reversals Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    const plan = await createActivePlan(admin.accessToken);
    const fund = await createFund(admin.accessToken);
    await createPastObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      daysAgo(5),
    );
    const payment = await payContribution(
      admin.accessToken,
      member.identity.memberId,
      fund.id,
      '20.00',
    );

    await request(app.getHttpServer())
      .post(`/journal-entries/${payment.journalEntry.id}/reverse`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ reason: 'Member paid in error' })
      .expect(201);

    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await request(app.getHttpServer())
      .get(`/reports/reversals?from=${from}&to=${to}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const report = res.body as {
      reversals: {
        journalEntryId: string;
        originalEntryId: string | null;
        amount: string;
      }[];
      grossCollection: string;
      reversalsTotal: string;
      netCollection: string;
    };
    expect(report.reversals).toHaveLength(1);
    expect(report.reversals[0].originalEntryId).toBe(payment.journalEntry.id);
    expect(report.reversals[0].amount).toBe('20');
    expect(report.grossCollection).toBe('20');
    expect(report.reversalsTotal).toBe('20');
    expect(report.netCollection).toBe('0');

    await request(app.getHttpServer())
      .get(`/reports/reversals?from=${from}&to=${to}`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(403);
  });
});
