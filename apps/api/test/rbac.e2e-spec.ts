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

interface RoleResponse {
  id: string;
  name: string;
  isTemplate: boolean;
  permissions: { resource: string; action: string; scope: string }[];
}

interface RoleAssignmentResponse {
  id: string;
  roleId: string;
  memberId: string;
  termStart: string;
  termEnd: string | null;
  role?: RoleResponse;
}

interface RuleResponse {
  id: string;
  status: string;
}

// Phase 1 roadmap slice 6: RBAC core (§13) — replaces the placeholder
// Member.role ADMIN/MEMBER check used everywhere since slice 1 with a
// real, live, DB-backed permission system. Real HTTP requests, real
// Postgres, same style as the earlier e2e specs.
describe('RBAC (e2e)', () => {
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
        tx.contributionPlan.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.memberStatusChange.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.chapter.deleteMany({ where: { organisationId } }),
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
    return `+233-rbac-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

  it('seeds the 7 starter role templates and assigns the founding admin the Org Admin role', async () => {
    const admin = await registerOrganisation('RBAC Templates Org');

    const rolesRes = await request(app.getHttpServer())
      .get('/roles')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const roles = rolesRes.body as RoleResponse[];
    const names = roles.map((r) => r.name).sort();
    expect(names).toEqual(
      [
        'Auditor',
        'Committee Chair',
        'Convener',
        'Member',
        'Org Admin',
        'Patron',
        'Treasurer',
      ].sort(),
    );
    expect(roles.every((r) => r.isTemplate)).toBe(true);

    const orgAdminRole = roles.find((r) => r.name === 'Org Admin');
    expect(orgAdminRole?.permissions).toEqual([
      { resource: '*', action: '*', scope: 'organisation' },
    ]);

    const assignmentsRes = await request(app.getHttpServer())
      .get(`/members/${admin.identity.memberId}/roles`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const assignments = assignmentsRes.body as RoleAssignmentResponse[];
    expect(assignments.some((a) => a.roleId === orgAdminRole?.id)).toBe(true);
  });

  it('assigns a joining member the Member template role automatically', async () => {
    const admin = await registerOrganisation('RBAC Join Org');
    const member = await joinOrganisation(admin.identity.organisationId);

    const rolesRes = await request(app.getHttpServer())
      .get('/roles')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const memberTemplate = (rolesRes.body as RoleResponse[]).find(
      (r) => r.name === 'Member',
    );

    const assignmentsRes = await request(app.getHttpServer())
      .get(`/members/${member.identity.memberId}/roles`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const assignments = assignmentsRes.body as RoleAssignmentResponse[];
    expect(assignments.some((a) => a.roleId === memberTemplate?.id)).toBe(true);
  });

  it('a member cannot create or assign roles; an admin can', async () => {
    const admin = await registerOrganisation('RBAC Create Role Org');
    const member = await joinOrganisation(admin.identity.organisationId);

    await request(app.getHttpServer())
      .post('/roles')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({
        name: 'Custom Role',
        permissions: [{ resource: 'member', action: 'view', scope: 'own' }],
      })
      .expect(403);

    const createRes = await request(app.getHttpServer())
      .post('/roles')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: 'Custom Reader',
        permissions: [
          { resource: 'ledger', action: 'view', scope: 'organisation' },
        ],
      })
      .expect(201);
    const customRole = createRes.body as RoleResponse;
    expect(customRole.isTemplate).toBe(false);

    await request(app.getHttpServer())
      .post(`/roles/${customRole.id}/assignments`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ memberId: member.identity.memberId })
      .expect(403);
  });

  it('granting a member an admin-equivalent role actually unlocks admin-only actions, and revoking it locks them again', async () => {
    const admin = await registerOrganisation('RBAC Grant Revoke Org');
    const member = await joinOrganisation(admin.identity.organisationId);

    // Ordinary member: admin-only action fails.
    await request(app.getHttpServer())
      .post('/chapters')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ name: 'Should fail' })
      .expect(403);

    const rolesRes = await request(app.getHttpServer())
      .get('/roles')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const orgAdminRole = (rolesRes.body as RoleResponse[]).find(
      (r) => r.name === 'Org Admin',
    );

    const assignRes = await request(app.getHttpServer())
      .post(`/roles/${orgAdminRole?.id}/assignments`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ memberId: member.identity.memberId })
      .expect(201);
    const assignment = assignRes.body as RoleAssignmentResponse;

    // Now holding Org Admin too: the same action succeeds. No new JWT
    // needed — the check is live against the DB, not a cached claim.
    await request(app.getHttpServer())
      .post('/chapters')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ name: 'Now allowed' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/role-assignments/${assignment.id}/revoke`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    // Revoked: locked out again immediately, same token still in use.
    await request(app.getHttpServer())
      .post('/chapters')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ name: 'Should fail again' })
      .expect(403);
  });

  it('an assignment with termEnd already in the past does not grant access', async () => {
    const admin = await registerOrganisation('RBAC Expired Org');
    const member = await joinOrganisation(admin.identity.organisationId);

    const rolesRes = await request(app.getHttpServer())
      .get('/roles')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const orgAdminRole = (rolesRes.body as RoleResponse[]).find(
      (r) => r.name === 'Org Admin',
    );

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await request(app.getHttpServer())
      .post(`/roles/${orgAdminRole?.id}/assignments`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ memberId: member.identity.memberId, termEnd: yesterday })
      .expect(201);

    // FR-AUD-01: a time-boxed grant that's already ended behaves as if it
    // was never there — the member is still just an ordinary member.
    await request(app.getHttpServer())
      .post('/chapters')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ name: 'Should still fail' })
      .expect(403);
  });

  it('maker-checker (when enabled) blocks the creator of a rule from also activating it', async () => {
    const admin = await registerOrganisation('RBAC Maker Checker Org');
    const secondAdmin = await joinOrganisation(admin.identity.organisationId);

    // No endpoint exists yet to toggle org settings (out of scope for this
    // slice) — set directly, same precedent as other tests seeding data
    // Prisma-side when no HTTP surface exists for it yet.
    await prisma.withTenant(admin.identity.organisationId, (tx) =>
      tx.organisation.update({
        where: { id: admin.identity.organisationId },
        data: { makerCheckerEnabled: true },
      }),
    );

    const rolesRes = await request(app.getHttpServer())
      .get('/roles')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const orgAdminRole = (rolesRes.body as RoleResponse[]).find(
      (r) => r.name === 'Org Admin',
    );
    await request(app.getHttpServer())
      .post(`/roles/${orgAdminRole?.id}/assignments`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ memberId: secondAdmin.identity.memberId })
      .expect(201);

    const createRes = await request(app.getHttpServer())
      .post('/contribution-plans')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: 'Maker Checker Plan',
        cadence: 'monthly',
        amountValue: '10.00',
        currency: 'GHS',
      })
      .expect(201);
    const plan = createRes.body as RuleResponse;

    // The creator cannot also be the sole approver.
    await request(app.getHttpServer())
      .post(`/contribution-plans/${plan.id}/activate`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({})
      .expect(403);

    // A different Org Admin can.
    const activateRes = await request(app.getHttpServer())
      .post(`/contribution-plans/${plan.id}/activate`)
      .set('Authorization', `Bearer ${secondAdmin.accessToken}`)
      .send({})
      .expect(201);
    expect((activateRes.body as RuleResponse).status).toBe('ACTIVE');
  });

  it('maker-checker (default off) allows the creator to activate their own rule', async () => {
    const admin = await registerOrganisation('RBAC No Maker Checker Org');

    const createRes = await request(app.getHttpServer())
      .post('/contribution-plans')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: 'Self-Approved Plan',
        cadence: 'monthly',
        amountValue: '10.00',
        currency: 'GHS',
      })
      .expect(201);
    const plan = createRes.body as RuleResponse;

    const activateRes = await request(app.getHttpServer())
      .post(`/contribution-plans/${plan.id}/activate`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({})
      .expect(201);
    expect((activateRes.body as RuleResponse).status).toBe('ACTIVE');
  });

  it("cross-tenant: an admin cannot see or assign another organisation's roles", async () => {
    const orgA = await registerOrganisation('RBAC Cross-Tenant Org A');
    const orgB = await registerOrganisation('RBAC Cross-Tenant Org B');

    const rolesA = await request(app.getHttpServer())
      .get('/roles')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .expect(200);
    const orgAAdminRole = (rolesA.body as RoleResponse[]).find(
      (r) => r.name === 'Org Admin',
    );

    await request(app.getHttpServer())
      .post(`/roles/${orgAAdminRole?.id}/assignments`)
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .send({ memberId: orgB.identity.memberId })
      .expect(404);
  });
});
