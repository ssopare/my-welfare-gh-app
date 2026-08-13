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

    const ambiguous = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phoneNumber, password })
      .expect(400);
    // The error body carries real organisation names now, not just a
    // message demanding a raw id — lets the login form render a picker.
    const ambiguousBody = ambiguous.body as {
      message: string;
      organisations: { organisationId: string; legalName: string }[];
    };
    expect(ambiguousBody.organisations).toHaveLength(2);
    expect(
      ambiguousBody.organisations.find((o) => o.organisationId === secondOrg.id)
        ?.legalName,
    ).toBe('Multi-org Second Org');
    expect(
      ambiguousBody.organisations.find(
        (o) => o.organisationId === firstIdentity.organisationId,
      )?.legalName,
    ).toBe('Multi-org Home Org');

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

  it('check-phone reports whether a phone number already has an account', async () => {
    const phoneNumber = uniquePhone();
    const before = await request(app.getHttpServer())
      .post('/auth/check-phone')
      .send({ phoneNumber })
      .expect(200);
    expect((before.body as { exists: boolean }).exists).toBe(false);

    const registered = await registerOrganisation({
      phoneNumber,
      password: 'correct-horse-battery-staple',
      legalName: 'Check Phone Org',
      organisationType: 'voluntary',
    });
    trackForCleanup(await me(registered.accessToken));

    const after = await request(app.getHttpServer())
      .post('/auth/check-phone')
      .send({ phoneNumber })
      .expect(200);
    expect((after.body as { exists: boolean }).exists).toBe(true);
  });

  it('an existing account joining a second organisation via the public endpoint needs no name and reuses the same account', async () => {
    const phoneNumber = uniquePhone();
    const password = 'correct-horse-battery-staple';
    const orgA = await registerOrganisation({
      phoneNumber,
      password,
      legalName: 'Reuse Account Org A',
      organisationType: 'voluntary',
    });
    const identityA = await me(orgA.accessToken);
    trackForCleanup(identityA);

    const orgB = await registerOrganisation({
      phoneNumber: uniquePhone(),
      password: 'correct-horse-battery-staple',
      legalName: 'Reuse Account Org B',
      organisationType: 'voluntary',
    });
    const identityB = await me(orgB.accessToken);
    trackForCleanup(identityB);

    // Wrong password for an existing account is rejected, same as login.
    await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber,
        password: 'wrong-password',
        organisationId: identityB.organisationId,
      })
      .expect(401);

    // No `name` sent at all — the account already has one from orgA's
    // registration; the backend must not require (or need) another.
    const joinRes = await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber,
        password,
        organisationId: identityB.organisationId,
      })
      .expect(201);
    const joinedIdentity = await me(
      (joinRes.body as AccessTokenResponse).accessToken,
    );
    expect(joinedIdentity.sub).toBe(identityA.sub);
    expect(joinedIdentity.organisationId).toBe(identityB.organisationId);
    expect(joinedIdentity.role).toBe('MEMBER');
    createdOrgIds.push(joinedIdentity.organisationId);
  });

  it('an already-logged-in member can join a second organisation with just a join code — no phone or password', async () => {
    const orgA = await registerOrganisation({
      phoneNumber: uniquePhone(),
      password: 'correct-horse-battery-staple',
      legalName: 'Authenticated Join Org A',
      organisationType: 'voluntary',
    });
    const identityA = await me(orgA.accessToken);
    trackForCleanup(identityA);

    const orgB = await registerOrganisation({
      phoneNumber: uniquePhone(),
      password: 'correct-horse-battery-staple',
      legalName: 'Authenticated Join Org B',
      organisationType: 'voluntary',
    });
    const identityB = await me(orgB.accessToken);
    trackForCleanup(identityB);

    await request(app.getHttpServer())
      .post('/auth/organisations/join')
      .send({ organisationId: identityB.organisationId })
      .expect(401);

    const joinRes = await request(app.getHttpServer())
      .post('/auth/organisations/join')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ organisationId: identityB.organisationId })
      .expect(201);
    const joinedIdentity = await me(
      (joinRes.body as AccessTokenResponse).accessToken,
    );
    expect(joinedIdentity.sub).toBe(identityA.sub);
    expect(joinedIdentity.organisationId).toBe(identityB.organisationId);
    createdOrgIds.push(joinedIdentity.organisationId);

    // Already a member of orgB now — joining again is rejected, not
    // silently duplicated.
    await request(app.getHttpServer())
      .post('/auth/organisations/join')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ organisationId: identityB.organisationId })
      .expect(409);
  });

  it('joining an organisation notifies every admin of that organisation that a member is pending approval', async () => {
    const admin = await registerOrganisation({
      phoneNumber: uniquePhone(),
      password: 'correct-horse-battery-staple',
      legalName: 'Join Notification Org',
      organisationType: 'voluntary',
    });
    const adminIdentity = await me(admin.accessToken);
    trackForCleanup(adminIdentity);

    const joinerPhone = uniquePhone();
    const joinerPassword = 'correct-horse-battery-staple';
    const joinRes = await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber: joinerPhone,
        password: joinerPassword,
        name: 'Notification Test Joiner',
        organisationId: adminIdentity.organisationId,
      })
      .expect(201);
    const joinerIdentity = await me(
      (joinRes.body as AccessTokenResponse).accessToken,
    );
    createdAccountIds.push(joinerIdentity.sub);
    // Same org as the admin — already tracked via trackForCleanup above,
    // no separate push needed.
    expect(joinerIdentity.role).toBe('MEMBER');

    const notificationsRes = await request(app.getHttpServer())
      .get(`/members/${adminIdentity.memberId}/notifications`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const notifications = notificationsRes.body as {
      type: string;
      message: string;
      sourceType: string | null;
      sourceId: string | null;
    }[];
    const joinNotification = notifications.find(
      (n) => n.type === 'MEMBER_JOIN_PENDING',
    );
    expect(joinNotification).toBeDefined();
    expect(joinNotification?.message).toContain(joinerPhone);
    expect(joinNotification?.sourceType).toBe('member');
    expect(joinNotification?.sourceId).toBe(joinerIdentity.memberId);
  });

  it('lists every organisation an account belongs to, with isCurrent reflecting the token used', async () => {
    const phoneNumber = uniquePhone();
    const password = 'correct-horse-battery-staple';
    const first = await registerOrganisation({
      phoneNumber,
      password,
      legalName: 'Switcher List First Org',
      organisationType: 'voluntary',
    });
    const firstIdentity = await me(first.accessToken);
    trackForCleanup(firstIdentity);

    const secondRes = await request(app.getHttpServer())
      .post('/auth/organisations')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .send({ legalName: 'Switcher List Second Org', organisationType: 'employer-linked' })
      .expect(201);
    const second = secondRes.body as AccessTokenResponse;
    const secondIdentity = await me(second.accessToken);
    createdOrgIds.push(secondIdentity.organisationId);

    interface OrgListEntry {
      organisationId: string;
      legalName: string;
      role: 'ADMIN' | 'MEMBER';
      status: string;
      isCurrent: boolean;
    }

    const fromFirstToken = await request(app.getHttpServer())
      .get('/auth/organisations')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(200);
    const listFromFirst = fromFirstToken.body as OrgListEntry[];
    expect(listFromFirst).toHaveLength(2);
    expect(
      listFromFirst.find((o) => o.organisationId === firstIdentity.organisationId)?.isCurrent,
    ).toBe(true);
    expect(
      listFromFirst.find((o) => o.organisationId === secondIdentity.organisationId)?.isCurrent,
    ).toBe(false);
    expect(
      listFromFirst.find((o) => o.organisationId === secondIdentity.organisationId)?.legalName,
    ).toBe('Switcher List Second Org');

    const fromSecondToken = await request(app.getHttpServer())
      .get('/auth/organisations')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(200);
    const listFromSecond = fromSecondToken.body as OrgListEntry[];
    expect(
      listFromSecond.find((o) => o.organisationId === secondIdentity.organisationId)?.isCurrent,
    ).toBe(true);
  });

  it('rejects listing organisations with no token', async () => {
    await request(app.getHttpServer()).get('/auth/organisations').expect(401);
  });

  it('switches an active session to another organisation the account already belongs to, with no password', async () => {
    const phoneNumber = uniquePhone();
    const password = 'correct-horse-battery-staple';
    const first = await registerOrganisation({
      phoneNumber,
      password,
      legalName: 'Switch Target First Org',
      organisationType: 'voluntary',
    });
    const firstIdentity = await me(first.accessToken);
    trackForCleanup(firstIdentity);

    const secondRes = await request(app.getHttpServer())
      .post('/auth/organisations')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .send({ legalName: 'Switch Target Second Org', organisationType: 'employer-linked' })
      .expect(201);
    const second = secondRes.body as AccessTokenResponse;
    const secondIdentity = await me(second.accessToken);
    createdOrgIds.push(secondIdentity.organisationId);

    // Switching from the *first* token, with no password, lands on the
    // second org — the whole point being no re-authentication is needed.
    const switchRes = await request(app.getHttpServer())
      .post('/auth/organisations/switch')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .send({ organisationId: secondIdentity.organisationId })
      .expect(201);
    const switchedIdentity = await me(
      (switchRes.body as AccessTokenResponse).accessToken,
    );
    expect(switchedIdentity.sub).toBe(firstIdentity.sub);
    expect(switchedIdentity.organisationId).toBe(secondIdentity.organisationId);
    expect(switchedIdentity.memberId).toBe(secondIdentity.memberId);
    expect(switchedIdentity.role).toBe('ADMIN');
  });

  it('rejects switching to an organisation the account is not a member of, and rejects with no token', async () => {
    const registered = await registerOrganisation({
      phoneNumber: uniquePhone(),
      password: 'correct-horse-battery-staple',
      legalName: 'Switch Reject Org',
      organisationType: 'voluntary',
    });
    const identity = await me(registered.accessToken);
    trackForCleanup(identity);

    const otherOrg = await prisma.provisionOrganisation({
      legalName: 'Switch Reject Unrelated Org',
      type: 'voluntary',
      joinCode: `SWREJ-${Date.now()}`,
    });
    createdOrgIds.push(otherOrg.id);

    await request(app.getHttpServer())
      .post('/auth/organisations/switch')
      .set('Authorization', `Bearer ${registered.accessToken}`)
      .send({ organisationId: otherOrg.id })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/organisations/switch')
      .send({ organisationId: identity.organisationId })
      .expect(401);
  });
});
