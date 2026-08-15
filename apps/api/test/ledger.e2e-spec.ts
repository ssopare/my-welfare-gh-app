import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { LedgerService } from '../src/ledger/ledger.service';
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
  amountValue: string;
  amountPaid: string;
  status: string;
  dueDate: string;
  contributionPlanId: string;
}

interface BalanceResponse {
  balance: string;
  type: string;
}

interface PaymentResponse {
  journalEntry: { id: string; lines: { debit: string; credit: string }[] };
  allocations: { obligationId: string; amount: string }[];
}

// Phase 1 roadmap slice 4: ledger core (§12) — the "prove them together"
// slice with the rule engine (slice 3). Real HTTP requests, real Postgres,
// same style as the earlier e2e specs.
describe('Ledger (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ledgerService: LedgerService;
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
    ledgerService = app.get(LedgerService);
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
        tx.journalLine.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.journalEntry.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.obligation.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.budget.deleteMany({ where: { organisationId } }),
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
    await app.close();
  });

  function uniquePhone() {
    return `+233-ledger-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

  function findAccount(
    fund: FundResponse,
    name: string,
  ): LedgerAccountResponse {
    const account = fund.ledgerAccounts.find((a) => a.name === name);
    if (!account)
      throw new Error(`Fund is missing the ${name} account in test fixture`);
    return account;
  }

  it('creates a fund with its standard chart of accounts; non-admin cannot', async () => {
    const admin = await registerOrganisation('Ledger Fund Org');
    const member = await joinOrganisation(admin.identity.organisationId);

    await request(app.getHttpServer())
      .post('/funds')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ name: 'Should Fail' })
      .expect(403);

    const fund = await createFund(admin.accessToken);
    expect(fund.name).toBe('General Welfare Fund');
    const accountNames = fund.ledgerAccounts.map((a) => a.name).sort();
    expect(accountNames).toEqual(
      [
        'Benefits Expense',
        'Benefits Payable',
        'Cash',
        'Contributions Income',
        'Fund Equity',
        'Member Credit Balance',
      ].sort(),
    );
  });

  it('the full loop: rule engine amount → obligation → payment → balanced journal entry → real account balances', async () => {
    const admin = await registerOrganisation('Ledger Full Loop Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);
    const plan = await createActivePlan(admin.accessToken, '20.00');

    const obligation = await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-09-01',
    );
    expect(obligation.amountValue).toBe('20');
    // 2026-09-01 is in the future relative to whenever this test runs
    // (well past this project's earliest possible run date), so the
    // obligation starts UPCOMING, not DUE yet.
    expect(obligation.status).toBe('UPCOMING');

    const paymentRes = await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        fundId: fund.id,
        amountValue: '20.00',
        currency: 'GHS',
      })
      .expect(201);
    const payment = paymentRes.body as PaymentResponse;
    expect(payment.allocations).toEqual([
      { obligationId: obligation.id, amount: '20' },
    ]);
    expect(payment.journalEntry.lines).toHaveLength(2);
    const totalDebit = payment.journalEntry.lines.reduce(
      (sum, l) => sum + Number(l.debit),
      0,
    );
    const totalCredit = payment.journalEntry.lines.reduce(
      (sum, l) => sum + Number(l.credit),
      0,
    );
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(20);

    const cashAccount = findAccount(fund, 'Cash');
    const incomeAccount = findAccount(fund, 'Contributions Income');

    const cashBalanceRes = await request(app.getHttpServer())
      .get(`/ledger-accounts/${cashAccount.id}/balance`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect((cashBalanceRes.body as BalanceResponse).balance).toBe('20');

    const incomeBalanceRes = await request(app.getHttpServer())
      .get(`/ledger-accounts/${incomeAccount.id}/balance`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect((incomeBalanceRes.body as BalanceResponse).balance).toBe('20');

    const obligationsRes = await request(app.getHttpServer())
      .get(`/members/${member.identity.memberId}/obligations`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(200);
    const updatedObligation = (obligationsRes.body as ObligationResponse[])[0];
    expect(updatedObligation.status).toBe('PAID');
    expect(updatedObligation.amountPaid).toBe('20');
  });

  it('a partial payment leaves the obligation PARTIALLY_PAID with the correct amountPaid', async () => {
    const admin = await registerOrganisation('Ledger Partial Payment Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);
    const plan = await createActivePlan(admin.accessToken, '50.00');
    const obligation = await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-09-01',
    );

    const paymentRes = await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        fundId: fund.id,
        amountValue: '20.00',
        currency: 'GHS',
      })
      .expect(201);
    expect((paymentRes.body as PaymentResponse).allocations).toEqual([
      { obligationId: obligation.id, amount: '20' },
    ]);

    const obligationsRes = await request(app.getHttpServer())
      .get(`/members/${member.identity.memberId}/obligations`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const updated = (obligationsRes.body as ObligationResponse[])[0];
    expect(updated.status).toBe('PARTIALLY_PAID');
    expect(updated.amountPaid).toBe('20');
  });

  it('allocates a payment oldest-obligation-first across two open obligations', async () => {
    const admin = await registerOrganisation('Ledger Oldest First Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);
    const plan = await createActivePlan(admin.accessToken, '20.00');

    const older = await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-07-01',
    );
    const newer = await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-08-01',
    );

    // Pays the older obligation in full (20) and half of the newer one (10).
    const paymentRes = await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        fundId: fund.id,
        amountValue: '30.00',
        currency: 'GHS',
      })
      .expect(201);
    const payment = paymentRes.body as PaymentResponse;
    expect(payment.allocations).toEqual([
      { obligationId: older.id, amount: '20' },
      { obligationId: newer.id, amount: '10' },
    ]);

    const obligationsRes = await request(app.getHttpServer())
      .get(`/members/${member.identity.memberId}/obligations`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const byId = new Map(
      (obligationsRes.body as ObligationResponse[]).map((o) => [o.id, o]),
    );
    expect(byId.get(older.id)?.status).toBe('PAID');
    expect(byId.get(newer.id)?.status).toBe('PARTIALLY_PAID');
    expect(byId.get(newer.id)?.amountPaid).toBe('10');
  });

  it('rejects a payment that exceeds total open obligations', async () => {
    const admin = await registerOrganisation('Ledger Overpayment Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);
    // one_time, not the monthly default — a monthly overpayment is now a
    // legitimate "pay ahead" case (see the monthly-waterfall tests below),
    // not a rejection; a one-time plan has nowhere to extend into, so it's
    // the case that still genuinely has nothing to do with the excess.
    const plan = await createActivePlan(admin.accessToken, '10.00', 'one_time');
    await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-09-01',
    );

    await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        fundId: fund.id,
        amountValue: '999.00',
        currency: 'GHS',
      })
      .expect(400);
  });

  it('an admin can switch the org to member_selected allocation; a non-admin cannot', async () => {
    const admin = await registerOrganisation('Org Settings Org');
    const member = await joinOrganisation(admin.identity.organisationId);

    await request(app.getHttpServer())
      .patch('/organisation')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ paymentAllocationPolicy: 'member_selected' })
      .expect(403);

    const res = await request(app.getHttpServer())
      .patch('/organisation')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ paymentAllocationPolicy: 'member_selected' })
      .expect(200);
    expect(
      (res.body as { paymentAllocationPolicy: string }).paymentAllocationPolicy,
    ).toBe('member_selected');
  });

  it('selecting which contribution types to pay works under any policy; only member_selected requires a selection', async () => {
    const admin = await registerOrganisation(
      'Allocation Policy Validation Org',
    );
    const member = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);
    // one_time, not the monthly default — a monthly obligation is never
    // selectable at all (see the dedicated monthly-always-automatic test
    // below), so it wouldn't actually exercise obligation selection the
    // way this test means to.
    const plan = await createActivePlan(admin.accessToken, '10.00', 'one_time');
    const obligationA = await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-06-01',
    );
    const obligationB = await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-07-01',
    );

    // Still the default oldest_first policy -> selecting which type to
    // pay is allowed, not rejected. Covers only obligationA, leaving
    // obligationB untouched even though it's older-or-equal in the open
    // set — picking a type doesn't reorder arrears within it, it just
    // scopes which types are in play at all.
    const selectedRes = await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        fundId: fund.id,
        amountValue: '10.00',
        currency: 'GHS',
        obligationIds: [obligationA.id],
      })
      .expect(201);
    expect((selectedRes.body as PaymentResponse).allocations).toEqual([
      { obligationId: obligationA.id, amount: '10' },
    ]);

    // Confirms the comment above for real: obligationB is genuinely still
    // open, not just assumed to be — it's what makes the member_selected
    // rejection below meaningful (there's something to require a pick of).
    const obligationsAfterSelected = await request(app.getHttpServer())
      .get(`/members/${member.identity.memberId}/obligations`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(
      (obligationsAfterSelected.body as ObligationResponse[]).find(
        (o) => o.id === obligationB.id,
      )?.status,
    ).not.toBe('PAID');

    await request(app.getHttpServer())
      .patch('/organisation')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ paymentAllocationPolicy: 'member_selected' })
      .expect(200);

    // Now member_selected -> omitting the selection is rejected while
    // obligationB is still open (oldest_first never required this).
    await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        fundId: fund.id,
        amountValue: '10.00',
        currency: 'GHS',
      })
      .expect(400);
  });

  it('member_selected: covers only the chosen obligations, oldest-first within the selection, leaving an unselected older one untouched', async () => {
    const admin = await registerOrganisation('Member Selected Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);
    const plan = await createActivePlan(admin.accessToken, '20.00', 'one_time');

    const oldest = await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-06-01',
    );
    const middle = await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-07-01',
    );
    const newest = await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-08-01',
    );

    await request(app.getHttpServer())
      .patch('/organisation')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ paymentAllocationPolicy: 'member_selected' })
      .expect(200);

    // Deliberately skips the oldest one, selects the other two out of
    // due-date order.
    const paymentRes = await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        fundId: fund.id,
        amountValue: '40.00',
        currency: 'GHS',
        obligationIds: [newest.id, middle.id],
      })
      .expect(201);
    const payment = paymentRes.body as PaymentResponse;
    // Still oldest-first *within the selection*: middle before newest.
    expect(payment.allocations).toEqual([
      { obligationId: middle.id, amount: '20' },
      { obligationId: newest.id, amount: '20' },
    ]);

    const obligationsRes = await request(app.getHttpServer())
      .get(`/members/${member.identity.memberId}/obligations`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const byId = new Map(
      (obligationsRes.body as ObligationResponse[]).map((o) => [o.id, o]),
    );
    expect(byId.get(oldest.id)?.status).toBe('DUE');
    expect(byId.get(oldest.id)?.amountPaid).toBe('0');
    expect(byId.get(middle.id)?.status).toBe('PAID');
    expect(byId.get(newest.id)?.status).toBe('PAID');
  });

  it('member_selected: rejects a payment exceeding the selected obligations, even though other open obligations exist', async () => {
    const admin = await registerOrganisation('Member Selected Overpay Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);
    const plan = await createActivePlan(admin.accessToken, '10.00', 'one_time');
    const selected = await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-06-01',
    );
    // A second open obligation exists but is never selected — 20 total is
    // open, but only 10 was chosen to be covered.
    await createObligation(
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

    await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        fundId: fund.id,
        amountValue: '25.00',
        currency: 'GHS',
        obligationIds: [selected.id],
      })
      .expect(400);
  });

  it('member_selected: a monthly obligation can never be individually selected, even by id', async () => {
    const admin = await registerOrganisation('Monthly Not Selectable Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);
    const plan = await createActivePlan(admin.accessToken, '20.00'); // monthly
    const obligation = await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-06-01',
    );

    await request(app.getHttpServer())
      .patch('/organisation')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ paymentAllocationPolicy: 'member_selected' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        fundId: fund.id,
        amountValue: '20.00',
        currency: 'GHS',
        obligationIds: [obligation.id],
      })
      .expect(400);
  });

  it('member_selected: with only monthly obligations open, no selection is required — it just pays automatically', async () => {
    const admin = await registerOrganisation(
      'Monthly Auto Under Member Selected Org',
    );
    const member = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);
    const plan = await createActivePlan(admin.accessToken, '20.00'); // monthly
    const obligation = await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-06-01',
    );

    await request(app.getHttpServer())
      .patch('/organisation')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ paymentAllocationPolicy: 'member_selected' })
      .expect(200);

    const paymentRes = await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        fundId: fund.id,
        amountValue: '20.00',
        currency: 'GHS',
      })
      .expect(201);
    expect((paymentRes.body as PaymentResponse).allocations).toEqual([
      { obligationId: obligation.id, amount: '20' },
    ]);
  });

  it('monthly overpayment spreads forward: covers every open month, then keeps generating and paying future months until the amount runs out', async () => {
    const admin = await registerOrganisation('Monthly Waterfall Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);
    const plan = await createActivePlan(admin.accessToken, '20.00'); // monthly
    const onlyOpen = await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-06-01',
    );

    // GHS 110 against a single GHS 20/month due: covers 5 months in full
    // (100) and leaves the 6th partially covered (10) — the 5 extra
    // months don't exist yet as Obligation rows before this payment;
    // they're generated by it.
    const paymentRes = await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        fundId: fund.id,
        amountValue: '110.00',
        currency: 'GHS',
      })
      .expect(201);
    const payment = paymentRes.body as PaymentResponse;
    expect(payment.allocations).toHaveLength(6);
    expect(payment.allocations[0]).toEqual({
      obligationId: onlyOpen.id,
      amount: '20',
    });
    expect(
      payment.allocations.slice(1, 5).every((a) => a.amount === '20'),
    ).toBe(true);
    expect(payment.allocations[5].amount).toBe('10');

    // The journal entry still balances — no credit balance was actually
    // needed here (the payment covered a whole number of months plus one
    // real partial obligation, not an overflow past what could be
    // generated).
    const totalDebit = payment.journalEntry.lines.reduce(
      (sum, l) => sum + Number(l.debit),
      0,
    );
    const totalCredit = payment.journalEntry.lines.reduce(
      (sum, l) => sum + Number(l.credit),
      0,
    );
    expect(totalDebit).toBe(110);
    expect(totalCredit).toBe(110);

    const obligationsRes = await request(app.getHttpServer())
      .get(`/members/${member.identity.memberId}/obligations`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const all = obligationsRes.body as ObligationResponse[];
    expect(all).toHaveLength(6);
    const partial = all.find(
      (o) => o.id === payment.allocations[5].obligationId,
    );
    expect(partial?.status).toBe('PARTIALLY_PAID');
    expect(partial?.amountPaid).toBe('10');
  });

  it('a follow-up payment tops up the partial month first, then rolls the rest into the next one', async () => {
    const admin = await registerOrganisation('Monthly Waterfall Followup Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);
    const plan = await createActivePlan(admin.accessToken, '20.00'); // monthly
    await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-06-01',
    );

    await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        fundId: fund.id,
        amountValue: '110.00', // 5 full months + a 6th left at 10/20
        currency: 'GHS',
      })
      .expect(201);

    const secondPaymentRes = await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        fundId: fund.id,
        amountValue: '30.00',
        currency: 'GHS',
      })
      .expect(201);
    const second = secondPaymentRes.body as PaymentResponse;
    // Tops up the 6th month's remaining 10, then fully covers a new 7th
    // month with the remaining 20 — not two fresh partials.
    expect(second.allocations).toHaveLength(2);
    expect(second.allocations[0].amount).toBe('10');
    expect(second.allocations[1].amount).toBe('20');

    const obligationsRes = await request(app.getHttpServer())
      .get(`/members/${member.identity.memberId}/obligations`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const all = obligationsRes.body as ObligationResponse[];
    expect(all).toHaveLength(7);
    expect(all.every((o) => o.status === 'PAID')).toBe(true);
  });

  it("an extreme monthly overpayment parks the leftover as the member's credit balance and posts a balanced entry for it", async () => {
    const admin = await registerOrganisation('Monthly Credit Balance Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);
    const plan = await createActivePlan(admin.accessToken, '20.00'); // monthly
    await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-06-01',
    );

    // 20 (the one open obligation) + 24 more months x 20 = 500, plus 15
    // left over that has nowhere left to go (24-month safety cap).
    const paymentRes = await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        fundId: fund.id,
        amountValue: '515.00',
        currency: 'GHS',
      })
      .expect(201);
    const payment = paymentRes.body as PaymentResponse;
    expect(payment.allocations).toHaveLength(25); // the 1 existing + 24 generated

    const totalCredit = payment.journalEntry.lines.reduce(
      (sum, l) => sum + Number(l.credit),
      0,
    );
    const totalDebit = payment.journalEntry.lines.reduce(
      (sum, l) => sum + Number(l.debit),
      0,
    );
    expect(totalDebit).toBe(515);
    expect(totalCredit).toBe(515); // balanced, including the credit-balance line

    const creditLine = payment.journalEntry.lines.find(
      (l) => Number(l.credit) === 15,
    );
    expect(creditLine).toBeDefined();

    // Confirmed by spending it: a small follow-up payment should need no
    // new obligation at all, since 15 of credit already covers it.
    const followUpRes = await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        fundId: fund.id,
        amountValue: '5.00', // 5 + the 15 credit = 20, exactly one more month
        currency: 'GHS',
      })
      .expect(201);
    expect((followUpRes.body as PaymentResponse).allocations).toHaveLength(1);
  });

  it('an advance payment that crosses a rate change splits at the correct month: old rate before, new rate from the effective date', async () => {
    const admin = await registerOrganisation('Monthly Rate Change Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);

    // v1: GHS 100/month, effective from June 2026.
    const v1CreateRes = await request(app.getHttpServer())
      .post('/contribution-plans')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: 'Monthly Staff Contribution',
        cadence: 'monthly',
        amountValue: '100.00',
        currency: 'GHS',
      })
      .expect(201);
    const v1 = v1CreateRes.body as RuleResponse;
    await request(app.getHttpServer())
      .post(`/contribution-plans/${v1.id}/activate`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ effectiveFrom: '2026-06-01' })
      .expect(201);

    // One real open month under v1 (June), created while v1 is still
    // ACTIVE — a genuine due that predates the rate change.
    const june = await createObligation(
      admin.accessToken,
      v1.id,
      member.identity.memberId,
      '2026-06-01',
    );

    // The group votes to raise dues: v2 at GHS 120/month, effective from
    // September 2026, supersedes v1 (which becomes SUPERSEDED, effectiveTo
    // 2026-09-01).
    const v2CreateRes = await request(app.getHttpServer())
      .post('/contribution-plans')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: 'Monthly Staff Contribution',
        cadence: 'monthly',
        amountValue: '120.00',
        currency: 'GHS',
        supersedesId: v1.id,
      })
      .expect(201);
    const v2 = v2CreateRes.body as RuleResponse;
    await request(app.getHttpServer())
      .post(`/contribution-plans/${v2.id}/activate`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ effectiveFrom: '2026-09-01' })
      .expect(201);

    // GHS 470 advance payment: June(100, v1) + July(100, v1) + August(100,
    // v1) + September(120, v2 — the rate change lands here) + a 50
    // partial October (v2). The extension phase has to resolve each
    // generated month against whichever plan version actually covers it,
    // not statically reuse June's (now-superseded) plan the whole way.
    const paymentRes = await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        fundId: fund.id,
        amountValue: '470.00',
        currency: 'GHS',
      })
      .expect(201);
    const payment = paymentRes.body as PaymentResponse;
    expect(payment.allocations).toHaveLength(5);
    expect(payment.allocations[0]).toEqual({
      obligationId: june.id,
      amount: '100',
    });
    expect(payment.allocations[1].amount).toBe('100'); // July, still v1
    expect(payment.allocations[2].amount).toBe('100'); // August, still v1
    expect(payment.allocations[3].amount).toBe('120'); // September, v2's rate
    expect(payment.allocations[4].amount).toBe('50'); // October, partial at v2's rate

    const totalDebit = payment.journalEntry.lines.reduce(
      (sum, l) => sum + Number(l.debit),
      0,
    );
    const totalCredit = payment.journalEntry.lines.reduce(
      (sum, l) => sum + Number(l.credit),
      0,
    );
    expect(totalDebit).toBe(470);
    expect(totalCredit).toBe(470);

    const obligationsRes = await request(app.getHttpServer())
      .get(`/members/${member.identity.memberId}/obligations`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const all = obligationsRes.body as ObligationResponse[];
    const september = all.find(
      (o) => o.id === payment.allocations[3].obligationId,
    );
    const october = all.find(
      (o) => o.id === payment.allocations[4].obligationId,
    );
    expect(september?.contributionPlanId).toBe(v2.id);
    expect(september?.amountValue).toBe('120');
    expect(october?.contributionPlanId).toBe(v2.id);
    expect(october?.amountValue).toBe('120');
    expect(october?.status).toBe('PARTIALLY_PAID');
    expect(october?.amountPaid).toBe('50');
  });

  it('a member can pay their own obligation; cannot record a payment for another member without admin', async () => {
    const admin = await registerOrganisation('Ledger Self-Or-Admin Org');
    const memberA = await joinOrganisation(admin.identity.organisationId);
    const memberB = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);
    const plan = await createActivePlan(admin.accessToken, '10.00');
    await createObligation(
      admin.accessToken,
      plan.id,
      memberB.identity.memberId,
      '2026-09-01',
    );

    await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${memberA.accessToken}`)
      .send({
        memberId: memberB.identity.memberId,
        fundId: fund.id,
        amountValue: '10.00',
        currency: 'GHS',
      })
      .expect(403);
  });

  it('reverses a journal entry with a balanced contra entry that nets the account balance back to zero', async () => {
    const admin = await registerOrganisation('Ledger Reversal Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);
    const plan = await createActivePlan(admin.accessToken, '15.00');
    await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2026-09-01',
    );

    const paymentRes = await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        fundId: fund.id,
        amountValue: '15.00',
        currency: 'GHS',
      })
      .expect(201);
    const entryId = (paymentRes.body as PaymentResponse).journalEntry.id;

    const cashAccount = findAccount(fund, 'Cash');
    const beforeReversal = await request(app.getHttpServer())
      .get(`/ledger-accounts/${cashAccount.id}/balance`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect((beforeReversal.body as BalanceResponse).balance).toBe('15');

    await request(app.getHttpServer())
      .post(`/journal-entries/${entryId}/reverse`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ reason: 'test' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/journal-entries/${entryId}/reverse`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ reason: 'entered in error' })
      .expect(201);

    const afterReversal = await request(app.getHttpServer())
      .get(`/ledger-accounts/${cashAccount.id}/balance`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect((afterReversal.body as BalanceResponse).balance).toBe('0');

    // The reversal itself is a second journal entry, referencing the
    // original — listJournalEntries (admin-only) must show both.
    await request(app.getHttpServer())
      .get('/journal-entries')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(403);

    const listRes = await request(app.getHttpServer())
      .get('/journal-entries')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const entries = listRes.body as { id: string; lines: unknown[] }[];
    expect(entries.map((e) => e.id)).toEqual(expect.arrayContaining([entryId]));
    expect(entries.length).toBeGreaterThanOrEqual(2);

    const scopedRes = await request(app.getHttpServer())
      .get(`/journal-entries?fundId=${fund.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect((scopedRes.body as { id: string }[]).map((e) => e.id)).toEqual(
      expect.arrayContaining([entryId]),
    );
  });

  it("cross-tenant: an admin cannot see or use another organisation's fund", async () => {
    const orgA = await registerOrganisation('Ledger Cross-Tenant Org A');
    const orgB = await registerOrganisation('Ledger Cross-Tenant Org B');
    const fundA = await createFund(orgA.accessToken);

    await request(app.getHttpServer())
      .get(`/funds/${fundA.id}`)
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .expect(404);
  });

  it('LedgerService rejects an unbalanced or malformed journal entry before it can be posted', async () => {
    const admin = await registerOrganisation('Ledger Validation Org');
    const fund = await createFund(admin.accessToken);
    const cashAccountId = findAccount(fund, 'Cash').id;
    const incomeAccountId = findAccount(fund, 'Contributions Income').id;

    await expect(
      ledgerService.postJournalEntry(admin.identity.organisationId, {
        fundId: fund.id,
        description: 'Unbalanced',
        createdBy: admin.identity.memberId,
        lines: [
          { ledgerAccountId: cashAccountId, debit: '10.00' },
          { ledgerAccountId: incomeAccountId, credit: '9.00' },
        ],
      }),
    ).rejects.toThrow('not balanced');

    await expect(
      ledgerService.postJournalEntry(admin.identity.organisationId, {
        fundId: fund.id,
        description: 'Single line',
        createdBy: admin.identity.memberId,
        lines: [{ ledgerAccountId: cashAccountId, debit: '10.00' }],
      }),
    ).rejects.toThrow('at least two lines');

    await expect(
      ledgerService.postJournalEntry(admin.identity.organisationId, {
        fundId: fund.id,
        description: 'Both debit and credit on one line',
        createdBy: admin.identity.memberId,
        lines: [
          { ledgerAccountId: cashAccountId, debit: '10.00', credit: '10.00' },
          { ledgerAccountId: incomeAccountId, credit: '10.00' },
        ],
      }),
    ).rejects.toThrow('exactly one of debit or credit');
  });

  it('transfers between two funds, moving Cash and leaving both sides linked and balanced; non-admin cannot', async () => {
    const admin = await registerOrganisation('Ledger Fund Transfer Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const generalFund = await createFund(admin.accessToken);
    const medicalFundRes = await request(app.getHttpServer())
      .post('/funds')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Medical Fund' })
      .expect(201);
    const medicalFund = medicalFundRes.body as FundResponse;

    const plan = await createActivePlan(
      admin.accessToken,
      '500.00',
      'one_time',
    );
    await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      '2020-01-01',
    );
    await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        fundId: generalFund.id,
        amountValue: '500.00',
        currency: 'GHS',
      })
      .expect(201);

    // Non-admin cannot transfer.
    await request(app.getHttpServer())
      .post(`/funds/${generalFund.id}/transfer`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ toFundId: medicalFund.id, amountValue: '150.00' })
      .expect(403);

    const transferRes = await request(app.getHttpServer())
      .post(`/funds/${generalFund.id}/transfer`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        toFundId: medicalFund.id,
        amountValue: '150.00',
        description: 'Seeding the medical fund',
      })
      .expect(201);
    const transfer = transferRes.body as {
      transferId: string;
      outEntry: { id: string; fundId: string };
      inEntry: { id: string; fundId: string };
    };
    expect(transfer.outEntry.fundId).toBe(generalFund.id);
    expect(transfer.inEntry.fundId).toBe(medicalFund.id);

    const generalCash = findAccount(generalFund, 'Cash');
    const medicalCash = findAccount(medicalFund, 'Cash');
    const generalBalanceRes = await request(app.getHttpServer())
      .get(`/ledger-accounts/${generalCash.id}/balance`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const medicalBalanceRes = await request(app.getHttpServer())
      .get(`/ledger-accounts/${medicalCash.id}/balance`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect((generalBalanceRes.body as BalanceResponse).balance).toBe('350');
    expect((medicalBalanceRes.body as BalanceResponse).balance).toBe('150');

    // Rejects a self-transfer and a non-positive amount.
    await request(app.getHttpServer())
      .post(`/funds/${generalFund.id}/transfer`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ toFundId: generalFund.id, amountValue: '10.00' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/funds/${generalFund.id}/transfer`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ toFundId: medicalFund.id, amountValue: '0.00' })
      .expect(400);
  });

  it('an admin can extend a fund with a custom account; non-admin and duplicate names are rejected', async () => {
    const admin = await registerOrganisation('Ledger Custom Account Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const fund = await createFund(admin.accessToken);

    await request(app.getHttpServer())
      .post(`/funds/${fund.id}/accounts`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({
        name: 'Administrative Expenses',
        type: 'EXPENSE',
        isAdministrative: true,
      })
      .expect(403);

    const createRes = await request(app.getHttpServer())
      .post(`/funds/${fund.id}/accounts`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: 'Administrative Expenses',
        type: 'EXPENSE',
        isAdministrative: true,
      })
      .expect(201);
    const account = createRes.body as LedgerAccountResponse & {
      isAdministrative: boolean;
    };
    expect(account.type).toBe('EXPENSE');
    expect(account.isAdministrative).toBe(true);

    // Immediately shows up nested on the fund, and is usable as a Budget
    // target with no other change required anywhere else.
    const fundRes = await request(app.getHttpServer())
      .get(`/funds/${fund.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(
      (fundRes.body as FundResponse).ledgerAccounts.some(
        (a) => a.id === account.id,
      ),
    ).toBe(true);
    await request(app.getHttpServer())
      .post('/budgets')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        ledgerAccountId: account.id,
        periodStart: '2020-01-01',
        periodEnd: '2030-12-31',
        amountValue: '100.00',
      })
      .expect(201);

    // A duplicate name on the same fund is rejected.
    await request(app.getHttpServer())
      .post(`/funds/${fund.id}/accounts`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Administrative Expenses', type: 'EXPENSE' })
      .expect(400);
  });

  it('allocates payment correctly for a voluntary contribution plan', async () => {
    const admin = await registerOrganisation('Ledger Voluntary Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    
    // Set status to ACTIVE
    await request(app.getHttpServer())
      .patch(`/members/${member.identity.memberId}/status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    const fund = await createFund(admin.accessToken);

    // Create draft voluntary plan
    const planRes = await request(app.getHttpServer())
      .post('/contribution-plans')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: 'Voluntary Building Fund',
        cadence: 'monthly',
        amountValue: '0.00',
        currency: 'GHS',
        computationType: 'voluntary',
        defaultFundId: fund.id,
      })
      .expect(201);
    const plan = planRes.body as RuleResponse;

    // Activate it
    await request(app.getHttpServer())
      .post(`/contribution-plans/${plan.id}/activate`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ effectiveFrom: new Date().toISOString() })
      .expect(201);

    // Generate obligation for member
    const obligation = await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      new Date().toISOString(),
    );
    expect(obligation.amountValue).toBe('0');

    // Record payment of 150 GHS
    const payRes = await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        fundId: fund.id,
        amountValue: '150.00',
        currency: 'GHS',
      })
      .expect(201);
    const pay = payRes.body as PaymentResponse;

    // Verify allocations
    expect(pay.allocations).toHaveLength(1);
    expect(pay.allocations[0].obligationId).toBe(obligation.id);
    expect(pay.allocations[0].amount).toBe('150');

    // Fetch the updated obligation
    const openRes = await request(app.getHttpServer())
      .get(`/members/${member.identity.memberId}/obligations`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const obUpdate = (openRes.body as ObligationResponse[]).find((o) => o.id === obligation.id)!;
    expect(obUpdate.amountValue).toBe('150');
    expect(obUpdate.amountPaid).toBe('150');
    expect(obUpdate.status).toBe('PAID');

    // Fetch the member to verify creditBalance
    const meRes = await request(app.getHttpServer())
      .get(`/members/${member.identity.memberId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(meRes.body.creditBalance).toBe('0');
  });

  it('allocates payment correctly for a minimum contribution plan', async () => {
    const admin = await registerOrganisation('Ledger Minimum Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    
    // Set status to ACTIVE
    await request(app.getHttpServer())
      .patch(`/members/${member.identity.memberId}/status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    const fund = await createFund(admin.accessToken);

    // Create draft minimum plan (e.g. minimum 20.00)
    const planRes = await request(app.getHttpServer())
      .post('/contribution-plans')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: 'Minimum Maintenance Dues',
        cadence: 'monthly',
        amountValue: '20.00',
        currency: 'GHS',
        computationType: 'minimum',
        defaultFundId: fund.id,
      })
      .expect(201);
    const plan = planRes.body as RuleResponse;

    // Activate it
    await request(app.getHttpServer())
      .post(`/contribution-plans/${plan.id}/activate`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ effectiveFrom: new Date().toISOString() })
      .expect(201);

    // Generate obligation for member
    const obligation = await createObligation(
      admin.accessToken,
      plan.id,
      member.identity.memberId,
      new Date().toISOString(),
    );
    expect(obligation.amountValue).toBe('20');

    // Record payment of 50 GHS
    const payRes = await request(app.getHttpServer())
      .post('/payments/contribution')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        fundId: fund.id,
        amountValue: '50.00',
        currency: 'GHS',
      })
      .expect(201);
    const pay = payRes.body as PaymentResponse;

    // Verify allocations (entire 50 is allocated)
    expect(pay.allocations).toHaveLength(1);
    expect(pay.allocations[0].obligationId).toBe(obligation.id);
    expect(pay.allocations[0].amount).toBe('50');

    // Fetch the updated obligation
    const openRes = await request(app.getHttpServer())
      .get(`/members/${member.identity.memberId}/obligations`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const obUpdate = (openRes.body as ObligationResponse[]).find((o) => o.id === obligation.id)!;
    expect(obUpdate.amountValue).toBe('50');
    expect(obUpdate.amountPaid).toBe('50');
    expect(obUpdate.status).toBe('PAID');

    // Fetch the member to verify creditBalance (entire 50 absorbed, credit remains 0)
    const meRes = await request(app.getHttpServer())
      .get(`/members/${member.identity.memberId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(meRes.body.creditBalance).toBe('0');
  });
});
