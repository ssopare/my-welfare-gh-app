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
      .send({ phoneNumber, password, legalName, organisationType: 'voluntary' })
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

  it('rejects joining the same organisation twice, and joining a nonexistent one', async () => {
    const admin = await registerOrganisation('Double-Join Org');
    const phoneNumber = uniquePhone();
    const password = 'correct-horse-battery-staple';
    const payload = {
      phoneNumber,
      password,
      organisationId: admin.identity.organisationId,
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
  });
});
