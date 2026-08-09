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

interface GovernanceBodyResponse {
  id: string;
  name: string;
  maxConsecutiveTerms: number | null;
  coolingOffPeriodMonths: number | null;
}

interface RoleResponse {
  id: string;
  name: string;
}

interface RoleAssignmentResponse {
  id: string;
  memberId: string;
  roleId: string;
  governanceBodyId: string | null;
  termStart: string;
  termEnd: string | null;
}

// Phase 1 post-roadmap: Governance (§8.3), Phase 1 scope per the roadmap
// table — governance bodies, term limits, role vacancy handling.
// Motions/minutes/votes and "vote of no confidence" (FR-GOV-03/04) are
// Phase 2. Real HTTP requests, real Postgres, same style as the earlier
// e2e specs.
describe('Governance (e2e)', () => {
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
        tx.governanceBody.deleteMany({ where: { organisationId } }),
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
    return `+233-gov-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function monthsAgo(months: number): Date {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d;
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

  async function createGovernanceBody(
    adminToken: string,
    overrides: Record<string, unknown> = {},
  ): Promise<GovernanceBodyResponse> {
    const res = await request(app.getHttpServer())
      .post('/governance-bodies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Executive Council', ...overrides })
      .expect(201);
    return res.body as GovernanceBodyResponse;
  }

  async function createRole(
    adminToken: string,
    name: string,
  ): Promise<RoleResponse> {
    const res = await request(app.getHttpServer())
      .post('/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name,
        permissions: [
          { resource: 'member', action: 'view', scope: 'organisation' },
        ],
      })
      .expect(201);
    return res.body as RoleResponse;
  }

  it('creates a governance body, admin-only, cross-tenant isolated', async () => {
    const admin = await registerOrganisation('Governance Create Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const otherOrgAdmin = await registerOrganisation('Governance Other Org');

    await request(app.getHttpServer())
      .post('/governance-bodies')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ name: 'Should fail' })
      .expect(403);

    const body = await createGovernanceBody(admin.accessToken, {
      quorumRule: 'Two-thirds of members',
      meetingCadence: 'quarterly',
    });
    expect(body.name).toBe('Executive Council');

    const listRes = await request(app.getHttpServer())
      .get('/governance-bodies')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(
      (listRes.body as GovernanceBodyResponse[]).map((b) => b.id),
    ).toContain(body.id);

    const otherOrgListRes = await request(app.getHttpServer())
      .get('/governance-bodies')
      .set('Authorization', `Bearer ${otherOrgAdmin.accessToken}`)
      .expect(200);
    expect(otherOrgListRes.body as GovernanceBodyResponse[]).toHaveLength(0);
  });

  it('appoints an officer and lists officers for the body', async () => {
    const admin = await registerOrganisation('Governance Appoint Org');
    const officer = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, officer.identity.memberId, 'ACTIVE');
    const body = await createGovernanceBody(admin.accessToken);
    const role = await createRole(admin.accessToken, 'Secretary');

    await request(app.getHttpServer())
      .post(`/governance-bodies/${body.id}/officers`)
      .set('Authorization', `Bearer ${officer.accessToken}`)
      .send({ memberId: officer.identity.memberId, roleId: role.id })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/governance-bodies/${body.id}/officers`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ memberId: officer.identity.memberId, roleId: role.id })
      .expect(201);

    const officersRes = await request(app.getHttpServer())
      .get(`/governance-bodies/${body.id}/officers`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const officers = officersRes.body as RoleAssignmentResponse[];
    expect(
      officers.some(
        (a) => a.memberId === officer.identity.memberId && a.roleId === role.id,
      ),
    ).toBe(true);
  });

  it('term limits: blocks reappointment before cooling off, allows it after', async () => {
    const admin = await registerOrganisation('Governance Term Limit Org');
    const officer = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, officer.identity.memberId, 'ACTIVE');
    const body = await createGovernanceBody(admin.accessToken, {
      maxConsecutiveTerms: 2,
      coolingOffPeriodMonths: 6,
    });
    const role = await createRole(admin.accessToken, 'Chairman');

    // Seed two prior consecutive terms directly — the history an
    // appointOfficer term-limit check reads, without needing to actually
    // wait out real terms.
    await prisma.withTenant(admin.identity.organisationId, (tx) =>
      tx.roleAssignment.create({
        data: {
          organisationId: admin.identity.organisationId,
          memberId: officer.identity.memberId,
          roleId: role.id,
          governanceBodyId: body.id,
          termStart: monthsAgo(24),
          termEnd: monthsAgo(18),
        },
      }),
    );
    const mostRecentTerm = await prisma.withTenant(
      admin.identity.organisationId,
      (tx) =>
        tx.roleAssignment.create({
          data: {
            organisationId: admin.identity.organisationId,
            memberId: officer.identity.memberId,
            roleId: role.id,
            governanceBodyId: body.id,
            termStart: monthsAgo(18),
            termEnd: monthsAgo(3),
          },
        }),
    );

    // 2 consecutive terms already served (== max), and the most recent
    // ended only 3 months ago — short of the 6-month cooling-off period.
    await request(app.getHttpServer())
      .post(`/governance-bodies/${body.id}/officers`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ memberId: officer.identity.memberId, roleId: role.id })
      .expect(400);

    // Push the most recent term's end back far enough to have cooled off.
    await prisma.withTenant(admin.identity.organisationId, (tx) =>
      tx.roleAssignment.update({
        where: { id: mostRecentTerm.id },
        data: { termEnd: monthsAgo(7) },
      }),
    );

    await request(app.getHttpServer())
      .post(`/governance-bodies/${body.id}/officers`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ memberId: officer.identity.memberId, roleId: role.id })
      .expect(201);
  });

  it('auto-vacates a governance role when the holder becomes EXITED, but leaves other role assignments alone', async () => {
    const admin = await registerOrganisation('Governance Vacancy Org');
    const officer = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, officer.identity.memberId, 'ACTIVE');
    const body = await createGovernanceBody(admin.accessToken);
    const role = await createRole(admin.accessToken, 'Treasurer-Elect');

    await request(app.getHttpServer())
      .post(`/governance-bodies/${body.id}/officers`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ memberId: officer.identity.memberId, roleId: role.id })
      .expect(201);

    await setStatus(admin.accessToken, officer.identity.memberId, 'EXITED');

    const officersRes = await request(app.getHttpServer())
      .get(`/governance-bodies/${body.id}/officers`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const assignment = (officersRes.body as RoleAssignmentResponse[]).find(
      (a) => a.memberId === officer.identity.memberId,
    );
    expect(assignment?.termEnd).not.toBeNull();
    expect(new Date(assignment!.termEnd!).getTime()).toBeLessThanOrEqual(
      Date.now(),
    );

    // The automatic "Member" template assignment (not governance-scoped)
    // is untouched — only officer seats are vacated, not every grant.
    const rolesRes = await request(app.getHttpServer())
      .get(`/members/${officer.identity.memberId}/roles`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const memberTemplateAssignment = (
      rolesRes.body as RoleAssignmentResponse[]
    ).find((a) => a.governanceBodyId === null);
    expect(memberTemplateAssignment?.termEnd).toBeNull();
  });
});
