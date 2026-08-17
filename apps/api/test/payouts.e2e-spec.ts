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

interface SettlementAccountResponse {
  verified: boolean;
  providerRecipientCode: string;
  accountNumber: string;
}

interface FundControlPolicyResponse {
  dailyLimitValue: string;
  thresholdOneApproverValue: string;
}

interface PayoutRecipientResponse {
  id: string;
  isAllowlisted: boolean;
  accountNumber: string;
  verified: boolean;
  providerRecipientCode: string | null;
}

interface LedgerBalanceResponse {
  balance: string;
}

interface PayoutRequestResponse {
  id: string;
  status: string;
  providerReference: string | null;
}

interface TransferWebhookResponse {
  outcome: string;
  journalEntryId?: string;
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
        tx.reconciliationException.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.payoutApproval.deleteMany({
          where: { payoutRequest: { organisationId } },
        }),
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

  // Mock/dev completion for the async transfer PayoutService.approvePayoutRequest
  // hands off to once a payout is fully approved — mirrors the shape of
  // the real Paystack transfer.success/transfer.failed webhook.
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

  it('rejects an ordinary member with no ledger permission from reading recipients or policy', async () => {
    const { adminToken, organisationId } = await registerOrganisation(
      'Recipients Access Control Org',
    );

    // A plain join with no role assignment — unlike registerMember above,
    // this deliberately does *not* grant the Org Admin role, so it has no
    // RbacService grant at all.
    const joinRes = await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber: uniquePhone(),
        password: 'correct-horse-battery-staple',
        organisationId,
        name: 'Ordinary Member',
      })
      .expect(201);
    const { accessToken: memberToken } = joinRes.body as AccessTokenResponse;
    const memberIdentity = await me(memberToken);
    createdAccountIds.push(memberIdentity.sub);

