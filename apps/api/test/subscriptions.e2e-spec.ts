import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { NotificationSchedulerService } from '../src/notifications/notification-scheduler.service';
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

interface SubscriptionPlanResponse {
  id: string;
  name: string;
  archived: boolean;
}

interface SubscriptionResponse {
  id: string;
  organisationId: string;
  status: string;
  planId: string | null;
  trialEndsAt: string;
  currentPeriodEnd: string | null;
}

interface NotificationResponse {
  type: string;
  memberId: string;
}

// Post-Phase-1 track, item 5/5: Subscription billing (§18), Phase 1 scope
// per the roadmap table — free trial + one flat paid tier, operator-
// editable pricing table. The full Starter/Growth/Enterprise matrix and
// Federation-tier bundling (FR-SUB-06) are Phase 2. Real HTTP requests,
// real Postgres, same style as the earlier e2e specs — plus a second,
// entirely separate auth system (PlatformOperator) exercised alongside
// the ordinary tenant one.
describe('Subscription billing (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let scheduler: NotificationSchedulerService;
  const createdOrgIds: string[] = [];
  const createdAccountIds: string[] = [];
  const createdOperatorIds: string[] = [];
  const createdPlanIds: string[] = [];

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
    scheduler = app.get(NotificationSchedulerService);
  });

  afterAll(async () => {
    for (const organisationId of createdOrgIds) {
      await prisma.withTenant(organisationId, (tx) =>
        tx.notification.deleteMany({ where: { organisationId } }),
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
    for (const planId of createdPlanIds) {
      await prisma.subscriptionPlan.delete({ where: { id: planId } });
    }
    for (const operatorId of createdOperatorIds) {
      await prisma.platformOperator.delete({ where: { id: operatorId } });
    }
    await app.close();
  });

  function uniquePhone() {
    return `+233-sub-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function uniqueEmail() {
    return `operator-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

  // No HTTP registration endpoint exists for platform operators by design
  // (see the schema comment on PlatformOperator) — seeded directly, same
  // precedent as other tests inserting data Prisma-side when no HTTP
  // surface exists for it.
  async function createPlatformOperator(): Promise<{
    accessToken: string;
    operatorId: string;
  }> {
    const email = uniqueEmail();
    const password = 'operator-password-123';
    const passwordHash = await bcrypt.hash(password, 12);
    const operator = await prisma.platformOperator.create({
      data: { email, passwordHash },
    });
    createdOperatorIds.push(operator.id);

    const res = await request(app.getHttpServer())
      .post('/platform/auth/login')
      .send({ email, password })
      .expect(201);
    return {
      accessToken: (res.body as AccessTokenResponse).accessToken,
      operatorId: operator.id,
    };
  }

  async function createPlan(
    operatorToken: string,
    overrides: Record<string, unknown> = {},
  ): Promise<SubscriptionPlanResponse> {
    const res = await request(app.getHttpServer())
      .post('/platform/subscription-plans')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        name: 'Standard',
        priceAmount: '50.00',
        currency: 'GHS',
        billingCadence: 'monthly',
        ...overrides,
      })
      .expect(201);
    const plan = res.body as SubscriptionPlanResponse;
    createdPlanIds.push(plan.id);
    return plan;
  }

  it('every new organisation automatically gets a TRIAL subscription, admin-visible', async () => {
    const admin = await registerOrganisation('Subscription Trial Org');
    const member = await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber: uniquePhone(),
        password: 'correct-horse-battery-staple',
        organisationId: admin.identity.organisationId,
      })
      .expect(201);
    createdAccountIds.push(
      (await me((member.body as AccessTokenResponse).accessToken)).sub,
    );

    const res = await request(app.getHttpServer())
      .get('/subscription')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const subscription = res.body as SubscriptionResponse;
    expect(subscription.status).toBe('TRIAL');
    expect(subscription.planId).toBeNull();
    expect(new Date(subscription.trialEndsAt).getTime()).toBeGreaterThan(
      Date.now(),
    );

    // Not admin-only in the sense of *visibility* being denied to ordinary
    // members — it's an admin-scoped endpoint entirely (requireAdmin), so
    // an ordinary member is refused outright.
    await request(app.getHttpServer())
      .get('/subscription')
      .set(
        'Authorization',
        `Bearer ${(member.body as AccessTokenResponse).accessToken}`,
      )
      .expect(403);
  });

  it('the platform operator manages the pricing table; a tenant admin cannot', async () => {
    const operator = await createPlatformOperator();
    const admin = await registerOrganisation('Subscription Plan Org');

    await request(app.getHttpServer())
      .post('/platform/subscription-plans')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: 'Should fail',
        priceAmount: '10.00',
        currency: 'GHS',
        billingCadence: 'monthly',
      })
      .expect(401);

    const plan = await createPlan(operator.accessToken, { name: 'Growth' });

    // Public — no auth needed at all.
    const listRes = await request(app.getHttpServer())
      .get('/subscription-plans')
      .expect(200);
    expect(
      (listRes.body as SubscriptionPlanResponse[]).some(
        (p) => p.id === plan.id,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .patch(`/platform/subscription-plans/${plan.id}/archive`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(200);
    const afterArchive = await request(app.getHttpServer())
      .get('/subscription-plans')
      .expect(200);
    expect(
      (afterArchive.body as SubscriptionPlanResponse[]).some(
        (p) => p.id === plan.id,
      ),
    ).toBe(false);
  });

  it('a tenant can convert from trial to a paid plan', async () => {
    const operator = await createPlatformOperator();
    const plan = await createPlan(operator.accessToken, {
      name: 'Annual Standard',
      billingCadence: 'annual',
    });
    const admin = await registerOrganisation('Subscription Convert Org');

    const res = await request(app.getHttpServer())
      .post('/subscription/convert')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ planId: plan.id })
      .expect(201);
    const subscription = res.body as SubscriptionResponse;
    expect(subscription.status).toBe('ACTIVE');
    expect(subscription.planId).toBe(plan.id);
    expect(subscription.currentPeriodEnd).not.toBeNull();
    const periodEndYear = new Date(
      subscription.currentPeriodEnd!,
    ).getFullYear();
    expect(periodEndYear).toBe(new Date().getFullYear() + 1);
  });

  it('a suspended subscription blocks new writes but never blocks reads/exports', async () => {
    const operator = await createPlatformOperator();
    const admin = await registerOrganisation('Subscription Suspended Org');

    // Reads work fine before suspension.
    await request(app.getHttpServer())
      .get('/members/me')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(
        `/platform/organisations/${admin.identity.organisationId}/subscription`,
      )
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .send({ status: 'SUSPENDED' })
      .expect(200);

    // Writes are blocked with 402 Payment Required...
    await request(app.getHttpServer())
      .post('/chapters')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Should be blocked' })
      .expect(402);

    // ...but reads/exports still work — FR-SUB-02.
    await request(app.getHttpServer())
      .get('/members/me')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    // The one write endpoint a suspended tenant must still reach: paying
    // to reactivate.
    const plan = await createPlan(operator.accessToken);
    await request(app.getHttpServer())
      .post('/subscription/convert')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ planId: plan.id })
      .expect(201);

    // Now ACTIVE again — writes work.
    await request(app.getHttpServer())
      .post('/chapters')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Now allowed' })
      .expect(201);
  });

  it('the platform operator sees subscriptions across tenants; a tenant token cannot reach platform endpoints and vice versa', async () => {
    const operator = await createPlatformOperator();
    const orgA = await registerOrganisation('Subscription Cross Org A');
    const orgB = await registerOrganisation('Subscription Cross Org B');

    const res = await request(app.getHttpServer())
      .get('/platform/subscriptions')
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(200);
    const orgIds = (res.body as SubscriptionResponse[]).map(
      (s) => s.organisationId,
    );
    expect(orgIds).toContain(orgA.identity.organisationId);
    expect(orgIds).toContain(orgB.identity.organisationId);

    // A tenant Member's token is not a platform operator token.
    await request(app.getHttpServer())
      .get('/platform/subscriptions')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .expect(401);

    // And a platform operator's token is not a tenant token — the ordinary
    // JwtAuthGuard-protected route rejects it too, since it carries no
    // organisationId/memberId shape a tenant endpoint's RLS context could
    // ever resolve to real data. (JwtAuthGuard doesn't shape-check, but
    // hasWildcardAdminPermission's query then fails to find anything —
    // the actual assertion here is just that it's never treated as valid
    // tenant access.)
    await request(app.getHttpServer())
      .get('/subscription')
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(403);
  });

  it('the daily sweep auto-suspends an expired trial and notifies the org admin', async () => {
    const admin = await registerOrganisation('Subscription Lapse Org');

    // Backdate the trial directly — no HTTP path lets you fast-forward
    // time, same precedent as other scheduler tests seeding past due
    // dates directly.
    await prisma.withTenant(admin.identity.organisationId, (tx) =>
      tx.subscription.update({
        where: { organisationId: admin.identity.organisationId },
        data: { trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
    );

    await scheduler.runDailySweep();

    const subRes = await request(app.getHttpServer())
      .get('/subscription')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect((subRes.body as SubscriptionResponse).status).toBe('SUSPENDED');

    const notifRes = await request(app.getHttpServer())
      .get(`/members/${admin.identity.memberId}/notifications`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(
      (notifRes.body as NotificationResponse[]).some(
        (n) => n.type === 'SUBSCRIPTION_LAPSED',
      ),
    ).toBe(true);

    // And now that it's formally SUSPENDED, writes are blocked too.
    await request(app.getHttpServer())
      .post('/chapters')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Should be blocked' })
      .expect(402);
  });
});
