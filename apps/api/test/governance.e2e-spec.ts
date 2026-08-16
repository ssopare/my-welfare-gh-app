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

interface ElectionResponse {
  id: string;
  nominees?: { id: string }[];
  options?: { id: string; text: string }[];
}

interface NominationResponse {
  id: string;
}

interface ElectionResultsResponse {
  totalVotesCast: number;
  results: { optionId: string; count: number }[];
  turnoutPercentage: number;
  quorumMet: boolean;
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
        tx.anonymousBallot.deleteMany({
          where: { election: { organisationId } },
        }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.publicBallot.deleteMany({ where: { election: { organisationId } } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.voterRegistry.deleteMany({
          where: { election: { organisationId } },
        }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.nominee.deleteMany({ where: { election: { organisationId } } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.nomination.deleteMany({ where: { election: { organisationId } } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.issueOption.deleteMany({ where: { election: { organisationId } } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.election.deleteMany({ where: { organisationId } }),
      );
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

  async function setStatus(
    adminToken: string,
    memberId: string,
    status: string,
    reason?: string,
  ) {
    await request(app.getHttpServer())
      .patch(`/members/${memberId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status, reason })
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

    await setStatus(
      admin.accessToken,
      officer.identity.memberId,
      'EXITED',
      'Left the organisation',
    );

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

  describe('Voting and Elections (Advanced System)', () => {
    it('runs the nomination, vetting, and voting pipeline for officer elections', async () => {
      const admin = await registerOrganisation('Election Pipeline Org');
      const nomineeUser = await joinOrganisation(admin.identity.organisationId);
      const seconderUser = await joinOrganisation(
        admin.identity.organisationId,
      );
      const voterUser = await joinOrganisation(admin.identity.organisationId);

      // Make users active members
      await setStatus(
        admin.accessToken,
        nomineeUser.identity.memberId,
        'ACTIVE',
      );
      await setStatus(
        admin.accessToken,
        seconderUser.identity.memberId,
        'ACTIVE',
      );
      await setStatus(admin.accessToken, voterUser.identity.memberId, 'ACTIVE');

      const starts = new Date();
      const ends = new Date();
      ends.setDate(ends.getDate() + 7);

      // 1. Create draft officer election with nomination parameters
      const electionRes = await request(app.getHttpServer())
        .post('/elections')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          title: 'Executive Chairman Election',
          type: 'OFFICER',
          isAnonymous: true,
          nominationStartsAt: starts.toISOString(),
          nominationEndsAt: ends.toISOString(),
          minNomineeTenureMonths: 0,
          requireGoodStandingForNominee: true,
          requireNoArrearsForNominee: true,
          minSecondersRequired: 1,
          startsAt: starts.toISOString(),
          endsAt: ends.toISOString(),
        })
        .expect(201);
      const election = electionRes.body as ElectionResponse;

      // 2. Start Nomination Phase
      await request(app.getHttpServer())
        .patch(`/elections/${election.id}/status`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ status: 'NOMINATION' })
        .expect(200);

      // 3. Nominate nomineeMember
      const nominationRes = await request(app.getHttpServer())
        .post(`/elections/${election.id}/nominations`)
        .set('Authorization', `Bearer ${voterUser.accessToken}`)
        .send({
          nomineeMemberId: nomineeUser.identity.memberId,
          statement: 'I promise to serve the group with transparency.',
        })
        .expect(201);
      const nomination = nominationRes.body as NominationResponse;

      // 4. Second the nomination
      await request(app.getHttpServer())
        .post(`/elections/nominations/${nomination.id}/second`)
        .set('Authorization', `Bearer ${seconderUser.accessToken}`)
        .expect(201);

      // Cannot second twice
      await request(app.getHttpServer())
        .post(`/elections/nominations/${nomination.id}/second`)
        .set('Authorization', `Bearer ${seconderUser.accessToken}`)
        .expect(400);

      // 5. Start Vetting Phase
      await request(app.getHttpServer())
        .patch(`/elections/${election.id}/status`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ status: 'VETTING' })
        .expect(200);

      // 6. Admin approves the nomination
      await request(app.getHttpServer())
        .post(`/elections/nominations/${nomination.id}/vet`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ status: 'APPROVED' })
        .expect(201);

      // 7. Start Voting Phase (ACTIVE)
      await request(app.getHttpServer())
        .patch(`/elections/${election.id}/status`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ status: 'ACTIVE' })
        .expect(200);

      // Fetch the election to get the promoted Nominee ID
      const electionDetailRes = await request(app.getHttpServer())
        .get(`/elections/${election.id}`)
        .set('Authorization', `Bearer ${voterUser.accessToken}`)
        .expect(200);
      const electionDetail = electionDetailRes.body as ElectionResponse;
      const nomineeId = electionDetail.nominees![0].id;

      // 8. Cast Votes
      await request(app.getHttpServer())
        .post(`/elections/${election.id}/vote`)
        .set('Authorization', `Bearer ${voterUser.accessToken}`)
        .send({ nomineeId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/elections/${election.id}/vote`)
        .set('Authorization', `Bearer ${nomineeUser.accessToken}`)
        .send({ nomineeId })
        .expect(201);

      // Cannot vote twice
      await request(app.getHttpServer())
        .post(`/elections/${election.id}/vote`)
        .set('Authorization', `Bearer ${voterUser.accessToken}`)
        .send({ nomineeId })
        .expect(400);

      // 9. Fetch Results
      const resultsRes = await request(app.getHttpServer())
        .get(`/elections/${election.id}/results`)
        .set('Authorization', `Bearer ${voterUser.accessToken}`)
        .expect(200);

      const results = resultsRes.body as ElectionResultsResponse;
      expect(results.totalVotesCast).toBe(2);
      expect(results.results.find((r) => r.optionId === nomineeId)!.count).toBe(
        2,
      );
    });

    it('manages issue referendums with public votes and verifies quorum', async () => {
      const admin = await registerOrganisation('Referendum Org');
      const voter1 = await joinOrganisation(admin.identity.organisationId);
      const voter2 = await joinOrganisation(admin.identity.organisationId);

      await setStatus(admin.accessToken, voter1.identity.memberId, 'ACTIVE');
      await setStatus(admin.accessToken, voter2.identity.memberId, 'ACTIVE');

      const starts = new Date();
      const ends = new Date();
      ends.setDate(ends.getDate() + 7);

      // 1. Create referendum with YES/NO options
      const electionRes = await request(app.getHttpServer())
        .post('/elections')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          title: 'Welfare Rate Amendment Referendum',
          type: 'ISSUE',
          isAnonymous: false,
          quorumPercentage: 60.0,
          passPercentage: 50.0,
          startsAt: starts.toISOString(),
          endsAt: ends.toISOString(),
          options: ['YES', 'NO'],
        })
        .expect(201);
      const election = electionRes.body as ElectionResponse;

      // 2. Activate voting directly (Referendums bypass nominations)
      await request(app.getHttpServer())
        .patch(`/elections/${election.id}/status`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ status: 'ACTIVE' })
        .expect(200);

      // Fetch options
      const electionDetailRes = await request(app.getHttpServer())
        .get(`/elections/${election.id}`)
        .set('Authorization', `Bearer ${voter1.accessToken}`)
        .expect(200);
      const electionDetail = electionDetailRes.body as ElectionResponse;
      const yesOptionId = electionDetail.options!.find(
        (o) => o.text === 'YES',
      )!.id;
      const noOptionId = electionDetail.options!.find(
        (o) => o.text === 'NO',
      )!.id;

      // 3. Cast Votes
      await request(app.getHttpServer())
        .post(`/elections/${election.id}/vote`)
        .set('Authorization', `Bearer ${voter1.accessToken}`)
        .send({ issueOptionId: yesOptionId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/elections/${election.id}/vote`)
        .set('Authorization', `Bearer ${voter2.accessToken}`)
        .send({ issueOptionId: noOptionId })
        .expect(201);

      // 4. Verify results and turnout
      const resultsRes = await request(app.getHttpServer())
        .get(`/elections/${election.id}/results`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      const results = resultsRes.body as ElectionResultsResponse;
      expect(results.totalVotesCast).toBe(2);
      expect(
        results.results.find((r) => r.optionId === yesOptionId)!.count,
      ).toBe(1);
      expect(
        results.results.find((r) => r.optionId === noOptionId)!.count,
      ).toBe(1);

      // Admin, voter1, voter2 are active members (3 total). Turnout is 2/3 = 66.67%. Quorum requirement is 60%.
      expect(results.turnoutPercentage).toBeCloseTo(66.67, 1);
      expect(results.quorumMet).toBe(true);
    });
  });
});
