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
    const plan = await createActivePlan(admin.accessToken, '10.00');
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
});
