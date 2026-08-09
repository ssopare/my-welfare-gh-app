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
  approvalChain: string[];
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

interface RoleResponse {
  id: string;
  name: string;
}

interface RoleAssignmentResponse {
  id: string;
  roleId: string;
}

interface ClaimResponse {
  id: string;
  status: string;
  currentStageIndex: number;
  amountValue: string;
  currency: string;
  journalEntryId: string | null;
  evidence: { evidenceType: string; description: string }[];
}

interface EligibilityErrorBody {
  message: string;
  checks?: { description: string; passed: boolean }[];
}

// Phase 1 roadmap slice 7: Claims (§8.6) — the slice that finally connects
// the rule engine (slice 3, eligibility + amount), the ledger (slice 4,
// disbursement postings) and RBAC (slice 6, who may approve/disburse).
// Real HTTP requests, real Postgres, same style as the earlier e2e specs.
describe('Claims (e2e)', () => {
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
        tx.member.deleteMany({ where: { organisationId } }),
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
    return `+233-claims-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

  async function createActiveBenefitRule(
    adminToken: string,
    overrides: Record<string, unknown> = {},
  ): Promise<RuleResponse> {
    const createRes = await request(app.getHttpServer())
      .post('/benefit-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Bereavement Benefit',
        triggerEvent: 'member.death',
        subjectTypes: ['self'],
        amountValue: '500.00',
        currency: 'GHS',
        occurrenceCapMax: 1,
        approvalChain: [],
        ...overrides,
      })
      .expect(201);
    const rule = createRes.body as RuleResponse;
    const activateRes = await request(app.getHttpServer())
      .post(`/benefit-rules/${rule.id}/activate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);
    return activateRes.body as RuleResponse;
  }

  // Grants a real, DB-backed permission via the Treasurer template (holds
  // claim:approve and ledger:disburse — exactly the two this slice wires
  // up), same mechanism proven in rbac.e2e-spec.ts.
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

  it('blocks submission with an explainable reason when the member is not eligible', async () => {
    const admin = await registerOrganisation('Claims Ineligible Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    // Freshly joined: still PENDING, so goodStandingRequired (default true)
    // fails — never set to ACTIVE.
    const rule = await createActiveBenefitRule(admin.accessToken);

    const res = await request(app.getHttpServer())
      .post(`/benefit-rules/${rule.id}/claims`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        eventDate: new Date().toISOString(),
      })
      .expect(400);
    const body = res.body as EligibilityErrorBody;
    expect(body.message).toContain('not eligible');
    expect(body.checks?.some((c) => !c.passed)).toBe(true);
  });

  it('requires every evidenceRequired type to be supplied before accepting a submission', async () => {
    const admin = await registerOrganisation('Claims Evidence Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    const rule = await createActiveBenefitRule(admin.accessToken, {
      evidenceRequired: ['death_certificate'],
      approvalChain: ['treasurer_disburse'],
    });

    await request(app.getHttpServer())
      .post(`/benefit-rules/${rule.id}/claims`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        eventDate: new Date().toISOString(),
      })
      .expect(400);

    const res = await request(app.getHttpServer())
      .post(`/benefit-rules/${rule.id}/claims`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        eventDate: new Date().toISOString(),
        evidence: [
          {
            evidenceType: 'death_certificate',
            description: 'Certificate #1, held by Secretary',
          },
        ],
      })
      .expect(201);
    const claim = res.body as ClaimResponse;
    expect(claim.evidence).toHaveLength(1);
    expect(claim.amountValue).toBe('500');
    expect(claim.status).toBe('SUBMITTED');
  });

  it('routes a claim through a 2-stage approval chain and disburses a balanced ledger entry on approval', async () => {
    const admin = await registerOrganisation('Claims Approval Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const approver = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    await grantTreasurer(admin.accessToken, approver.identity.memberId);

    const fund = await createFund(admin.accessToken);
    const rule = await createActiveBenefitRule(admin.accessToken, {
      approvalChain: ['convener_verify', 'treasurer_disburse'],
    });

    const submitRes = await request(app.getHttpServer())
      .post(`/benefit-rules/${rule.id}/claims`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        eventDate: new Date().toISOString(),
      })
      .expect(201);
    const claim = submitRes.body as ClaimResponse;
    expect(claim.status).toBe('SUBMITTED');
    expect(claim.currentStageIndex).toBe(0);

    // A member without claim:approve cannot decide.
    await request(app.getHttpServer())
      .post(`/claims/${claim.id}/decide`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ decision: 'APPROVE' })
      .expect(403);

    // Stage 0: approving advances the stage, doesn't finish the claim.
    const stage0Res = await request(app.getHttpServer())
      .post(`/claims/${claim.id}/decide`)
      .set('Authorization', `Bearer ${approver.accessToken}`)
      .send({ decision: 'APPROVE', comment: 'Verified' })
      .expect(201);
    const afterStage0 = stage0Res.body as ClaimResponse;
    expect(afterStage0.status).toBe('SUBMITTED');
    expect(afterStage0.currentStageIndex).toBe(1);

    // Cannot disburse before every stage clears.
    await request(app.getHttpServer())
      .post(`/claims/${claim.id}/disburse`)
      .set('Authorization', `Bearer ${approver.accessToken}`)
      .send({ fundId: fund.id })
      .expect(400);

    // Stage 1 (final): approving clears the whole claim.
    const stage1Res = await request(app.getHttpServer())
      .post(`/claims/${claim.id}/decide`)
      .set('Authorization', `Bearer ${approver.accessToken}`)
      .send({ decision: 'APPROVE' })
      .expect(201);
    expect((stage1Res.body as ClaimResponse).status).toBe('APPROVED');

    const disburseRes = await request(app.getHttpServer())
      .post(`/claims/${claim.id}/disburse`)
      .set('Authorization', `Bearer ${approver.accessToken}`)
      .send({ fundId: fund.id })
      .expect(201);
    const paid = disburseRes.body as ClaimResponse;
    expect(paid.status).toBe('PAID');
    expect(paid.journalEntryId).toBeTruthy();

    const expenseAccount = fund.ledgerAccounts.find(
      (a) => a.name === 'Benefits Expense',
    );
    const balanceRes = await request(app.getHttpServer())
      .get(`/ledger-accounts/${expenseAccount?.id}/balance`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect((balanceRes.body as { balance: string }).balance).toBe('500');

    // Cannot disburse twice.
    await request(app.getHttpServer())
      .post(`/claims/${claim.id}/disburse`)
      .set('Authorization', `Bearer ${approver.accessToken}`)
      .send({ fundId: fund.id })
      .expect(400);
  });

  it('a REJECT at any stage is terminal', async () => {
    const admin = await registerOrganisation('Claims Reject Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const approver = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    await grantTreasurer(admin.accessToken, approver.identity.memberId);
    const rule = await createActiveBenefitRule(admin.accessToken, {
      approvalChain: ['treasurer_disburse'],
    });

    const submitRes = await request(app.getHttpServer())
      .post(`/benefit-rules/${rule.id}/claims`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        eventDate: new Date().toISOString(),
      })
      .expect(201);
    const claim = submitRes.body as ClaimResponse;

    const rejectRes = await request(app.getHttpServer())
      .post(`/claims/${claim.id}/decide`)
      .set('Authorization', `Bearer ${approver.accessToken}`)
      .send({ decision: 'REJECT', comment: 'Not enough tenure' })
      .expect(201);
    expect((rejectRes.body as ClaimResponse).status).toBe('REJECTED');

    // A rejected claim can never be decided again.
    await request(app.getHttpServer())
      .post(`/claims/${claim.id}/decide`)
      .set('Authorization', `Bearer ${approver.accessToken}`)
      .send({ decision: 'APPROVE' })
      .expect(400);
  });

  it('occurrenceCap (lifetime): a second claim for the same member is blocked once the cap is reached', async () => {
    const admin = await registerOrganisation('Claims OccurrenceCap Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    const rule = await createActiveBenefitRule(admin.accessToken, {
      occurrenceCapMax: 1,
    });

    await request(app.getHttpServer())
      .post(`/benefit-rules/${rule.id}/claims`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        eventDate: new Date().toISOString(),
      })
      .expect(201);

    const secondRes = await request(app.getHttpServer())
      .post(`/benefit-rules/${rule.id}/claims`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        eventDate: new Date().toISOString(),
      })
      .expect(400);
    const body = secondRes.body as EligibilityErrorBody;
    const capCheck = body.checks?.find((c) =>
      c.description.includes('claim(s)'),
    );
    expect(capCheck?.passed).toBe(false);
  });

  it('maker-checker (when enabled) blocks a claim submitter from deciding their own claim', async () => {
    const admin = await registerOrganisation('Claims Maker Checker Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    await grantTreasurer(admin.accessToken, member.identity.memberId);
    const rule = await createActiveBenefitRule(admin.accessToken, {
      approvalChain: ['treasurer_disburse'],
    });
    // Enabled *after* the rule is created/activated — maker-checker also
    // gates BenefitRule.activate() itself (slice 6), and this admin is
    // both the creator and the only other approver here.
    await prisma.withTenant(admin.identity.organisationId, (tx) =>
      tx.organisation.update({
        where: { id: admin.identity.organisationId },
        data: { makerCheckerEnabled: true },
      }),
    );

    const submitRes = await request(app.getHttpServer())
      .post(`/benefit-rules/${rule.id}/claims`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        eventDate: new Date().toISOString(),
      })
      .expect(201);
    const claim = submitRes.body as ClaimResponse;

    // The member holds Treasurer (claim:approve) but also submitted this
    // exact claim themselves — maker-checker blocks it.
    await request(app.getHttpServer())
      .post(`/claims/${claim.id}/decide`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ decision: 'APPROVE' })
      .expect(403);
  });

  it("an admin can submit a claim on a member's behalf; self/admin gates GET access; cross-tenant isolated", async () => {
    const admin = await registerOrganisation('Claims Access Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const otherMember = await joinOrganisation(admin.identity.organisationId);
    const otherOrgAdmin = await registerOrganisation('Claims Other Org');
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    const rule = await createActiveBenefitRule(admin.accessToken);

    const submitRes = await request(app.getHttpServer())
      .post(`/benefit-rules/${rule.id}/claims`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        eventDate: new Date().toISOString(),
      })
      .expect(201);
    const claim = submitRes.body as ClaimResponse;

    // Self can view.
    await request(app.getHttpServer())
      .get(`/claims/${claim.id}`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(200);

    // An ordinary member normally holds the Member template's own-scope
    // claim:view — RbacService.hasPermission doesn't enforce *scope* yet
    // (documented limitation, see rbac.types.ts), so that alone would
    // technically pass here. Revoke it to prove findOne's check is a real,
    // live permission gate: with no matching grant at all, access is
    // denied.
    const assignmentsRes = await request(app.getHttpServer())
      .get(`/members/${otherMember.identity.memberId}/roles`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const memberAssignment = (
      assignmentsRes.body as RoleAssignmentResponse[]
    )[0];
    await request(app.getHttpServer())
      .patch(`/role-assignments/${memberAssignment.id}/revoke`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/claims/${claim.id}`)
      .set('Authorization', `Bearer ${otherMember.accessToken}`)
      .expect(403);

    // A different organisation's admin can't even see it exists.
    await request(app.getHttpServer())
      .get(`/claims/${claim.id}`)
      .set('Authorization', `Bearer ${otherOrgAdmin.accessToken}`)
      .expect(404);

    const listRes = await request(app.getHttpServer())
      .get(`/members/${member.identity.memberId}/claims`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(200);
    expect(
      (listRes.body as ClaimResponse[]).some((c) => c.id === claim.id),
    ).toBe(true);
  });
});
