import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { NotificationType } from '../generated/prisma/client';
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

interface SmsLogResponse {
  phoneNumber: string;
  provider: string;
  status: string;
  type: string;
}

interface NotificationChannelSettingResponse {
  notificationType: string;
  smsEnabled: boolean;
}

// No live ARKESEL_API_KEY/MNOTIFY_API_KEY/HUBTEL_CLIENT_ID is configured in
// this test environment (see jest-e2e-setup.ts's own note on why the
// suite must never depend on a live external service) — every dispatch
// here falls back to MockSmsProvider, deterministically, no network calls.
describe('SMS gateway (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdOrgIds: string[] = [];
  const createdAccountIds: string[] = [];
  const createdOperatorIds: string[] = [];
  const touchedNotificationTypes = new Set<NotificationType>();

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
        tx.smsLog.deleteMany({ where: { organisationId } }),
      );
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
        tx.subscription.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.organisation.delete({ where: { id: organisationId } }),
      );
    }
    for (const accountId of createdAccountIds) {
      await prisma.account.delete({ where: { id: accountId } });
    }
    for (const operatorId of createdOperatorIds) {
      await prisma.platformOperator.delete({ where: { id: operatorId } });
    }
    // NotificationChannelSetting is a shared, non-tenant-scoped platform
    // singleton per type (see its schema comment) — leaving one flipped on
    // would leak into every other test file/run that touches notifyInTx.
    for (const notificationType of touchedNotificationTypes) {
      await prisma.notificationChannelSetting.deleteMany({
        where: { notificationType },
      });
    }
    await app.close();
  });

  function uniquePhone() {
    return `+233-sms-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function uniqueEmail() {
    return `sms-operator-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  async function registerOrganisation(legalName: string): Promise<{
    accessToken: string;
    identity: MeResponse;
    phoneNumber: string;
  }> {
    const phoneNumber = uniquePhone();
    const res = await request(app.getHttpServer())
      .post('/auth/register-organisation')
      .send({
        phoneNumber,
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
    return { accessToken, identity, phoneNumber };
  }

  async function joinOrganisation(organisationId: string): Promise<{
    accessToken: string;
    identity: MeResponse;
    phoneNumber: string;
  }> {
    const phoneNumber = uniquePhone();
    const res = await request(app.getHttpServer())
      .post('/auth/join-organisation')
      .send({
        phoneNumber,
        password: 'correct-horse-battery-staple',
        organisationId,
        name: 'Test Member',
      })
      .expect(201);
    const { accessToken } = res.body as AccessTokenResponse;
    const identity = await me(accessToken);
    createdAccountIds.push(identity.sub);
    return { accessToken, identity, phoneNumber };
  }

  async function me(accessToken: string): Promise<MeResponse> {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    return res.body as MeResponse;
  }

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

  async function setChannelSetting(
    operatorToken: string,
    notificationType: NotificationType,
    smsEnabled: boolean,
  ): Promise<void> {
    touchedNotificationTypes.add(notificationType);
    await request(app.getHttpServer())
      .patch(`/platform/notification-channel-settings/${notificationType}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ smsEnabled })
      .expect(200);
  }

  async function waitFor(
    check: () => Promise<boolean>,
    { timeoutMs = 3000, intervalMs = 100 } = {},
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await check()) return true;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return false;
  }

  const SMS_ROUTES: {
    method: 'get' | 'post';
    path: string;
    body?: Record<string, unknown>;
  }[] = [
    { method: 'get', path: '/sms/balances' },
    { method: 'get', path: '/sms/logs' },
    {
      method: 'post',
      path: '/sms/test-send',
      body: { phoneNumber: '0244000000', message: 'hi' },
    },
    {
      method: 'post',
      path: '/sms/broadcast',
      body: { message: 'hi', recipientGroup: 'ALL_MEMBERS' },
    },
    {
      method: 'post',
      path: '/sms/send-otp',
      body: { phoneNumber: '0244000000' },
    },
    {
      method: 'post',
      path: '/sms/verify-otp',
      body: { phoneNumber: '0244000000', code: '000000' },
    },
  ];

  it('every SMS route rejects an unauthenticated request', async () => {
    for (const route of SMS_ROUTES) {
      const req = request(app.getHttpServer())[route.method](route.path);
      await (route.body ? req.send(route.body) : req).expect(401);
    }
  });

  it('every SMS route is admin-only — an ordinary member is refused', async () => {
    const admin = await registerOrganisation('SMS RBAC Org');
    const member = await joinOrganisation(admin.identity.organisationId);

    for (const route of SMS_ROUTES) {
      const req = request(app.getHttpServer())
        [route.method](route.path)
        .set('Authorization', `Bearer ${member.accessToken}`);
      await (route.body ? req.send(route.body) : req).expect(403);
    }
  });

  it('an admin can send a test SMS and see it reflected in balances and delivery logs', async () => {
    const admin = await registerOrganisation('SMS Test Send Org');

    const sendRes = await request(app.getHttpServer())
      .post('/sms/test-send')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ phoneNumber: '0244111222', message: 'Hello from the e2e suite' })
      .expect(201);
    expect((sendRes.body as { success: boolean }).success).toBe(true);
    expect((sendRes.body as { provider: string }).provider).toBe('MOCK');

    const balancesRes = await request(app.getHttpServer())
      .get('/sms/balances')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(
      (balancesRes.body as { providers: unknown[] }).providers.length,
    ).toBeGreaterThan(0);

    const logsRes = await request(app.getHttpServer())
      .get('/sms/logs')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const logs = logsRes.body as SmsLogResponse[];
    expect(
      logs.some((l) => l.phoneNumber === '0244111222' && l.provider === 'MOCK'),
    ).toBe(true);
  });

  it('broadcasting to the DEFAULTERS group actually reaches defaulters, not nobody', async () => {
    const admin = await registerOrganisation('SMS Broadcast Defaulters Org');
    const defaulter = await joinOrganisation(admin.identity.organisationId);

    // No simple HTTP path drives a member all the way into DEFAULTER
    // status quickly — seeded directly, same precedent as other e2e specs
    // backdating/seeding state Prisma-side (see subscriptions.e2e-spec.ts's
    // trial-backdating comment).
    await prisma.withTenant(admin.identity.organisationId, (tx) =>
      tx.member.update({
        where: { id: defaulter.identity.memberId },
        data: { status: 'DEFAULTER' },
      }),
    );

    const broadcastRes = await request(app.getHttpServer())
      .post('/sms/broadcast')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ message: 'You are in arrears', recipientGroup: 'DEFAULTERS' })
      .expect(201);
    const result = broadcastRes.body as {
      totalRecipients: number;
      successCount: number;
    };
    expect(result.totalRecipients).toBe(1);
    expect(result.successCount).toBe(1);

    const logsRes = await request(app.getHttpServer())
      .get('/sms/logs')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    const logs = logsRes.body as SmsLogResponse[];
    expect(
      logs.some(
        (l) =>
          l.phoneNumber === defaulter.phoneNumber && l.type === 'BROADCAST',
      ),
    ).toBe(true);
  });

  it("SMS delivery logs are tenant-isolated — one org never sees another org's log entries", async () => {
    const orgA = await registerOrganisation('SMS Isolation Org A');
    const orgB = await registerOrganisation('SMS Isolation Org B');

    await request(app.getHttpServer())
      .post('/sms/test-send')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ phoneNumber: '0244000111', message: 'Org A only' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/sms/test-send')
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .send({ phoneNumber: '0244000222', message: 'Org B only' })
      .expect(201);

    const logsA = (
      await request(app.getHttpServer())
        .get('/sms/logs')
        .set('Authorization', `Bearer ${orgA.accessToken}`)
        .expect(200)
    ).body as SmsLogResponse[];
    const logsB = (
      await request(app.getHttpServer())
        .get('/sms/logs')
        .set('Authorization', `Bearer ${orgB.accessToken}`)
        .expect(200)
    ).body as SmsLogResponse[];

    expect(logsA.some((l) => l.phoneNumber === '0244000111')).toBe(true);
    expect(logsA.some((l) => l.phoneNumber === '0244000222')).toBe(false);
    expect(logsB.some((l) => l.phoneNumber === '0244000222')).toBe(true);
    expect(logsB.some((l) => l.phoneNumber === '0244000111')).toBe(false);
  });

  it('the platform operator manages per-notification-type SMS toggles; a tenant admin cannot', async () => {
    const operator = await createPlatformOperator();
    const admin = await registerOrganisation('SMS Channel Settings Org');

    const listRes = await request(app.getHttpServer())
      .get('/platform/notification-channel-settings')
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(200);
    const settings = listRes.body as NotificationChannelSettingResponse[];
    // Full catalogue always listed, defaulting to off, even before any row
    // exists for a type — see NotificationChannelSettingService.list.
    expect(settings.length).toBe(6);
    expect(settings.every((s) => s.smsEnabled === false)).toBe(true);

    await request(app.getHttpServer())
      .get('/platform/notification-channel-settings')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .patch('/platform/notification-channel-settings/CLAIM_STATUS_CHANGED')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ smsEnabled: true })
      .expect(401);

    await setChannelSetting(operator.accessToken, 'CLAIM_STATUS_CHANGED', true);
    const afterToggle = (
      await request(app.getHttpServer())
        .get('/platform/notification-channel-settings')
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200)
    ).body as NotificationChannelSettingResponse[];
    expect(
      afterToggle.find((s) => s.notificationType === 'CLAIM_STATUS_CHANGED')
        ?.smsEnabled,
    ).toBe(true);

    await request(app.getHttpServer())
      .patch('/platform/notification-channel-settings/NOT_A_REAL_TYPE')
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .send({ smsEnabled: true })
      .expect(400);

    // Reset — this type is shared across every test file/run.
    await setChannelSetting(
      operator.accessToken,
      'CLAIM_STATUS_CHANGED',
      false,
    );
  });

  it('a notification type with SMS enabled actually dispatches an SMS when it fires; a disabled type never does', async () => {
    const operator = await createPlatformOperator();
    await setChannelSetting(operator.accessToken, 'MEMBER_JOIN_PENDING', true);

    // MEMBER_JOIN_PENDING fires (AuthService, on join) to every admin with
    // wildcard permission — the org creator here — for each pending
    // joiner. dispatchSmsIfEnabled is deliberately fire-and-forget (see
    // its own comment in notification.service.ts), so the SMS log write
    // can land slightly after the join HTTP response returns; poll for it
    // rather than asserting immediately.
    const enabledOrg = await registerOrganisation('SMS Wired Dispatch Org');
    await joinOrganisation(enabledOrg.identity.organisationId);

    const foundEnabled = await waitFor(async () => {
      const logs = (
        await request(app.getHttpServer())
          .get('/sms/logs')
          .set('Authorization', `Bearer ${enabledOrg.accessToken}`)
          .expect(200)
      ).body as SmsLogResponse[];
      return logs.some(
        (l) =>
          l.phoneNumber === enabledOrg.phoneNumber &&
          l.type === 'TRANSACTIONAL',
      );
    });
    expect(foundEnabled).toBe(true);

    await setChannelSetting(operator.accessToken, 'MEMBER_JOIN_PENDING', false);

    const disabledOrg = await registerOrganisation(
      'SMS Wired Dispatch Off Org',
    );
    await joinOrganisation(disabledOrg.identity.organisationId);

    // Give the (now-disabled) code path the same real window to have
    // fired erroneously, then confirm it didn't.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const logsAfterDisable = (
      await request(app.getHttpServer())
        .get('/sms/logs')
        .set('Authorization', `Bearer ${disabledOrg.accessToken}`)
        .expect(200)
    ).body as SmsLogResponse[];
    expect(logsAfterDisable.length).toBe(0);
  }, 15000);
});
