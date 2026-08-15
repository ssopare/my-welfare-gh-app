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

describe('Payouts & Treasury (e2e)', () => {
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
        tx.payoutApproval.deleteMany({ where: { payoutRequest: { organisationId } } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.payoutRequest.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.payoutRecipient.deleteMany({ where: { organisationId } }),
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
        tx.notification.deleteMany({ where: { organisationId } }),
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
    return `+233-payout-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function me(accessToken: string): Promise<MeResponse> {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    return res.body as MeResponse;
  }

  async function registerOrganisation(legalName: string): Promise<{
    adminToken: string;
    adminMemberId: string;
    organisationId: string;
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

    return {
      adminToken: accessToken,
      adminMemberId: identity.memberId,
      organisationId: identity.organisationId,
    };
  }

  async function registerMember(organisationId: string): Promise<{
    token: string;
    memberId: string;
  }> {
    const res = await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber: uniquePhone(),
        password: 'correct-horse-battery-staple',
        organisationId,
        name: 'Checker Admin',
      })
      .expect(201);

    const { accessToken } = res.body as AccessTokenResponse;
    const identity = await me(accessToken);
    createdAccountIds.push(identity.sub);

    // Make member active and assign Admin permissions
    await prisma.withTenant(organisationId, (tx) =>
      tx.member.update({
        where: { id: identity.memberId },
        data: { status: 'ACTIVE' },
      }),
    );

    const adminRole = await prisma.withTenant(organisationId, (tx) =>
      tx.role.findFirst({
        where: { organisationId, name: 'Org Admin' },
      }),
    );
    if (adminRole) {
      await prisma.withTenant(organisationId, (tx) =>
        tx.roleAssignment.create({
          data: {
            organisationId,
            memberId: identity.memberId,
            roleId: adminRole.id,
          },
        }),
      );
    }

    return {
      token: accessToken,
      memberId: identity.memberId,
    };
  }

  it('verifies the full treasury loop: configure settlement → recipients → limits → deposit → payout flow', async () => {
    const { adminToken, adminMemberId, organisationId } = await registerOrganisation('Teshie Payout Welfare');
    const { token: checkerToken } = await registerMember(organisationId);

    // 1. Setup Settlement Account
    await request(app.getHttpServer())
      .post('/payouts/settlement-account')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        bankName: 'MTN Mobile Money',
        accountNumber: '0559998887',
      })
      .expect(201);

    const settlementRes = await request(app.getHttpServer())
      .get('/payouts/settlement-account')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(settlementRes.body.verified).toBe(true);
    expect(settlementRes.body.providerSubaccountCode).toContain('ACCT_mock_subaccount_');
    expect(settlementRes.body.accountNumber).toBe('******8887'); // Masked for security!

    // 2. Create Fund Control Policy
    await request(app.getHttpServer())
      .post('/payouts/policy')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        dailyLimitValue: '1000.00',
        monthlyLimitValue: '5000.00',
        thresholdOneApproverValue: '100.00', // threshold for 2 approvals
        thresholdTwoApproversValue: '500.00', // threshold for 3 approvals
      })
      .expect(201);

    const policyRes = await request(app.getHttpServer())
      .get('/payouts/policy')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(policyRes.body.dailyLimitValue).toBe('1000');
    expect(policyRes.body.thresholdOneApproverValue).toBe('100');

    // 3. Create Payout Recipient (Allowlisted)
    const recipientRes = await request(app.getHttpServer())
      .post('/payouts/recipients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Beneficiary Kofi',
        type: 'momo',
        accountNumber: '0241112223',
        bankCode: 'MTN',
      })
      .expect(201);

    expect(recipientRes.body.isAllowlisted).toBe(true);

    const listRecipientsRes = await request(app.getHttpServer())
      .get('/payouts/recipients')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(listRecipientsRes.body.length).toBe(1);
    expect(listRecipientsRes.body[0].accountNumber).toBe('******2223'); // Masked!

    // 4. Create Fund
    const fund = await prisma.withTenant(organisationId, (tx) =>
      tx.fund.create({
        data: {
          organisationId,
          name: 'Emergency Fund',
        },
      }),
    );

    // Autoprovision ledger accounts for Emergency Fund
    const accounts = [
      { name: 'Cash', type: 'ASSET' as const },
      { name: 'Benefits Expense', type: 'EXPENSE' as const },
    ];
    await prisma.withTenant(organisationId, (tx) =>
      tx.ledgerAccount.createMany({
        data: accounts.map((a) => ({
          organisationId,
          fundId: fund.id,
          name: a.name,
          type: a.type,
        })),
      }),
    );

    // 5. Attempt payout request when cash balance is 0 GHS
    await request(app.getHttpServer())
      .post('/payouts/requests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amountValue: '50.00',
        fundId: fund.id,
        recipientId: recipientRes.body.id,
        purpose: 'Hospitalization assistance',
      })
      .expect(400); // Insufficient fund balance!

    // 6. Post mock cash deposit directly in DB to simulate available cash
    const cashAccount = await prisma.withTenant(organisationId, (tx) =>
      tx.ledgerAccount.findFirst({
        where: { fundId: fund.id, name: 'Cash' },
      }),
    );
    const expenseAccount = await prisma.withTenant(organisationId, (tx) =>
      tx.ledgerAccount.findFirst({
        where: { fundId: fund.id, name: 'Benefits Expense' },
      }),
    );

    // Manually create journal entry for initial deposit funding
    const fundingEntry = await prisma.withTenant(organisationId, (tx) =>
      tx.journalEntry.create({
        data: {
          organisationId,
          fundId: fund.id,
          description: 'Initial funding deposit',
          sourceType: 'general',
          createdBy: adminMemberId,
          lines: {
            create: [
              {
                organisationId,
                ledgerAccountId: cashAccount!.id,
                debit: '2000.00',
              },
              {
                organisationId,
                ledgerAccountId: expenseAccount!.id, // Offsetting credit line
                credit: '2000.00',
              },
            ],
          },
        },
      }),
    );
    expect(fundingEntry.id).toBeDefined();

    // 7. Verify balance is now 2000 GHS
    const cashBalanceRes = await request(app.getHttpServer())
      .get(`/ledger-accounts/${cashAccount!.id}/balance`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(cashBalanceRes.body.balance).toBe('2000');

    // 8. Create valid Payout Request (Amount = 50.00 GHS, less than thresholdOne GHS 100)
    const requestRes1 = await request(app.getHttpServer())
      .post('/payouts/requests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amountValue: '50.00',
        fundId: fund.id,
        recipientId: recipientRes.body.id,
        purpose: 'Hospitalization assistance',
      })
      .expect(201);

    expect(requestRes1.body.status).toBe('PENDING');

    // 9. Enforce Maker-Checker: Requester (Admin) attempts to approve their own request
    await request(app.getHttpServer())
      .post(`/payouts/requests/${requestRes1.body.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        decision: 'APPROVED',
        comment: 'Looks fine to me!',
      })
      .expect(403); // ForbiddenException (Maker-checker validation)

    // 10. Checker approvals flow: Checker approves the request (requires 1 approver since 50 < 100)
    const approvedRes1 = await request(app.getHttpServer())
      .post(`/payouts/requests/${requestRes1.body.id}/approve`)
      .set('Authorization', `Bearer ${checkerToken}`)
      .send({
        decision: 'APPROVED',
        comment: 'Valid medical emergency, approved.',
      })
      .expect(201);

    expect(approvedRes1.body.status).toBe('SUCCEEDED'); // Complete!

    // Verify Cash balance is now decreased to 1950 GHS
    const finalBalanceRes1 = await request(app.getHttpServer())
      .get(`/ledger-accounts/${cashAccount!.id}/balance`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(finalBalanceRes1.body.balance).toBe('1950');

    // 11. Create a medium-sized payout request (Amount = 250.00 GHS, between 100 and 500)
    // Requires 2 checkers to approve before completing.
    const requestRes2 = await request(app.getHttpServer())
      .post('/payouts/requests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amountValue: '250.00',
        fundId: fund.id,
        recipientId: recipientRes.body.id,
        purpose: 'Medium assistance request',
      })
      .expect(201);

    expect(requestRes2.body.status).toBe('PENDING');

    // First checker (Checker Admin) approves
    const pendingApprovalRes = await request(app.getHttpServer())
      .post(`/payouts/requests/${requestRes2.body.id}/approve`)
      .set('Authorization', `Bearer ${checkerToken}`)
      .send({
        decision: 'APPROVED',
        comment: 'Approved by first checker.',
      })
      .expect(201);

    // Request is still PENDING because we need 2 approvals for 250 GHS (> 100 GHS threshold)
    expect(pendingApprovalRes.body.status).toBe('PENDING');

    // Register a 3rd user to act as second checker
    const { token: checker2Token } = await registerMember(organisationId);

    const completedApprovalRes = await request(app.getHttpServer())
      .post(`/payouts/requests/${requestRes2.body.id}/approve`)
      .set('Authorization', `Bearer ${checker2Token}`)
      .send({
        decision: 'APPROVED',
        comment: 'Approved by second checker.',
      })
      .expect(201);

    expect(completedApprovalRes.body.status).toBe('SUCCEEDED'); // Complete!

    // Cash balance is now decreased by 250 GHS to 1700 GHS
    const finalBalanceRes2 = await request(app.getHttpServer())
      .get(`/ledger-accounts/${cashAccount!.id}/balance`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(finalBalanceRes2.body.balance).toBe('1700');

    // 12. Enforce Daily Limit (Attempting a payout of 800 GHS, daily total so far is 50 + 250 = 300, daily limit is 1000)
    // 300 + 800 = 1100 > 1000 limit, should be rejected!
    await request(app.getHttpServer())
      .post('/payouts/requests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amountValue: '800.00',
        fundId: fund.id,
        recipientId: recipientRes.body.id,
        purpose: 'Attempting to exceed daily limits policy',
      })
      .expect(400); // Daily payout limit exceeded!
  });
});
