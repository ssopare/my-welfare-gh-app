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

// Phase 1's first slice: phone+password auth on top of the Phase 0
// Account/Organisation/Member model and RLS. Exercises real HTTP requests
// through the actual Nest app (guards, ValidationPipe, JWT signing/
// verification included), against the real Postgres — nothing mocked.
describe('Auth (e2e)', () => {
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
    // Deduped: a member joining their own founder's org (see "an ordinary
    // member ... can found a brand-new organisation") tracks the same
    // organisationId twice — once via the founder identity, once via the
    // member identity that joined it.
    for (const organisationId of new Set(createdOrgIds)) {
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
    return `+233-auth-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function registerOrganisation(payload: {
    phoneNumber: string;
    password: string;
    legalName: string;
    organisationType: string;
    name?: string;
  }): Promise<AccessTokenResponse> {
    const res = await request(app.getHttpServer())
      .post('/auth/register-organisation')
      .send({ name: 'Test Admin', ...payload })
      .expect(201);
    return res.body as AccessTokenResponse;
  }

  async function me(accessToken: string): Promise<MeResponse> {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    return res.body as MeResponse;
  }

  function trackForCleanup(identity: MeResponse) {
    createdOrgIds.push(identity.organisationId);
    createdAccountIds.push(identity.sub);
  }

  it('registers a new organisation and returns a usable access token', async () => {
    const { accessToken } = await registerOrganisation({
      phoneNumber: uniquePhone(),
      password: 'correct-horse-battery-staple',
      legalName: 'Auth Test Welfare Association',
      organisationType: 'voluntary',
    });
    expect(accessToken).toEqual(expect.any(String));

    const identity = await me(accessToken);
    expect(identity.role).toBe('ADMIN');
    expect(identity.organisationId).toEqual(expect.any(String));
    expect(identity.memberId).toEqual(expect.any(String));
    trackForCleanup(identity);
  });

  it('rejects registering the same phone number twice', async () => {
    const phoneNumber = uniquePhone();
    const payload = {
      phoneNumber,
      password: 'correct-horse-battery-staple',
      legalName: 'Duplicate Phone Org',
      organisationType: 'voluntary',
      name: 'Test Admin',
    };

    const { accessToken } = await registerOrganisation(payload);
    trackForCleanup(await me(accessToken));

    await request(app.getHttpServer())
      .post('/auth/register-organisation')
      .send({ ...payload, legalName: 'Second Org, Same Phone' })
      .expect(409);
  });

  it('rejects an invalid organisationType', async () => {
    await request(app.getHttpServer())
      .post('/auth/register-organisation')
      .send({
        phoneNumber: uniquePhone(),
        password: 'correct-horse-battery-staple',
        legalName: 'Bad Type Org',
        organisationType: 'not-a-real-type',
        name: 'Test Admin',
      })
      .expect(400);
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    const phoneNumber = uniquePhone();
    const password = 'correct-horse-battery-staple';
    const registered = await registerOrganisation({
      phoneNumber,
      password,
      legalName: 'Login Test Org',
      organisationType: 'voluntary',
    });
    trackForCleanup(await me(registered.accessToken));

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phoneNumber, password })
      .expect(200);
    expect((loginRes.body as AccessTokenResponse).accessToken).toEqual(
      expect.any(String),
    );

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phoneNumber, password: 'wrong-password' })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phoneNumber: uniquePhone(), password })
      .expect(401);
  });

  it('rejects /auth/me with no token or a garbage token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer not-a-real-jwt')
      .expect(401);
  });

  it('two different registrations get isolated identities and correct roles', async () => {
    const regA = await registerOrganisation({
      phoneNumber: uniquePhone(),
      password: 'correct-horse-battery-staple',
      legalName: 'Org A (auth e2e)',
      organisationType: 'voluntary',
    });
    const regB = await registerOrganisation({
      phoneNumber: uniquePhone(),
      password: 'correct-horse-battery-staple',
      legalName: 'Org B (auth e2e)',
      organisationType: 'employer-linked',
    });

    const identityA = await me(regA.accessToken);
    const identityB = await me(regB.accessToken);

    expect(identityA.organisationId).not.toBe(identityB.organisationId);
    expect(identityA.sub).not.toBe(identityB.sub);
    expect(identityA.role).toBe('ADMIN');
    expect(identityB.role).toBe('ADMIN');

    trackForCleanup(identityA);
    trackForCleanup(identityB);
  });

  it('login requires organisationId when an account has multiple memberships', async () => {
    // No "join an existing org" endpoint exists yet (out of scope for this
    // auth slice — see decisions memory on the multi-group switcher being a
    // Phase 2 feature), so the second Membership is seeded directly.
    const phoneNumber = uniquePhone();
    const password = 'correct-horse-battery-staple';
    const registered = await registerOrganisation({
      phoneNumber,
      password,
      legalName: 'Multi-org Home Org',
      organisationType: 'voluntary',
    });
    const firstIdentity = await me(registered.accessToken);

    const secondOrg = await prisma.provisionOrganisation({
      legalName: 'Multi-org Second Org',
      type: 'voluntary',
      joinCode: `MULTI-${Date.now()}`,
    });
    await prisma.withTenant(secondOrg.id, (tx) =>
      tx.member.create({
        data: {
          accountId: firstIdentity.sub,
          organisationId: secondOrg.id,
          role: 'MEMBER',
        },
      }),
    );
    createdOrgIds.push(firstIdentity.organisationId, secondOrg.id);
    createdAccountIds.push(firstIdentity.sub);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phoneNumber, password })
      .expect(400);

    const disambiguated = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phoneNumber, password, organisationId: secondOrg.id })
      .expect(200);
    const disambiguatedIdentity = await me(
      (disambiguated.body as AccessTokenResponse).accessToken,
    );
    expect(disambiguatedIdentity.organisationId).toBe(secondOrg.id);
    expect(disambiguatedIdentity.role).toBe('MEMBER');
  });

  it('an existing admin can found a second organisation and becomes its admin, independent of the first', async () => {
    const phoneNumber = uniquePhone();
    const password = 'correct-horse-battery-staple';
    const registered = await registerOrganisation({
      phoneNumber,
      password,
      legalName: 'Founder Home Org',
      organisationType: 'voluntary',
    });
    const firstIdentity = await me(registered.accessToken);
    createdAccountIds.push(firstIdentity.sub);
    createdOrgIds.push(firstIdentity.organisationId);

    const res = await request(app.getHttpServer())
      .post('/auth/organisations')
      .set('Authorization', `Bearer ${registered.accessToken}`)
      .send({
        legalName: 'Founder Second Org',
        organisationType: 'employer-linked',
      })
      .expect(201);
    const { accessToken: secondToken } = res.body as AccessTokenResponse;

    const secondIdentity = await me(secondToken);
    expect(secondIdentity.sub).toBe(firstIdentity.sub);
    expect(secondIdentity.organisationId).not.toBe(
      firstIdentity.organisationId,
    );
    expect(secondIdentity.role).toBe('ADMIN');
    createdOrgIds.push(secondIdentity.organisationId);

    // The original membership is untouched — same account, two fully
    // independent ADMIN memberships.
    const firstIdentityAgain = await me(registered.accessToken);
    expect(firstIdentityAgain.organisationId).toBe(
      firstIdentity.organisationId,
    );
    expect(firstIdentityAgain.role).toBe('ADMIN');
  });

  it('an ordinary member (admin nowhere) can found a brand-new organisation and becomes its admin there', async () => {
    const founder = await registerOrganisation({
      phoneNumber: uniquePhone(),
      password: 'correct-horse-battery-staple',
      legalName: 'Member Founder Home Org',
      organisationType: 'voluntary',
    });
    const founderIdentity = await me(founder.accessToken);
    createdAccountIds.push(founderIdentity.sub);
    createdOrgIds.push(founderIdentity.organisationId);

    const memberPhone = uniquePhone();
    const memberPassword = 'correct-horse-battery-staple';
    const joinRes = await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        organisationId: founderIdentity.organisationId,
        phoneNumber: memberPhone,
        password: memberPassword,
        name: 'Ordinary Member',
      })
      .expect(201);
    const memberToken = (joinRes.body as AccessTokenResponse).accessToken;
    const memberIdentity = await me(memberToken);
    expect(memberIdentity.role).toBe('MEMBER');
    createdAccountIds.push(memberIdentity.sub);
    createdOrgIds.push(memberIdentity.organisationId);

    const res = await request(app.getHttpServer())
      .post('/auth/organisations')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ legalName: 'Member-Founded Org', organisationType: 'voluntary' })
      .expect(201);
    const newOrgIdentity = await me(
      (res.body as AccessTokenResponse).accessToken,
    );
    expect(newOrgIdentity.sub).toBe(memberIdentity.sub);
    expect(newOrgIdentity.role).toBe('ADMIN');
    expect(newOrgIdentity.organisationId).not.toBe(
      memberIdentity.organisationId,
    );
    createdOrgIds.push(newOrgIdentity.organisationId);

    // Their original MEMBER membership is untouched by founding a new org.
    const memberIdentityAgain = await me(memberToken);
    expect(memberIdentityAgain.role).toBe('MEMBER');
    expect(memberIdentityAgain.organisationId).toBe(
      founderIdentity.organisationId,
    );
  });

  it('rejects founding an additional organisation with no token, and with an invalid type', async () => {
    await request(app.getHttpServer())
      .post('/auth/organisations')
      .send({ legalName: 'No Token Org', organisationType: 'voluntary' })
      .expect(401);

    const registered = await registerOrganisation({
      phoneNumber: uniquePhone(),
      password: 'correct-horse-battery-staple',
      legalName: 'Bad Second Org Type Home',
      organisationType: 'voluntary',
    });
    trackForCleanup(await me(registered.accessToken));

    await request(app.getHttpServer())
      .post('/auth/organisations')
      .set('Authorization', `Bearer ${registered.accessToken}`)
      .send({ legalName: 'Bad Type', organisationType: 'not-a-real-type' })
      .expect(400);
  });

  it("returns the caller's own organisation, isolated per tenant", async () => {
    const orgA = await registerOrganisation({
      phoneNumber: uniquePhone(),
      password: 'correct-horse-battery-staple',
      legalName: 'Organisation Lookup Org A',
      organisationType: 'voluntary',
    });
    const orgB = await registerOrganisation({
      phoneNumber: uniquePhone(),
      password: 'correct-horse-battery-staple',
      legalName: 'Organisation Lookup Org B',
      organisationType: 'employer-linked',
    });
    const identityA = await me(orgA.accessToken);
    const identityB = await me(orgB.accessToken);
    trackForCleanup(identityA);
    trackForCleanup(identityB);

    const resA = await request(app.getHttpServer())
      .get('/organisation')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .expect(200);
    expect((resA.body as { legalName: string }).legalName).toBe(
      'Organisation Lookup Org A',
    );

    const resB = await request(app.getHttpServer())
      .get('/organisation')
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .expect(200);
    expect((resB.body as { legalName: string }).legalName).toBe(
      'Organisation Lookup Org B',
    );

    await request(app.getHttpServer()).get('/organisation').expect(401);
  });
});
