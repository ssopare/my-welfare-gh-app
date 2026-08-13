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
}

interface RoleResponse {
  id: string;
  name: string;
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

interface BudgetWithActual {
  id: string;
  ledgerAccountId: string;
  accountName: string;
  budgeted: string;
  actual: string;
  variance: string;
  variancePercent: string | null;
  status: 'over_budget' | 'on_track' | 'underperforming';
}

// Advanced reporting Phase B, §9 — Budget vs Actual. Real HTTP requests,
// real Postgres, same style as every other e2e spec in this project.
describe('Budget (e2e)', () => {
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
        tx.budget.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.claimStageAction.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.claim.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.journalLine.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.journalEntry.deleteMany({ where: { organisationId } }),
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
    return `+233-budget-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

  it('budget vs actual: only in-period activity counts, and status reflects over/under', async () => {
    const admin = await registerOrganisation('Budget Test Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const approver = await joinOrganisation(admin.identity.organisationId);
    await grantTreasurer(admin.accessToken, approver.identity.memberId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    const fund = await createFund(admin.accessToken);
    const expenseAccount = fund.ledgerAccounts.find(
      (a) => a.name === 'Benefits Expense',
    );

    // A real disbursement, posted "now".
    const ruleRes = await request(app.getHttpServer())
      .post('/benefit-rules')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: 'Medical Support',
        triggerEvent: 'member.hospitalisation',
        subjectTypes: ['self'],
        amountValue: '150.00',
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

    // Budget A: a period entirely in the past — the disbursement (posted
    // "now") falls outside it, so actual must be 0.
    const pastBudgetRes = await request(app.getHttpServer())
      .post('/budgets')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        ledgerAccountId: expenseAccount?.id,
        name: 'Last year',
        periodStart: '2020-01-01',
        periodEnd: '2020-12-31',
        amountValue: '100.00',
      })
      .expect(201);
    const pastBudgetId = (pastBudgetRes.body as { id: string }).id;

    // Budget B: spans now, budgeted lower than the real GHS 150
    // disbursement — must show over_budget.
    await request(app.getHttpServer())
      .post('/budgets')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        ledgerAccountId: expenseAccount?.id,
        name: 'This year',
        periodStart: '2020-01-01',
        periodEnd: '2030-12-31',
        amountValue: '100.00',
      })
      .expect(201);

    // Non-admin cannot create a budget.
    await request(app.getHttpServer())
      .post('/budgets')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({
        ledgerAccountId: expenseAccount?.id,
        periodStart: '2020-01-01',
        periodEnd: '2030-12-31',
        amountValue: '50.00',
      })
      .expect(403);

    const listRes = await request(app.getHttpServer())
      .get('/budgets')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const budgets = listRes.body as BudgetWithActual[];
    const past = budgets.find((b) => b.id === pastBudgetId);
    const current = budgets.find(
      (b) => b.ledgerAccountId === expenseAccount?.id && b.id !== pastBudgetId,
    );

    expect(past?.actual).toBe('0');
    expect(past?.status).toBe('on_track'); // 0 is not > 100

    expect(current?.actual).toBe('150');
    expect(current?.variance).toBe('50');
    expect(current?.status).toBe('over_budget');

    // Non-admin cannot delete; admin can, and it disappears from the list.
    await request(app.getHttpServer())
      .delete(`/budgets/${pastBudgetId}`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/budgets/${pastBudgetId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const afterDeleteRes = await request(app.getHttpServer())
      .get('/budgets')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(
      (afterDeleteRes.body as BudgetWithActual[]).some(
        (b) => b.id === pastBudgetId,
      ),
    ).toBe(false);
  });

  it("cross-tenant: one organisation's budgets never include another's", async () => {
    const orgA = await registerOrganisation('Budget Cross-Tenant Org A');
    const fundA = await createFund(orgA.accessToken);
    const cashA = fundA.ledgerAccounts.find((a) => a.name === 'Cash');
    await request(app.getHttpServer())
      .post('/budgets')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({
        ledgerAccountId: cashA?.id,
        periodStart: '2020-01-01',
        periodEnd: '2030-12-31',
        amountValue: '10.00',
      })
      .expect(201);

    const orgB = await registerOrganisation('Budget Cross-Tenant Org B');
    const listRes = await request(app.getHttpServer())
      .get('/budgets')
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .expect(200);
    expect(listRes.body as BudgetWithActual[]).toHaveLength(0);
  });
});
