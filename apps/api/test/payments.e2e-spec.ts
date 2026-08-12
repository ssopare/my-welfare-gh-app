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

interface FundResponse {
  id: string;
  ledgerAccounts: { id: string; name: string; type: string }[];
}

interface ObligationResponse {
  id: string;
  status: string;
  amountPaid: string;
}

interface PaymentIntentResponse {
  id: string;
  providerReference: string;
  status: string;
  journalEntryId: string | null;
}

interface WebhookResponse {
  outcome: string;
  journalEntryId?: string;
  intentStatus?: string;
}

interface BalanceResponse {
  balance: string;
}

interface ReconciliationExceptionResponse {
  id: string;
  providerReference: string;
  reason: string;
  resolvedAt: string | null;
}

// Phase 1 roadmap slice 5: payments (§8.8, §15) — mobile money/card/bank
// transfer collection via a provider abstraction (MockPaymentProvider,
// since no live aggregator credentials exist for this project), and the
// idempotent webhook reconciliation FR-PAY-04 requires. Real HTTP
// requests, real Postgres, same style as the earlier e2e specs.
describe('Payments (e2e)', () => {
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
        tx.reconciliationException.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.paymentIntent.updateMany({
          where: { organisationId },
          data: { journalEntryId: null },
        }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.journalLine.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.paymentIntent.deleteMany({ where: { organisationId } }),
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
        tx.dependant.deleteMany({ where: { organisationId } }),
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
    return `+233-pay-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
    amountValue: string,
    cadence: string = 'monthly',
  ): Promise<RuleResponse> {
    const createRes = await request(app.getHttpServer())
      .post('/contribution-plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: cadence === 'monthly' ? 'Monthly Due' : 'One-Time Contribution',
        cadence,
        amountValue,
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

  async function createObligation(
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

  async function initiatePayment(
    token: string,
    memberId: string,
    fundId: string,
    amountValue: string,
    obligationIds?: string[],
  ): Promise<PaymentIntentResponse> {
    const res = await request(app.getHttpServer())
      .post('/payments/contribution/initiate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        memberId,
        fundId,
        amountValue,
        currency: 'GHS',
        channel: 'MOBILE_MONEY',
        obligationIds,
      })
      .expect(201);
    return res.body as PaymentIntentResponse;
  }

  async function fireWebhook(
    organisationId: string,
    providerReference: string,
    status: 'succeeded' | 'failed',
  ): Promise<WebhookResponse> {
    const res = await request(app.getHttpServer())
      .post('/payments/webhook')
      .send({ organisationId, providerReference, status })
      .expect(201);
    return res.body as WebhookResponse;
  }

  it('the full loop: initiate → webhook → ledger posting → obligation settled', async () => {
    const admin = await registerOrganisation('Payments Full Loop Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);
    const plan = await createActivePlan(admin.accessToken, '25.00');
    const obligation = await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-09-01',
    );

    const intent = await initiatePayment(
      member.accessToken,
      member.identity.memberId,
      fund.id,
      '25.00',
    );
    expect(intent.status).toBe('INITIATED');
    expect(intent.providerReference.startsWith('mock_')).toBe(true);
    expect(intent.journalEntryId).toBeNull();

    const webhookRes = await fireWebhook(
      admin.identity.organisationId,
      intent.providerReference,
      'succeeded',
    );
    expect(webhookRes.outcome).toBe('succeeded');
    expect(webhookRes.journalEntryId).toEqual(expect.any(String));

    const cashAccount = fund.ledgerAccounts.find((a) => a.name === 'Cash');
    const balanceRes = await request(app.getHttpServer())
      .get(`/ledger-accounts/${cashAccount?.id}/balance`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect((balanceRes.body as BalanceResponse).balance).toBe('25');

    const obligationsRes = await request(app.getHttpServer())
      .get(`/members/${member.identity.memberId}/obligations`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const updated = (obligationsRes.body as ObligationResponse[]).find(
      (o) => o.id === obligation.id,
    );
    expect(updated?.status).toBe('PAID');
  });

  it('member_selected: the obligation choice made at initiate time survives to the webhook and is what actually gets paid', async () => {
    const admin = await registerOrganisation('Payments Member Selected Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);
    const plan = await createActivePlan(admin.accessToken, '15.00', 'one_time');
    const older = await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-06-01',
    );
    const chosen = await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-07-01',
    );

    await request(app.getHttpServer())
      .patch('/organisation')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ paymentAllocationPolicy: 'member_selected' })
      .expect(200);

    // Deliberately pays the newer one, skipping the older obligation —
    // the whole point of member_selected.
    const intent = await initiatePayment(
      member.accessToken,
      member.identity.memberId,
      fund.id,
      '15.00',
      [chosen.id],
    );

    const webhookRes = await fireWebhook(
      admin.identity.organisationId,
      intent.providerReference,
      'succeeded',
    );
    expect(webhookRes.outcome).toBe('succeeded');

    const obligationsRes = await request(app.getHttpServer())
      .get(`/members/${member.identity.memberId}/obligations`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const byId = new Map(
      (obligationsRes.body as ObligationResponse[]).map((o) => [o.id, o]),
    );
    expect(byId.get(chosen.id)?.status).toBe('PAID');
    expect(byId.get(older.id)?.status).not.toBe('PAID');
    expect(byId.get(older.id)?.amountPaid).toBe('0');
  });

  it('a repeat webhook delivery is a no-op, never a double-post', async () => {
    const admin = await registerOrganisation('Payments Idempotency Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);
    const plan = await createActivePlan(admin.accessToken, '10.00');
    await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-09-01',
    );

    const intent = await initiatePayment(
      admin.accessToken,
      member.identity.memberId,
      fund.id,
      '10.00',
    );

    const first = await fireWebhook(
      admin.identity.organisationId,
      intent.providerReference,
      'succeeded',
    );
    expect(first.outcome).toBe('succeeded');

    const second = await fireWebhook(
      admin.identity.organisationId,
      intent.providerReference,
      'succeeded',
    );
    expect(second.outcome).toBe('already_processed');
    expect(second.intentStatus).toBe('SUCCEEDED');

    const cashAccount = fund.ledgerAccounts.find((a) => a.name === 'Cash');
    const balanceRes = await request(app.getHttpServer())
      .get(`/ledger-accounts/${cashAccount?.id}/balance`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    // Not 20 — the second delivery must not have posted a second entry.
    expect((balanceRes.body as BalanceResponse).balance).toBe('10');
  });

  it('a failed webhook marks the intent FAILED and posts nothing', async () => {
    const admin = await registerOrganisation('Payments Failure Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);
    const plan = await createActivePlan(admin.accessToken, '10.00');
    const obligation = await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-09-01',
    );

    const intent = await initiatePayment(
      admin.accessToken,
      member.identity.memberId,
      fund.id,
      '10.00',
    );
    const webhookRes = await fireWebhook(
      admin.identity.organisationId,
      intent.providerReference,
      'failed',
    );
    expect(webhookRes.outcome).toBe('failed');

    const obligationsRes = await request(app.getHttpServer())
      .get(`/members/${member.identity.memberId}/obligations`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const unchanged = (obligationsRes.body as ObligationResponse[]).find(
      (o) => o.id === obligation.id,
    );
    expect(unchanged?.status).not.toBe('PAID');
    expect(unchanged?.amountPaid).toBe('0');
  });

  it('an unmatched webhook creates a reconciliation exception an admin can list and resolve', async () => {
    const admin = await registerOrganisation('Payments Unmatched Org');

    await fireWebhook(
      admin.identity.organisationId,
      'never-initiated-reference',
      'succeeded',
    );

    const listRes = await request(app.getHttpServer())
      .get('/reconciliation-exceptions')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const exceptions = listRes.body as ReconciliationExceptionResponse[];
    const match = exceptions.find(
      (e) => e.providerReference === 'never-initiated-reference',
    );
    expect(match).toBeDefined();
    expect(match?.resolvedAt).toBeNull();

    const resolveRes = await request(app.getHttpServer())
      .patch(`/reconciliation-exceptions/${match?.id}/resolve`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(
      (resolveRes.body as ReconciliationExceptionResponse).resolvedAt,
    ).not.toBeNull();
  });

  it('flags a conflict when a webhook reports an outcome that contradicts an already-recorded one', async () => {
    const admin = await registerOrganisation('Payments Conflict Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);
    const plan = await createActivePlan(admin.accessToken, '10.00');
    await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-09-01',
    );

    const intent = await initiatePayment(
      admin.accessToken,
      member.identity.memberId,
      fund.id,
      '10.00',
    );
    await fireWebhook(
      admin.identity.organisationId,
      intent.providerReference,
      'failed',
    );
    // A later delivery claims the opposite outcome — a real anomaly.
    await fireWebhook(
      admin.identity.organisationId,
      intent.providerReference,
      'succeeded',
    );

    const listRes = await request(app.getHttpServer())
      .get('/reconciliation-exceptions')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const exceptions = listRes.body as ReconciliationExceptionResponse[];
    expect(
      exceptions.some((e) => e.providerReference === intent.providerReference),
    ).toBe(true);
  });

  it('a member can initiate their own payment; cannot initiate for another member without admin', async () => {
    const admin = await registerOrganisation('Payments Self-Or-Admin Org');
    const memberA = await joinOrganisation(admin.identity.organisationId);
    const memberB = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);

    await request(app.getHttpServer())
      .post('/payments/contribution/initiate')
      .set('Authorization', `Bearer ${memberA.accessToken}`)
      .send({
        memberId: memberB.identity.memberId,
        fundId: fund.id,
        amountValue: '10.00',
        currency: 'GHS',
        channel: 'MOBILE_MONEY',
      })
      .expect(403);
  });

  it('reconciliation exceptions are admin-only to view or resolve', async () => {
    const admin = await registerOrganisation(
      'Payments Exceptions Admin-Only Org',
    );
    const member = await joinOrganisation(admin.identity.organisationId);

    await request(app.getHttpServer())
      .get('/reconciliation-exceptions')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(403);
  });

  it("cross-tenant: a webhook claiming another organisation's providerReference is treated as unmatched, not leaked", async () => {
    const orgA = await registerOrganisation('Payments Cross-Tenant Org A');
    const memberA = await joinOrganisation(orgA.identity.organisationId);
    const fundA = await createFund(orgA.accessToken);
    const orgB = await registerOrganisation('Payments Cross-Tenant Org B');

    const intentA = await initiatePayment(
      orgA.accessToken,
      memberA.identity.memberId,
      fundA.id,
      '10.00',
    );

    // orgB's admin fires a webhook claiming orgB but using orgA's real
    // providerReference — RLS means this can never find orgA's row.
    const webhookRes = await fireWebhook(
      orgB.identity.organisationId,
      intentA.providerReference,
      'succeeded',
    );
    expect(webhookRes.outcome).toBe('unmatched');

    const orgBExceptions = await request(app.getHttpServer())
      .get('/reconciliation-exceptions')
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .expect(200);
    expect(
      (orgBExceptions.body as ReconciliationExceptionResponse[]).some(
        (e) => e.providerReference === intentA.providerReference,
      ),
    ).toBe(true);

    // orgA's own intent is untouched — still INITIATED, not SUCCEEDED.
    const intentACheck = await request(app.getHttpServer())
      .get(`/payment-intents/${intentA.id}`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .expect(200);
    expect((intentACheck.body as PaymentIntentResponse).status).toBe(
      'INITIATED',
    );
  });

  it('the activity feed is visible to any member (not just admin/self), sourced from the real ledger', async () => {
    const admin = await registerOrganisation('Activity Feed Org');
    const payer = await joinOrganisation(admin.identity.organisationId);
    const onlooker = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);
    const plan = await createActivePlan(admin.accessToken, '20.00');
    await createObligation(
      admin.accessToken,
      plan.id,
      payer.identity.memberId,
      '2026-09-01',
    );

    const intent = await initiatePayment(
      payer.accessToken,
      payer.identity.memberId,
      fund.id,
      '20.00',
    );
    await fireWebhook(
      admin.identity.organisationId,
      intent.providerReference,
      'succeeded',
    );

    // A different, uninvolved member of the same org can see it — the
    // whole point of this endpoint (see PaymentService.listActivity).
    const activityRes = await request(app.getHttpServer())
      .get('/payments/activity')
      .set('Authorization', `Bearer ${onlooker.accessToken}`)
      .expect(200);
    const activity = activityRes.body as {
      credit: string;
      obligation: {
        contributionPlan: { name: string; cadence: string };
        member: { account: { name: string | null; phoneNumber: string } };
      };
    }[];
    const entry = activity.find((a) => a.credit === '20');
    expect(entry).toBeDefined();
    expect(entry?.obligation.contributionPlan.name).toBe('Monthly Due');
    expect(entry?.obligation.member.account.name).toBe('Test Member');

    // A member of a different org never sees it — still tenant-isolated;
    // this org has posted no payments of its own, so its feed is empty.
    const otherOrg = await registerOrganisation('Activity Feed Other Org');
    const otherOrgActivity = await request(app.getHttpServer())
      .get('/payments/activity')
      .set('Authorization', `Bearer ${otherOrg.accessToken}`)
      .expect(200);
    expect(otherOrgActivity.body).toEqual([]);
  });
});