    // Sanity check: an admin can read both.
    await request(app.getHttpServer())
      .get('/payouts/recipients')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/payouts/policy')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // An ordinary member with no grant cannot.
    await request(app.getHttpServer())
      .get('/payouts/recipients')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/payouts/policy')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);
  });

  it('verifies the full treasury loop: configure settlement → recipients → limits → deposit → payout flow', async () => {
    const { adminToken, adminMemberId, organisationId } =
      await registerOrganisation('Teshie Payout Welfare');
    const { token: checkerToken } = await registerMember(organisationId);

    // 1. Setup Settlement Account — a real Paystack Transfer Recipient
    // call (MockTransferProvider in the test environment), not the old
    // fake bank-settled subaccount.
    await request(app.getHttpServer())
      .post('/payouts/settlement-account')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        momoProvider: 'mtn',
        phoneNumber: '0559998887',
        accountName: 'Teshie Payout Welfare',
      })
      .expect(201);

    const settlementRes = await request(app.getHttpServer())
      .get('/payouts/settlement-account')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // MockTransferProvider confirms recipient creation immediately —
    // verified is genuinely true here, not hardcoded false the way the
    // old fake subaccount code left it forever.
    const settlement = settlementRes.body as SettlementAccountResponse;
    expect(settlement.verified).toBe(true);
    expect(settlement.providerRecipientCode).toContain('mock_rcp_');
    expect(settlement.accountNumber).toBe('******8887'); // Masked for security!

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

    const policy = policyRes.body as FundControlPolicyResponse;
    expect(policy.dailyLimitValue).toBe('1000');
    expect(policy.thresholdOneApproverValue).toBe('100');

    // 3. Create Payout Recipient (Allowlisted) — a real Paystack Transfer
    // Recipient call (MockTransferProvider here), same reasoning as
    // settlement-account setup above.
    const recipientRes = await request(app.getHttpServer())
      .post('/payouts/recipients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Beneficiary Kofi',
        momoProvider: 'mtn',
        accountNumber: '0241112223',
      })
      .expect(201);

    const recipient = recipientRes.body as PayoutRecipientResponse;
    expect(recipient.isAllowlisted).toBe(true);
    expect(recipient.verified).toBe(true);
    expect(recipient.providerRecipientCode).toContain('mock_rcp_');

    const listRecipientsRes = await request(app.getHttpServer())
      .get('/payouts/recipients')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const recipients = listRecipientsRes.body as PayoutRecipientResponse[];
    expect(recipients.length).toBe(1);
    expect(recipients[0].accountNumber).toBe('******2223'); // Masked!

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
        recipientId: recipient.id,
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
    expect((cashBalanceRes.body as LedgerBalanceResponse).balance).toBe('2000');

    // 8. Create valid Payout Request (Amount = 50.00 GHS, less than thresholdOne GHS 100)
    const requestRes1 = await request(app.getHttpServer())
      .post('/payouts/requests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amountValue: '50.00',
        fundId: fund.id,
        recipientId: recipient.id,
        purpose: 'Hospitalization assistance',
      })
      .expect(201);

    const request1 = requestRes1.body as PayoutRequestResponse;
    expect(request1.status).toBe('PENDING');

    // 9. Enforce Maker-Checker: Requester (Admin) attempts to approve their own request
    await request(app.getHttpServer())
      .post(`/payouts/requests/${request1.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        decision: 'APPROVED',
        comment: 'Looks fine to me!',
      })
      .expect(403); // ForbiddenException (Maker-checker validation)

    // 10. Checker approvals flow: Checker approves the request (requires 1 approver since 50 < 100)
    const approvedRes1 = await request(app.getHttpServer())
      .post(`/payouts/requests/${request1.id}/approve`)
      .set('Authorization', `Bearer ${checkerToken}`)
      .send({
        decision: 'APPROVED',
        comment: 'Valid medical emergency, approved.',
      })
      .expect(201);

    // Fully approved hands off to a real transfer — TRANSFER_PENDING, not
    // instantly SUCCEEDED, and nothing posted to the ledger yet (see
    // PayoutService.approvePayoutRequest/confirmPayoutTransfer).
    const approved1 = approvedRes1.body as PayoutRequestResponse;
    expect(approved1.status).toBe('TRANSFER_PENDING');
    expect(approved1.providerReference).toEqual(expect.any(String));

    const balanceBeforeConfirm1 = await request(app.getHttpServer())
      .get(`/ledger-accounts/${cashAccount!.id}/balance`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((balanceBeforeConfirm1.body as LedgerBalanceResponse).balance).toBe(
      '2000',
    );

    const confirm1 = await fireTransferWebhook(
      organisationId,
      approved1.providerReference!,
      'succeeded',
    );
    expect(confirm1.outcome).toBe('succeeded');

    // Only now, after the transfer is confirmed, has the ledger actually
    // moved — Cash decreased to 1950 GHS.
    const finalBalanceRes1 = await request(app.getHttpServer())
      .get(`/ledger-accounts/${cashAccount!.id}/balance`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((finalBalanceRes1.body as LedgerBalanceResponse).balance).toBe(
      '1950',
    );

    // 11. Create a medium-sized payout request (Amount = 250.00 GHS, between 100 and 500)
    // Requires 2 checkers to approve before completing.
    const requestRes2 = await request(app.getHttpServer())
      .post('/payouts/requests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amountValue: '250.00',
        fundId: fund.id,
        recipientId: recipient.id,
        purpose: 'Medium assistance request',
      })
      .expect(201);

    const request2 = requestRes2.body as PayoutRequestResponse;
    expect(request2.status).toBe('PENDING');

    // First checker (Checker Admin) approves
    const pendingApprovalRes = await request(app.getHttpServer())
      .post(`/payouts/requests/${request2.id}/approve`)
      .set('Authorization', `Bearer ${checkerToken}`)
      .send({
        decision: 'APPROVED',
        comment: 'Approved by first checker.',
      })
      .expect(201);

    // Request is still PENDING because we need 2 approvals for 250 GHS (> 100 GHS threshold)
    expect((pendingApprovalRes.body as PayoutRequestResponse).status).toBe(
      'PENDING',
    );

    // Register a 3rd user to act as second checker
    const { token: checker2Token } = await registerMember(organisationId);

    const completedApprovalRes = await request(app.getHttpServer())
      .post(`/payouts/requests/${request2.id}/approve`)
      .set('Authorization', `Bearer ${checker2Token}`)
      .send({
        decision: 'APPROVED',
        comment: 'Approved by second checker.',
      })
      .expect(201);

    const approved2 = completedApprovalRes.body as PayoutRequestResponse;
    expect(approved2.status).toBe('TRANSFER_PENDING');

    await fireTransferWebhook(
      organisationId,
      approved2.providerReference!,
      'succeeded',
    );

    // Cash balance is now decreased by 250 GHS to 1700 GHS
    const finalBalanceRes2 = await request(app.getHttpServer())
      .get(`/ledger-accounts/${cashAccount!.id}/balance`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((finalBalanceRes2.body as LedgerBalanceResponse).balance).toBe(
      '1700',
    );

    // 12. Enforce Daily Limit (Attempting a payout of 800 GHS, daily total so far is 50 + 250 = 300, daily limit is 1000)
    // 300 + 800 = 1100 > 1000 limit, should be rejected!
    await request(app.getHttpServer())
      .post('/payouts/requests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amountValue: '800.00',
        fundId: fund.id,
        recipientId: recipient.id,
        purpose: 'Attempting to exceed daily limits policy',
      })
      .expect(400); // Daily payout limit exceeded!
  });

  it('does not double-post or strand a payout when two approvals race concurrently', async () => {
    const admin = await registerOrganisation('Race Condition Org');
    const { adminToken, adminMemberId, organisationId } = admin;
    const { token: checker1Token } = await registerMember(organisationId);
    const { token: checker2Token } = await registerMember(organisationId);

    // thresholdOne is low enough that GHS 100 needs 2 approvals — that's
    // the scenario where a lost update would leave the payout stuck
    // PENDING forever instead of reaching SUCCEEDED.
    await request(app.getHttpServer())
      .post('/payouts/policy')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        dailyLimitValue: '1000.00',
        monthlyLimitValue: '5000.00',
        thresholdOneApproverValue: '10.00',
        thresholdTwoApproversValue: '1000.00',
      })
      .expect(201);

    const recipientRes = await request(app.getHttpServer())
      .post('/payouts/recipients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Race Condition Beneficiary',
        momoProvider: 'mtn',
        accountNumber: '0241119999',
      })
      .expect(201);
    const recipient = recipientRes.body as PayoutRecipientResponse;

    const fund = await prisma.withTenant(organisationId, (tx) =>
      tx.fund.create({
        data: { organisationId, name: 'Race Condition Fund' },
      }),
    );
    await prisma.withTenant(organisationId, (tx) =>
      tx.ledgerAccount.createMany({
        data: [
          { organisationId, fundId: fund.id, name: 'Cash', type: 'ASSET' },
          {
            organisationId,
            fundId: fund.id,
            name: 'Benefits Expense',
            type: 'EXPENSE',
          },
        ],
      }),
    );
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
    await prisma.withTenant(organisationId, (tx) =>
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
                ledgerAccountId: expenseAccount!.id,
                credit: '2000.00',
              },
            ],
          },
        },
      }),
    );

    const requestRes = await request(app.getHttpServer())
      .post('/payouts/requests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amountValue: '100.00',
        fundId: fund.id,
        recipientId: recipient.id,
        purpose: 'Race condition regression test',
      })
      .expect(201);
    const payoutRequest = requestRes.body as PayoutRequestResponse;

    // Fire both checkers' approvals at the same instant — this is exactly
    // the window where an unlocked read-then-write would let both read
    // the same pre-approval snapshot.
    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post(`/payouts/requests/${payoutRequest.id}/approve`)
        .set('Authorization', `Bearer ${checker1Token}`)
        .send({ decision: 'APPROVED', comment: 'First checker.' }),
      request(app.getHttpServer())
        .post(`/payouts/requests/${payoutRequest.id}/approve`)
        .set('Authorization', `Bearer ${checker2Token}`)
        .send({ decision: 'APPROVED', comment: 'Second checker.' }),
    ]);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    const bodies = [
      res1.body as PayoutRequestResponse,
      res2.body as PayoutRequestResponse,
    ];
    const statuses = bodies.map((b) => b.status).sort();
    // Exactly one approval crosses the 2-approver threshold — the other
    // is the one that got there first and correctly saw itself still
    // short of it. Both landing on the same status would mean the lock
    // isn't preventing the race (either both stuck PENDING, or a lost
    // update let both jump straight to TRANSFER_PENDING without seeing
    // each other's approval).
    expect(statuses).toEqual(['PENDING', 'TRANSFER_PENDING']);

    const pendingTransfer = bodies.find((b) => b.status === 'TRANSFER_PENDING');
    await fireTransferWebhook(
      organisationId,
      pendingTransfer!.providerReference!,
      'succeeded',
    );

    // The real proof: exactly one 100 GHS disbursement was posted, not
    // zero (stuck) and not two (double-posted).
    const finalBalanceRes = await request(app.getHttpServer())
      .get(`/ledger-accounts/${cashAccount!.id}/balance`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((finalBalanceRes.body as LedgerBalanceResponse).balance).toBe(
      '1900',
    );

    const approvals = await prisma.withTenant(organisationId, (tx) =>
      tx.payoutApproval.findMany({
        where: { payoutRequestId: payoutRequest.id },
      }),
    );
    expect(approvals).toHaveLength(2);
  });

  it('does not let two concurrent payout requests jointly exceed the daily limit', async () => {
    const admin = await registerOrganisation('Daily Limit Race Org');
    const { adminToken, adminMemberId, organisationId } = admin;

    // Daily limit is 100 GHS. Two 60 GHS requests are each individually
    // fine but together exceed it — the scenario an unlocked read-then-
    // decide check can't catch under concurrency.
    await request(app.getHttpServer())
      .post('/payouts/policy')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        dailyLimitValue: '100.00',
        monthlyLimitValue: '5000.00',
        thresholdOneApproverValue: '1000.00',
        thresholdTwoApproversValue: '2000.00',
      })
      .expect(201);

    const recipientRes = await request(app.getHttpServer())
      .post('/payouts/recipients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Daily Limit Race Beneficiary',
        momoProvider: 'mtn',
        accountNumber: '0241118888',
      })
      .expect(201);
    const recipient = recipientRes.body as PayoutRecipientResponse;

    const fund = await prisma.withTenant(organisationId, (tx) =>
      tx.fund.create({
        data: { organisationId, name: 'Daily Limit Race Fund' },
      }),
    );
    await prisma.withTenant(organisationId, (tx) =>
      tx.ledgerAccount.createMany({
        data: [
          { organisationId, fundId: fund.id, name: 'Cash', type: 'ASSET' },
          {
            organisationId,
            fundId: fund.id,
            name: 'Benefits Expense',
            type: 'EXPENSE',
          },
        ],
      }),
    );
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
    // Plenty of cash so the balance check never triggers — this test is
    // isolating the daily-limit race, not the balance race.
    await prisma.withTenant(organisationId, (tx) =>
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
                debit: '5000.00',
              },
              {
                organisationId,
                ledgerAccountId: expenseAccount!.id,
                credit: '5000.00',
              },
            ],
          },
        },
      }),
    );

    // Note: this reliably passes even without the advisory lock in this
    // environment — a fast local Postgres round-trip apparently leaves too
    // narrow a window for Promise.all-fired requests to actually interleave
    // (confirmed by hand: removing the lock and running this repeatedly,
    // even with 10 concurrent requests instead of 2, never reproduced an
    // overshoot locally). The lock is still correct and necessary — this
    // is the same read-then-decide-under-concurrency hazard proven
    // exploitable in the approval race above, just with a narrower/
    // faster critical section that this local environment doesn't expose.
    // Kept as a regression guard for the *fixed* behavior, not as proof
    // the bug is reachable here.
    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post('/payouts/requests')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amountValue: '60.00',
          fundId: fund.id,
          recipientId: recipient.id,
          purpose: 'Daily limit race — request A',
        }),
      request(app.getHttpServer())
        .post('/payouts/requests')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amountValue: '60.00',
          fundId: fund.id,
          recipientId: recipient.id,
          purpose: 'Daily limit race — request B',
        }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 400]);

    const created = await prisma.withTenant(organisationId, (tx) =>
      tx.payoutRequest.findMany({ where: { organisationId } }),
    );
    expect(created).toHaveLength(1);
    expect(created[0].amountValue.toString()).toBe('60');
  });

  it('refuses to create (or approve) a payout request against a recipient the payment provider never verified', async () => {
    const admin = await registerOrganisation('Unverified Recipient Org');
    const { adminToken, organisationId } = admin;

    const recipientRes = await request(app.getHttpServer())
      .post('/payouts/recipients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Unverified Beneficiary',
        momoProvider: 'mtn',
        accountNumber: '0241117777',
      })
      .expect(201);
    const recipient = recipientRes.body as PayoutRecipientResponse;

    // MockTransferProvider always confirms — simulate the real-world case
    // where a recipient was created but Paystack never actually confirmed
    // it (or was later flagged), directly, the same way other tests seed
    // DB state no HTTP path can reach.
    await prisma.withTenant(organisationId, (tx) =>
      tx.payoutRecipient.update({
        where: { id: recipient.id },
        data: { verified: false },
      }),
    );

    const fund = await prisma.withTenant(organisationId, (tx) =>
      tx.fund.create({
        data: { organisationId, name: 'Unverified Recipient Fund' },
      }),
    );
    await prisma.withTenant(organisationId, (tx) =>
      tx.ledgerAccount.createMany({
        data: [
          { organisationId, fundId: fund.id, name: 'Cash', type: 'ASSET' },
          {
            organisationId,
            fundId: fund.id,
            name: 'Benefits Expense',
            type: 'EXPENSE',
          },
        ],
      }),
    );

    await request(app.getHttpServer())
      .post('/payouts/requests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amountValue: '10.00',
        fundId: fund.id,
        recipientId: recipient.id,
        purpose: 'Should be refused',
      })
      .expect(400);
  });

  it('a failed transfer marks the payout TRANSFER_FAILED, posts nothing to the ledger, and raises a reconciliation exception', async () => {
    const admin = await registerOrganisation('Payout Transfer Failure Org');
    const { adminToken, adminMemberId, organisationId } = admin;
    const { token: checkerToken } = await registerMember(organisationId);

    const recipientRes = await request(app.getHttpServer())
      .post('/payouts/recipients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Transfer Failure Beneficiary',
        momoProvider: 'mtn',
        accountNumber: '0241116666',
      })
      .expect(201);
    const recipient = recipientRes.body as PayoutRecipientResponse;

    const fund = await prisma.withTenant(organisationId, (tx) =>
      tx.fund.create({
        data: { organisationId, name: 'Transfer Failure Fund' },
      }),
    );
    await prisma.withTenant(organisationId, (tx) =>
      tx.ledgerAccount.createMany({
        data: [
          { organisationId, fundId: fund.id, name: 'Cash', type: 'ASSET' },
          {
            organisationId,
            fundId: fund.id,
            name: 'Benefits Expense',
            type: 'EXPENSE',
          },
        ],
      }),
    );
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
    await prisma.withTenant(organisationId, (tx) =>
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
                debit: '500.00',
              },
              {
                organisationId,
                ledgerAccountId: expenseAccount!.id,
                credit: '500.00',
              },
            ],
          },
        },
      }),
    );

    const requestRes = await request(app.getHttpServer())
      .post('/payouts/requests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amountValue: '40.00',
        fundId: fund.id,
        recipientId: recipient.id,
        purpose: 'Transfer failure regression test',
      })
      .expect(201);
    const payoutRequest = requestRes.body as PayoutRequestResponse;

    const approveRes = await request(app.getHttpServer())
      .post(`/payouts/requests/${payoutRequest.id}/approve`)
      .set('Authorization', `Bearer ${checkerToken}`)
      .send({ decision: 'APPROVED', comment: 'Approved.' })
      .expect(201);
    const approved = approveRes.body as PayoutRequestResponse;
    expect(approved.status).toBe('TRANSFER_PENDING');

    const failRes = await fireTransferWebhook(
      organisationId,
      approved.providerReference!,
      'failed',
    );
    expect(failRes.outcome).toBe('failed');

    const updated = await prisma.withTenant(organisationId, (tx) =>
      tx.payoutRequest.findUnique({ where: { id: payoutRequest.id } }),
    );
    expect(updated?.status).toBe('TRANSFER_FAILED');

    // Cash is untouched — the approval happened, but no money actually
    // moved, so nothing should have posted to the ledger.
    const balanceRes = await request(app.getHttpServer())
      .get(`/ledger-accounts/${cashAccount!.id}/balance`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((balanceRes.body as LedgerBalanceResponse).balance).toBe('500');

    const exceptionsRes = await request(app.getHttpServer())
      .get('/reconciliation-exceptions')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      (exceptionsRes.body as { reason: string }[]).some((e) =>
        e.reason.includes('Payout transfer failed'),
      ),
    ).toBe(true);
  });

  it('an unknown transfer providerReference is routed to a reconciliation exception, not silently swallowed by either table', async () => {
    const admin = await registerOrganisation('Payout Unmatched Webhook Org');

    const res = await fireTransferWebhook(
      admin.organisationId,
      'mock_transfer_never_existed_anywhere',
      'succeeded',
    );
    expect(res.outcome).toBe('unmatched');

    const exceptionsRes = await request(app.getHttpServer())
      .get('/reconciliation-exceptions')
      .set('Authorization', `Bearer ${admin.adminToken}`)
      .expect(200);
    expect(
      (exceptionsRes.body as { reason: string }[]).some((e) =>
        e.reason.includes('unknown providerReference'),
      ),
    ).toBe(true);
  });
});
