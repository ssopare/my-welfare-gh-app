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

interface DependantResponse {
  id: string;
  relationship: string;
  name: string;
  confirmed: boolean;
}

interface MemberDetailResponse {
  id: string;
  status: string;
  chapterId: string | null;
  dependants: DependantResponse[];
  statusChanges: {
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
  }[];
}

interface ChapterResponse {
  id: string;
  name: string;
}

interface RoleResponse {
  id: string;
  name: string;
}

interface RemovalRequestResponse {
  id: string;
  memberId: string;
  requestedBy: string;
  reason: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
}

// Phase 1 roadmap slice 2: full membership lifecycle on top of slice 1's
// auth. Exercises real HTTP requests against the real Postgres/RLS — same
// style as auth.e2e-spec.ts.
describe('Membership (e2e)', () => {
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
        tx.dependant.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.memberStatusChange.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.memberRemovalRequest.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.member.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.chapter.deleteMany({ where: { organisationId } }),
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
    return `+233-mem-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function registerOrganisation(legalName: string): Promise<{
    accessToken: string;
    identity: MeResponse;
    phoneNumber: string;
    password: string;
  }> {
    const phoneNumber = uniquePhone();
    const password = 'correct-horse-battery-staple';
    const res = await request(app.getHttpServer())
      .post('/auth/register-organisation')
      .send({
        phoneNumber,
        password,
        legalName,
        organisationType: 'voluntary',
        name: 'Test Admin',
      })
      .expect(201);
    const { accessToken } = res.body as AccessTokenResponse;
    const identity = await me(accessToken);
    createdOrgIds.push(identity.organisationId);
    createdAccountIds.push(identity.sub);
    return { accessToken, identity, phoneNumber, password };
  }

  async function me(accessToken: string): Promise<MeResponse> {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    return res.body as MeResponse;
  }

  async function getOwnMembership(
    accessToken: string,
  ): Promise<MemberDetailResponse> {
    const res = await request(app.getHttpServer())
      .get('/members/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    return res.body as MemberDetailResponse;
  }

  // Same "Org Admin" role/grant used by rbac.e2e-spec.ts's maker-checker
  // test — the only way to get a *second* wildcard-admin member in an org,
  // since the founding admin's admin-ness comes from a real RoleAssignment,
  // not the legacy Member.role field.
  async function grantOrgAdmin(adminToken: string, memberId: string) {
    const rolesRes = await request(app.getHttpServer())
      .get('/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const orgAdminRole = (rolesRes.body as RoleResponse[]).find(
      (r) => r.name === 'Org Admin',
    );
    await request(app.getHttpServer())
      .post(`/roles/${orgAdminRole?.id}/assignments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ memberId })
      .expect(201);
  }

  it('the founding admin starts ACTIVE with a recorded status change', async () => {
    const { accessToken } = await registerOrganisation('Founder Status Org');
    const membership = await getOwnMembership(accessToken);
    expect(membership.status).toBe('ACTIVE');
    expect(membership.statusChanges).toHaveLength(1);
    expect(membership.statusChanges[0].fromStatus).toBeNull();
    expect(membership.statusChanges[0].toStatus).toBe('ACTIVE');
  });

  it('joins an existing organisation as a new PENDING member', async () => {
    const admin = await registerOrganisation('Joinable Org');
    const phoneNumber = uniquePhone();
    const password = 'correct-horse-battery-staple';

    const joinRes = await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber,
        password,
        organisationId: admin.identity.organisationId,
        name: 'Test Joiner',
      })
      .expect(201);
    const joinerIdentity = await me(
      (joinRes.body as AccessTokenResponse).accessToken,
    );
    expect(joinerIdentity.organisationId).toBe(admin.identity.organisationId);
    expect(joinerIdentity.role).toBe('MEMBER');
    createdAccountIds.push(joinerIdentity.sub);

    const membership = await getOwnMembership(
      (joinRes.body as AccessTokenResponse).accessToken,
    );
    expect(membership.status).toBe('PENDING');
    expect(membership.statusChanges).toHaveLength(1);
    expect(membership.statusChanges[0].toStatus).toBe('PENDING');
  });

  it('registering an organisation generates a joinCode, and joining works via that code instead of the raw id', async () => {
    const admin = await registerOrganisation('Join Code Org');

    const orgRes = await request(app.getHttpServer())
      .get('/organisation')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const joinCode = (orgRes.body as { joinCode: string }).joinCode;
    expect(joinCode).toMatch(/^[A-Z0-9]+-[A-Z0-9]{5}$/);

    const phoneNumber = uniquePhone();
    const joinRes = await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber,
        password: 'correct-horse-battery-staple',
        joinCode,
        name: 'Test Joiner',
      })
      .expect(201);
    const joinerIdentity = await me(
      (joinRes.body as AccessTokenResponse).accessToken,
    );
    expect(joinerIdentity.organisationId).toBe(admin.identity.organisationId);
    createdAccountIds.push(joinerIdentity.sub);
  });

  it('rejects an unknown join code, and rejects joining with neither a joinCode nor an organisationId', async () => {
    await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber: uniquePhone(),
        password: 'correct-horse-battery-staple',
        joinCode: 'NOPE-00000',
      })
      .expect(404);

    await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber: uniquePhone(),
        password: 'correct-horse-battery-staple',
      })
      .expect(400);
  });

  it('rejects joining the same organisation twice, and joining a nonexistent one', async () => {
    const admin = await registerOrganisation('Double-Join Org');
    const phoneNumber = uniquePhone();
    const password = 'correct-horse-battery-staple';
    const payload = {
      phoneNumber,
      password,
      organisationId: admin.identity.organisationId,
      name: 'Test Joiner',
    };

    const first = await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send(payload)
      .expect(201);
    const identity = await me((first.body as AccessTokenResponse).accessToken);
    createdAccountIds.push(identity.sub);

    await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send(payload)
      .expect(409);

    await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber: uniquePhone(),
        password,
        organisationId: '00000000-0000-4000-8000-000000000000',
        name: 'Test Joiner',
      })
      .expect(404);
  });

  it('rejects joining with the wrong password for an existing account', async () => {
    // The admin's account already exists (from registering their own org).
    // Joining a *different* org with that same phone number but the wrong
    // password must not silently succeed or create a duplicate account.
    const admin = await registerOrganisation('Wrong Password Home Org');
    const secondOrg = await registerOrganisation('Wrong Password Target Org');

    await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber: admin.phoneNumber,
        password: 'not-the-real-password',
        organisationId: secondOrg.identity.organisationId,
      })
      .expect(401);

    const correctJoin = await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber: admin.phoneNumber,
        password: admin.password,
        organisationId: secondOrg.identity.organisationId,
      })
      .expect(201);
    const joinedIdentity = await me(
      (correctJoin.body as AccessTokenResponse).accessToken,
    );
    expect(joinedIdentity.organisationId).toBe(
      secondOrg.identity.organisationId,
    );
  });

  it('prefills dependants (unconfirmed) from an existing membership when joining a second org, per FR-MEM-10', async () => {
    const orgA = await registerOrganisation('Prefill Home Org');
    const phoneNumber = uniquePhone();
    const password = 'correct-horse-battery-staple';

    const joinA = await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber,
        password,
        organisationId: orgA.identity.organisationId,
        name: 'Test Joiner',
      })
      .expect(201);
    const tokenA = (joinA.body as AccessTokenResponse).accessToken;
    const identityA = await me(tokenA);
    createdAccountIds.push(identityA.sub);

    await request(app.getHttpServer())
      .post('/members/me/dependants')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ relationship: 'spouse', name: 'Ama Mensah' })
      .expect(201);

    const orgB = await registerOrganisation('Prefill Second Org');
    const joinB = await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber,
        password,
        organisationId: orgB.identity.organisationId,
      })
      .expect(201);
    const tokenB = (joinB.body as AccessTokenResponse).accessToken;

    const membershipB = await getOwnMembership(tokenB);
    expect(membershipB.dependants).toHaveLength(1);
    expect(membershipB.dependants[0].name).toBe('Ama Mensah');
    expect(membershipB.dependants[0].confirmed).toBe(false);

    const confirmRes = await request(app.getHttpServer())
      .patch(`/members/me/dependants/${membershipB.dependants[0].id}/confirm`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect((confirmRes.body as DependantResponse).confirmed).toBe(true);
  });

  it('lets an admin change a member status (recording history) but forbids a non-admin from doing so', async () => {
    const admin = await registerOrganisation('Status Change Org');
    const phoneNumber = uniquePhone();
    const password = 'correct-horse-battery-staple';
    const joinRes = await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber,
        password,
        organisationId: admin.identity.organisationId,
        name: 'Test Joiner',
      })
      .expect(201);
    const memberToken = (joinRes.body as AccessTokenResponse).accessToken;
    const memberIdentity = await me(memberToken);
    createdAccountIds.push(memberIdentity.sub);

    await request(app.getHttpServer())
      .patch(`/members/${memberIdentity.memberId}/status`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ status: 'ACTIVE' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/members/${memberIdentity.memberId}/status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'ACTIVE', reason: 'Approved after review' })
      .expect(200);

    const updated = await getOwnMembership(memberToken);
    expect(updated.status).toBe('ACTIVE');
    expect(
      updated.statusChanges.some(
        (c) => c.toStatus === 'ACTIVE' && c.reason === 'Approved after review',
      ),
    ).toBe(true);
  });

  it('removal requires a reason, records who changed it, and an admin cannot remove themselves', async () => {
    const admin = await registerOrganisation('Removal Guardrails Org');
    const phoneNumber = uniquePhone();
    const joinRes = await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber,
        password: 'correct-horse-battery-staple',
        organisationId: admin.identity.organisationId,
        name: 'Test Joiner',
      })
      .expect(201);
    const memberIdentity = await me(
      (joinRes.body as AccessTokenResponse).accessToken,
    );
    createdAccountIds.push(memberIdentity.sub);

    // No reason -> rejected, even though the admin is otherwise entitled.
    await request(app.getHttpServer())
      .patch(`/members/${memberIdentity.memberId}/status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'EXITED' })
      .expect(400);

    // An admin can never remove themselves, reason or not.
    await request(app.getHttpServer())
      .patch(`/members/${admin.identity.memberId}/status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'EXITED', reason: 'Trying to self-remove' })
      .expect(403);

    // With a reason, against someone else: applies immediately (no
    // maker-checker on this org) and records the acting admin.
    const removeRes = await request(app.getHttpServer())
      .patch(`/members/${memberIdentity.memberId}/status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'EXITED', reason: 'No longer participating' })
      .expect(200);
    expect((removeRes.body as { outcome: string }).outcome).toBe('applied');

    const removedStatusChange = await prisma.withTenant(
      admin.identity.organisationId,
      (tx) =>
        tx.memberStatusChange.findFirst({
          where: { memberId: memberIdentity.memberId, toStatus: 'EXITED' },
        }),
    );
    expect(removedStatusChange?.changedBy).toBe(admin.identity.memberId);
    expect(removedStatusChange?.reason).toBe('No longer participating');

    // Reinstatement is just the existing status-change lever, run in
    // reverse — no separate endpoint needed.
    const reinstateRes = await request(app.getHttpServer())
      .patch(`/members/${memberIdentity.memberId}/status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'ACTIVE', reason: 'Reinstated after review' })
      .expect(200);
    expect(
      (reinstateRes.body as { outcome: string; member: { status: string } })
        .member.status,
    ).toBe('ACTIVE');
  });

  it('under maker-checker, removal is a two-step request that a different admin must confirm', async () => {
    const admin = await registerOrganisation('Removal Maker Checker Org');
    const secondAdminJoin = await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber: uniquePhone(),
        password: 'correct-horse-battery-staple',
        organisationId: admin.identity.organisationId,
        name: 'Second Admin',
      })
      .expect(201);
    const secondAdminToken = (secondAdminJoin.body as AccessTokenResponse)
      .accessToken;
    const secondAdminIdentity = await me(secondAdminToken);
    createdAccountIds.push(secondAdminIdentity.sub);
    await grantOrgAdmin(admin.accessToken, secondAdminIdentity.memberId);

    const targetJoin = await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber: uniquePhone(),
        password: 'correct-horse-battery-staple',
        organisationId: admin.identity.organisationId,
        name: 'Target Member',
      })
      .expect(201);
    const targetIdentity = await me(
      (targetJoin.body as AccessTokenResponse).accessToken,
    );
    createdAccountIds.push(targetIdentity.sub);

    await prisma.withTenant(admin.identity.organisationId, (tx) =>
      tx.organisation.update({
        where: { id: admin.identity.organisationId },
        data: { makerCheckerEnabled: true },
      }),
    );

    // Admin A proposes removal — queued, member untouched so far.
    const proposeRes = await request(app.getHttpServer())
      .patch(`/members/${targetIdentity.memberId}/status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'EXITED', reason: 'Chronic non-participation' })
      .expect(200);
    const proposeBody = proposeRes.body as {
      outcome: string;
      removalRequest: RemovalRequestResponse;
    };
    expect(proposeBody.outcome).toBe('pending_confirmation');
    const requestId = proposeBody.removalRequest.id;

    const stillActive = await prisma.withTenant(
      admin.identity.organisationId,
      (tx) => tx.member.findUnique({ where: { id: targetIdentity.memberId } }),
    );
    expect(stillActive?.status).not.toBe('EXITED');

    // The same admin who proposed it cannot also confirm it.
    await request(app.getHttpServer())
      .post(`/members/removal-requests/${requestId}/confirm`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(403);

    // A different admin confirms — now it actually applies.
    await request(app.getHttpServer())
      .post(`/members/removal-requests/${requestId}/confirm`)
      .set('Authorization', `Bearer ${secondAdminToken}`)
      .expect(201);

    const nowExited = await prisma.withTenant(
      admin.identity.organisationId,
      (tx) => tx.member.findUnique({ where: { id: targetIdentity.memberId } }),
    );
    expect(nowExited?.status).toBe('EXITED');

    const list = await request(app.getHttpServer())
      .get('/members/removal-requests')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const confirmed = (
      list.body as (RemovalRequestResponse & {
        requestedByPhoneNumber: string | null;
      })[]
    ).find((r) => r.id === requestId);
    expect(confirmed?.status).toBe('CONFIRMED');
    expect(confirmed?.requestedByPhoneNumber).toBeTruthy();
  });

  it('a pending removal request can be cancelled instead of confirmed', async () => {
    const admin = await registerOrganisation('Removal Cancel Org');
    const targetJoin = await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber: uniquePhone(),
        password: 'correct-horse-battery-staple',
        organisationId: admin.identity.organisationId,
        name: 'Target Member',
      })
      .expect(201);
    const targetIdentity = await me(
      (targetJoin.body as AccessTokenResponse).accessToken,
    );
    createdAccountIds.push(targetIdentity.sub);

    await prisma.withTenant(admin.identity.organisationId, (tx) =>
      tx.organisation.update({
        where: { id: admin.identity.organisationId },
        data: { makerCheckerEnabled: true },
      }),
    );

    const proposeRes = await request(app.getHttpServer())
      .patch(`/members/${targetIdentity.memberId}/status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'EXITED', reason: 'Second thoughts pending' })
      .expect(200);
    const requestId = (
      proposeRes.body as { removalRequest: RemovalRequestResponse }
    ).removalRequest.id;

    await request(app.getHttpServer())
      .post(`/members/removal-requests/${requestId}/cancel`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(201);

    // A cancelled request can no longer be confirmed.
    await request(app.getHttpServer())
      .post(`/members/removal-requests/${requestId}/confirm`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(404);

    const stillActive = await prisma.withTenant(
      admin.identity.organisationId,
      (tx) => tx.member.findUnique({ where: { id: targetIdentity.memberId } }),
    );
    expect(stillActive?.status).not.toBe('EXITED');
  });

  it('creates chapters and transfers a member, admin-only, blocked cross-tenant', async () => {
    const orgA = await registerOrganisation('Chapter Org A');
    const orgB = await registerOrganisation('Chapter Org B');

    const phoneNumber = uniquePhone();
    const password = 'correct-horse-battery-staple';
    const joinRes = await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber,
        password,
        organisationId: orgA.identity.organisationId,
        name: 'Test Joiner',
      })
      .expect(201);
    const memberToken = (joinRes.body as AccessTokenResponse).accessToken;
    const memberIdentity = await me(memberToken);
    createdAccountIds.push(memberIdentity.sub);

    await request(app.getHttpServer())
      .post('/chapters')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ name: 'Should Fail' })
      .expect(403);

    const chapterRes = await request(app.getHttpServer())
      .post('/chapters')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ name: 'Kumasi Campus' })
      .expect(201);
    const chapter = chapterRes.body as ChapterResponse;

    await request(app.getHttpServer())
      .patch(`/members/${memberIdentity.memberId}/chapter`)
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ chapterId: chapter.id })
      .expect(200);

    const membership = await getOwnMembership(memberToken);
    expect(membership.chapterId).toBe(chapter.id);

    // orgB's admin can't see orgA's chapter (RLS) or orgA's member at all.
    await request(app.getHttpServer())
      .patch(`/members/${memberIdentity.memberId}/chapter`)
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .send({ chapterId: chapter.id })
      .expect(404);

    // listChapters: open to any member (org structure, not sensitive),
    // and RLS-isolated per tenant same as everything else.
    const memberListRes = await request(app.getHttpServer())
      .get('/chapters')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect((memberListRes.body as ChapterResponse[]).map((c) => c.id)).toEqual(
      expect.arrayContaining([chapter.id]),
    );

    const orgBListRes = await request(app.getHttpServer())
      .get('/chapters')
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .expect(200);
    expect(
      (orgBListRes.body as ChapterResponse[]).map((c) => c.id),
    ).not.toContain(chapter.id);
  });

  it('lists members for the org, admin-only, filterable by status, cross-tenant isolated', async () => {
    const admin = await registerOrganisation('Member List Org');
    const otherOrg = await registerOrganisation('Member List Other Org');

    const joinRes = await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber: uniquePhone(),
        password: 'correct-horse-battery-staple',
        organisationId: admin.identity.organisationId,
        name: 'Test Joiner',
      })
      .expect(201);
    const memberAccessToken = (joinRes.body as AccessTokenResponse).accessToken;
    const member = {
      accessToken: memberAccessToken,
      identity: await me(memberAccessToken),
    };
    createdAccountIds.push(member.identity.sub);

    await request(app.getHttpServer())
      .get('/members')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(403);

    const listRes = await request(app.getHttpServer())
      .get('/members')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const members = listRes.body as MemberDetailResponse[];
    expect(members.map((m) => m.id)).toEqual(
      expect.arrayContaining([
        admin.identity.memberId,
        member.identity.memberId,
      ]),
    );

    const pendingRes = await request(app.getHttpServer())
      .get('/members?status=PENDING')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const pending = pendingRes.body as MemberDetailResponse[];
    expect(pending.some((m) => m.id === member.identity.memberId)).toBe(true);
    expect(pending.some((m) => m.id === admin.identity.memberId)).toBe(false);

    const otherOrgList = await request(app.getHttpServer())
      .get('/members')
      .set('Authorization', `Bearer ${otherOrg.accessToken}`)
      .expect(200);
    expect(
      (otherOrgList.body as MemberDetailResponse[]).some(
        (m) => m.id === admin.identity.memberId,
      ),
    ).toBe(false);
  });

  it('gets a specific member detail for the admin, 403 for non-admins, 404 across tenants', async () => {
    const admin = await registerOrganisation('Member Detail Org');
    const otherOrg = await registerOrganisation('Member Detail Other Org');

    const joinRes = await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber: uniquePhone(),
        password: 'correct-horse-battery-staple',
        organisationId: admin.identity.organisationId,
        name: 'Test Joiner',
      })
      .expect(201);
    const memberAccessToken = (joinRes.body as AccessTokenResponse).accessToken;
    const member = {
      accessToken: memberAccessToken,
      identity: await me(memberAccessToken),
    };
    createdAccountIds.push(member.identity.sub);

    await request(app.getHttpServer())
      .get(`/members/${member.identity.memberId}`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(403);

    const detailRes = await request(app.getHttpServer())
      .get(`/members/${member.identity.memberId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const detail = detailRes.body as MemberDetailResponse;
    expect(detail.id).toBe(member.identity.memberId);
    expect(detail.dependants).toEqual([]);
    expect(detail.statusChanges).toEqual([
      expect.objectContaining({ fromStatus: null, toStatus: 'PENDING' }),
    ]);

    await request(app.getHttpServer())
      .get(`/members/${member.identity.memberId}`)
      .set('Authorization', `Bearer ${otherOrg.accessToken}`)
      .expect(404);
  });

  it('collects a name at registration/join, and lets a member update their own later', async () => {
    const admin = await registerOrganisation('Profile Name Org');
    const ownRes = await request(app.getHttpServer())
      .get('/members/me')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(
      (ownRes.body as { account: { name: string | null } }).account.name,
    ).toBe('Test Admin');

    const phoneNumber = uniquePhone();
    const joinRes = await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber,
        password: 'correct-horse-battery-staple',
        organisationId: admin.identity.organisationId,
        name: 'Ama Serwaa',
      })
      .expect(201);
    const memberToken = (joinRes.body as AccessTokenResponse).accessToken;
    const memberIdentity = await me(memberToken);
    createdAccountIds.push(memberIdentity.sub);

    const memberOwnRes = await request(app.getHttpServer())
      .get('/members/me')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(
      (memberOwnRes.body as { account: { name: string | null } }).account.name,
    ).toBe('Ama Serwaa');

    // A brand-new account created via join-organisation without a name is
    // rejected — the one-time exception is an *existing* account joining
    // a second org, covered by the "already exists" branch elsewhere.
    await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber: uniquePhone(),
        password: 'correct-horse-battery-staple',
        organisationId: admin.identity.organisationId,
      })
      .expect(400);

    // The member can change their own name later.
    const updateRes = await request(app.getHttpServer())
      .patch('/members/me/profile')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ name: 'Ama Serwaa Boateng' })
      .expect(200);
    expect((updateRes.body as { name: string | null }).name).toBe(
      'Ama Serwaa Boateng',
    );

    const afterUpdateRes = await request(app.getHttpServer())
      .get('/members/me')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(
      (afterUpdateRes.body as { account: { name: string | null } }).account
        .name,
    ).toBe('Ama Serwaa Boateng');
  });
});
