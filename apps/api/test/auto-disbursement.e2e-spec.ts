import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
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
}

interface PaymentIntentResponse {
  id: string;
  providerReference: string;
  status: string;
}

interface WebhookResponse {
  outcome: string;
  autoDisbursementId?: string;
}

interface TransferWebhookResponse {
  outcome: string;
  status?: string;
  journalEntryId?: string;
}

interface BalanceResponse {
  balance: string;
}

interface SettlementAccountResponse {
  verified: boolean;
  providerRecipientCode: string;
}

interface SubscriptionPlanResponse {
  id: string;
  platformFeePercentage: string;
}

interface ReconciliationExceptionResponse {
  id: string;
  reason: string;
}

// Real Paystack MoMo auto-disbursement — see PayoutService.
// triggerAutoDisbursementIfEnabledInTx/handleTransferWebhook. Real HTTP
// requests, real Postgres, MockTransferProvider (TRANSFER_PROVIDER=mock
// is forced in jest-e2e-setup.ts), same style as the earlier e2e specs.
describe('Auto-disbursement (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdOrgIds: string[] = [];
  const createdAccountIds: string[] = [];
  const createdOperatorIds: string[] = [];
  const createdPlanIds: string[] = [];

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
      // Must go before fund/paymentIntent deletes below — both are
      // ON DELETE RESTRICT from auto_disbursements.
      await prisma.withTenant(organisationId, (tx) =>
        tx.autoDisbursement.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.reconciliationException.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.settlementAccount.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.fundControlPolicy.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.roleAssignment.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.role.deleteMany({ where: { organisationId } }),
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
        tx.memberStatusChange.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.notification.deleteMany({ where: { organisationId } }),
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
    for (const planId of createdPlanIds) {
      await prisma.subscriptionPlan.delete({ where: { id: planId } });
    }
    for (const operatorId of createdOperatorIds) {
      await prisma.platformOperator.delete({ where: { id: operatorId } });
    }
    await app.close();
  });

  function uniquePhone() {
    return `+233-autodis-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function uniqueEmail() {
    return `operator-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  async function me(accessToken: string): Promise<MeResponse> {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    return res.body as MeResponse;
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
  ): Promise<RuleResponse> {
    const createRes = await request(app.getHttpServer())
      .post('/contribution-plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Monthly Due',
        cadence: 'monthly',
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

  async function payAndConfirm(
    memberToken: string,
    organisationId: string,
    memberId: string,
    fundId: string,
    amountValue: string,
  ): Promise<WebhookResponse> {
    const intentRes = await request(app.getHttpServer())
      .post('/payments/contribution/initiate')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        memberId,
        fundId,
        amountValue,
        currency: 'GHS',
        channel: 'MOBILE_MONEY',
      })
      .expect(201);
    const intent = intentRes.body as PaymentIntentResponse;

    const webhookRes = await request(app.getHttpServer())
      .post('/payments/webhook')
      .send({
        organisationId,
        providerReference: intent.providerReference,
        status: 'succeeded',
      })
      .expect(201);
    return webhookRes.body as WebhookResponse;
  }

  async function setAutoDisbursement(
    adminToken: string,
    autoDisbursement: boolean,
  ) {
    await request(app.getHttpServer())
      .post('/payouts/policy')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        dailyLimitValue: '10000.00',
        monthlyLimitValue: '50000.00',
        thresholdOneApproverValue: '500.00',
        thresholdTwoApproversValue: '5000.00',
        autoDisbursement,
      })
      .expect(201);
  }

  async function createVerifiedSettlementAccount(adminToken: string) {
    const res = await request(app.getHttpServer())
      .post('/payouts/settlement-account')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        momoProvider: 'mtn',
        phoneNumber: '0559998887',
        accountName: 'Test Welfare Org',
      })
      .expect(201);
    return res.body as SettlementAccountResponse;
  }

  async function createPlatformOperator(): Promise<{
    accessToken: string;
    operatorId: string;
  }> {
    const email = uniqueEmail();
    const password = 'operator-password-123';
    const passwordHash = await bcrypt.hash(password, 12);
    const operator = await prisma.platformOperator.create({
      data: { email, passwordHash },
    });
    createdOperatorIds.push(operator.id);

    const res = await request(app.getHttpServer())
      .post('/platform/auth/login')
      .send({ email, password })
      .expect(201);
    return {
      accessToken: (res.body as AccessTokenResponse).accessToken,
      operatorId: operator.id,
    };
  }

  async function createPlanWithFee(
    operatorToken: string,
    platformFeePercentage: string,
  ): Promise<SubscriptionPlanResponse> {
    const res = await request(app.getHttpServer())
      .post('/platform/subscription-plans')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        name: 'Standard',
        priceAmount: '50.00',
        currency: 'GHS',
        billingCadence: 'monthly',
        platformFeePercentage,
      })
      .expect(201);
    const plan = res.body as SubscriptionPlanResponse;
    createdPlanIds.push(plan.id);
    return plan;
  }

  async function subscribeToPlan(adminToken: string, planId: string) {
    await request(app.getHttpServer())
      .post('/subscription/convert')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ planId })
      .expect(201);
  }

  async function fireTransferWebhook(
    organisationId: string,
    providerReference: string,
    status: 'succeeded' | 'failed',
  ): Promise<TransferWebhookResponse> {
    const res = await request(app.getHttpServer())
      .post('/payments/transfers/webhook')
      .send({ organisationId, providerReference, status })
      .expect(201);
    return res.body as TransferWebhookResponse;
  }

  it('does nothing when autoDisbursement is off — zero behavior change for an org that never opts in', async () => {
    const admin = await registerOrganisation('Auto-Disbursement Off Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);
    const plan = await createActivePlan(admin.accessToken, '25.00');
    await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-09-01',
    );

    const result = await payAndConfirm(
      member.accessToken,
      admin.identity.organisationId,
      member.identity.memberId,
      fund.id,
      '25.00',
    );
    expect(result.outcome).toBe('succeeded');
    expect(result.autoDisbursementId).toBeUndefined();

    const rows = await prisma.withTenant(admin.identity.organisationId, (tx) =>
      tx.autoDisbursement.findMany({
        where: { organisationId: admin.identity.organisationId },
      }),
    );
    expect(rows).toHaveLength(0);
  });

  it('only an admin can toggle autoDisbursement; enabling it without a settlement account still disburses nothing', async () => {
    const admin = await registerOrganisation(
      'Auto-Disbursement No Settlement Org',
    );
    const member = await joinOrganisation(admin.identity.organisationId);

    await request(app.getHttpServer())
      .post('/payouts/policy')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({
        dailyLimitValue: '10000.00',
        monthlyLimitValue: '50000.00',
        thresholdOneApproverValue: '500.00',
        thresholdTwoApproversValue: '5000.00',
        autoDisbursement: true,
      })
      .expect(403);

    await setAutoDisbursement(admin.accessToken, true);

    const fund = await createFund(admin.accessToken);
    const plan = await createActivePlan(admin.accessToken, '25.00');
    await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-09-01',
    );
    const result = await payAndConfirm(
      member.accessToken,
      admin.identity.organisationId,
      member.identity.memberId,
      fund.id,
      '25.00',
    );
    expect(result.autoDisbursementId).toBeUndefined();

    const rows = await prisma.withTenant(admin.identity.organisationId, (tx) =>
      tx.autoDisbursement.findMany({
        where: { organisationId: admin.identity.organisationId },
      }),
    );
    expect(rows).toHaveLength(0);
  });

  it("computes the platform fee from the org's subscription plan and creates a PENDING disbursement", async () => {
    const operator = await createPlatformOperator();
    const plan = await createPlanWithFee(operator.accessToken, '5.00');
    const admin = await registerOrganisation('Auto-Disbursement Fee Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    await subscribeToPlan(admin.accessToken, plan.id);
    await setAutoDisbursement(admin.accessToken, true);
    await createVerifiedSettlementAccount(admin.accessToken);

    const fund = await createFund(admin.accessToken);
    const contributionPlan = await createActivePlan(
      admin.accessToken,
      '100.00',
    );
    await createObligation(
      admin.accessToken,
      contributionPlan.id,
      member.identity.memberId,
      '2026-09-01',
    );

    const result = await payAndConfirm(
      member.accessToken,
      admin.identity.organisationId,
      member.identity.memberId,
      fund.id,
      '100.00',
    );
    expect(result.autoDisbursementId).toEqual(expect.any(String));

    const record = await prisma.withTenant(
      admin.identity.organisationId,
      (tx) =>
        tx.autoDisbursement.findUnique({
          where: { id: result.autoDisbursementId },
        }),
    );
    expect(record?.status).toBe('PENDING');
    expect(record?.disbursableAmountValue.toString()).toBe('100');
    expect(record?.platformFeeValue.toString()).toBe('5');
    expect(record?.transferAmountValue.toString()).toBe('95');
    expect(record?.providerReference.startsWith('mock_transfer_')).toBe(true);
  });

  it('an org with no subscription plan pays zero platform fee — full amount transfers', async () => {
    const admin = await registerOrganisation('Auto-Disbursement No Plan Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    await setAutoDisbursement(admin.accessToken, true);
    await createVerifiedSettlementAccount(admin.accessToken);

    const fund = await createFund(admin.accessToken);
    const contributionPlan = await createActivePlan(admin.accessToken, '40.00');
    await createObligation(
      admin.accessToken,
      contributionPlan.id,
      member.identity.memberId,
      '2026-09-01',
    );

    const result = await payAndConfirm(
      member.accessToken,
      admin.identity.organisationId,
      member.identity.memberId,
      fund.id,
      '40.00',
    );

    const record = await prisma.withTenant(
      admin.identity.organisationId,
      (tx) =>
        tx.autoDisbursement.findUnique({
          where: { id: result.autoDisbursementId },
        }),
    );
    expect(record?.platformFeeValue.toString()).toBe('0');
    expect(record?.transferAmountValue.toString()).toBe('40');
  });

  it('a succeeded transfer webhook posts a balanced ledger entry and is idempotent on redelivery', async () => {
    const admin = await registerOrganisation('Auto-Disbursement Success Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    await setAutoDisbursement(admin.accessToken, true);
    await createVerifiedSettlementAccount(admin.accessToken);

    const fund = await createFund(admin.accessToken);
    const contributionPlan = await createActivePlan(admin.accessToken, '60.00');
    await createObligation(
      admin.accessToken,
      contributionPlan.id,
      member.identity.memberId,
      '2026-09-01',
    );
    const result = await payAndConfirm(
      member.accessToken,
      admin.identity.organisationId,
      member.identity.memberId,
      fund.id,
      '60.00',
    );
    const record = await prisma.withTenant(
      admin.identity.organisationId,
      (tx) =>
        tx.autoDisbursement.findUnique({
          where: { id: result.autoDisbursementId },
        }),
    );

    const cashAccount = fund.ledgerAccounts.find((a) => a.name === 'Cash')!;
    const beforeBalance = await request(app.getHttpServer())
      .get(`/ledger-accounts/${cashAccount.id}/balance`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect((beforeBalance.body as BalanceResponse).balance).toBe('60');

    const confirmRes = await fireTransferWebhook(
      admin.identity.organisationId,
      record!.providerReference,
      'succeeded',
    );
    expect(confirmRes.outcome).toBe('succeeded');
    expect(confirmRes.journalEntryId).toEqual(expect.any(String));

    const afterBalance = await request(app.getHttpServer())
      .get(`/ledger-accounts/${cashAccount.id}/balance`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    // Cash decreases by the full disbursable amount (60) — the platform
    // fee (0, no plan here) and the transferred amount are just where
    // that 60 went, not additional deductions on top of it.
    expect((afterBalance.body as BalanceResponse).balance).toBe('0');

    const updated = await prisma.withTenant(
      admin.identity.organisationId,
      (tx) => tx.autoDisbursement.findUnique({ where: { id: record!.id } }),
    );
    expect(updated?.status).toBe('SUCCEEDED');

    // Redelivering the identical webhook is a no-op — no second ledger
    // entry, no double-deduction.
    const replay = await fireTransferWebhook(
      admin.identity.organisationId,
      record!.providerReference,
      'succeeded',
    );
    expect(replay.outcome).toBe('already_processed');
    const stillBalance = await request(app.getHttpServer())
      .get(`/ledger-accounts/${cashAccount.id}/balance`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect((stillBalance.body as BalanceResponse).balance).toBe('0');
  });

  it('a failed transfer webhook marks the disbursement FAILED, posts no ledger entry, and raises a reconciliation exception', async () => {
    const admin = await registerOrganisation('Auto-Disbursement Failure Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    await setAutoDisbursement(admin.accessToken, true);
    await createVerifiedSettlementAccount(admin.accessToken);

    const fund = await createFund(admin.accessToken);
    const contributionPlan = await createActivePlan(admin.accessToken, '30.00');
    await createObligation(
      admin.accessToken,
      contributionPlan.id,
      member.identity.memberId,
      '2026-09-01',
    );
    const result = await payAndConfirm(
      member.accessToken,
      admin.identity.organisationId,
      member.identity.memberId,
      fund.id,
      '30.00',
    );
    const record = await prisma.withTenant(
      admin.identity.organisationId,
      (tx) =>
        tx.autoDisbursement.findUnique({
          where: { id: result.autoDisbursementId },
        }),
    );

    const failRes = await fireTransferWebhook(
      admin.identity.organisationId,
      record!.providerReference,
      'failed',
    );
    expect(failRes.outcome).toBe('failed');

    const updated = await prisma.withTenant(
      admin.identity.organisationId,
      (tx) => tx.autoDisbursement.findUnique({ where: { id: record!.id } }),
    );
    expect(updated?.status).toBe('FAILED');

    // The contribution itself is untouched — money was genuinely
    // received, cash balance is still the full amount.
    const cashAccount = fund.ledgerAccounts.find((a) => a.name === 'Cash')!;
    const balanceRes = await request(app.getHttpServer())
      .get(`/ledger-accounts/${cashAccount.id}/balance`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect((balanceRes.body as BalanceResponse).balance).toBe('30');

    const exceptionsRes = await request(app.getHttpServer())
      .get('/reconciliation-exceptions')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(
      (exceptionsRes.body as ReconciliationExceptionResponse[]).some((e) =>
        e.reason.includes('Auto-disbursement transfer failed'),
      ),
    ).toBe(true);
  });

  it('an unknown transfer providerReference is logged as a reconciliation exception, not silently dropped', async () => {
    const admin = await registerOrganisation('Auto-Disbursement Unmatched Org');

    const res = await fireTransferWebhook(
      admin.identity.organisationId,
      'mock_transfer_never_existed',
      'succeeded',
    );
    expect(res.outcome).toBe('unmatched');

    const exceptionsRes = await request(app.getHttpServer())
      .get('/reconciliation-exceptions')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(
      (exceptionsRes.body as ReconciliationExceptionResponse[]).some((e) =>
        e.reason.includes('unknown providerReference'),
      ),
    ).toBe(true);
  });
});
