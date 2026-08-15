import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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

interface RuleResponse {
  id: string;
  status: string;
}

interface RoleResponse {
  id: string;
  name: string;
}

interface NotificationResponse {
  id: string;
  memberId: string;
  type: string;
  message: string;
  sourceType: string | null;
  sourceId: string | null;
  readAt: string | null;
}

interface MemberDetailResponse {
  status: string;
}

// Phase 1 post-roadmap: Notifications (§8.11), Phase 1 scope per the
// roadmap table — due reminders, claim-status updates (FR-COM-01/02).
// Formal notice/read-receipt tracking for meetings (FR-COM-03) is Phase 2.
// No SMS/push/email provider exists for this project, so these are a real
// in-app inbox, not a dispatch system — see the schema comment on
// Notification. Also the first genuinely scheduled process in the app
// (NotificationSchedulerService), tested by calling runDailySweep()
// directly rather than waiting on the real cron schedule.
describe('Notifications (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let scheduler: NotificationSchedulerService;
  const createdOrgIds: string[] = [];
  const createdAccountIds: string[] = [];

  beforeAll(async () => {
    jest.setTimeout(30000);
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
        tx.claimStageAction.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.claimEvidence.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.claim.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.defaulterPolicy.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.journalLine.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.journalEntry.deleteMany({ where: { organisationId } }),
      );
      await prisma.withTenant(organisationId, (tx) =>
        tx.obligation.deleteMany({ where: { organisationId } }),
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
        tx.contributionPlan.deleteMany({ where: { organisationId } }),
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
    await app.close();
  });

  function uniquePhone() {
    return `+233-notif-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function daysFromNow(days: number): string {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  function daysAgo(days: number): string {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
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
  ) {
    await request(app.getHttpServer())
      .patch(`/members/${memberId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status })
      .expect(200);
  }

  async function createFund(adminToken: string) {
    const res = await request(app.getHttpServer())
      .post('/funds')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'General Welfare Fund' })
      .expect(201);
    return res.body as { id: string };
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

  async function getNotifications(
    actorToken: string,
    memberId: string,
  ): Promise<NotificationResponse[]> {
    const res = await request(app.getHttpServer())
      .get(`/members/${memberId}/notifications`)
      .set('Authorization', `Bearer ${actorToken}`)
      .expect(200);
    return res.body as NotificationResponse[];
  }

  it('submitting a claim notifies the claimant and, with an approval chain, the eligible approvers', async () => {
    const admin = await registerOrganisation('Notif Submit Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const approver = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    await grantTreasurer(admin.accessToken, approver.identity.memberId);
    const rule = await createActiveBenefitRule(admin.accessToken, {
      approvalChain: ['treasurer_disburse'],
    });

    await request(app.getHttpServer())
      .post(`/benefit-rules/${rule.id}/claims`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({
        memberId: member.identity.memberId,
        eventDate: new Date().toISOString(),
      })
      .expect(201);

    const claimantNotifs = await getNotifications(
      member.accessToken,
      member.identity.memberId,
    );
    expect(
      claimantNotifs.some(
        (n) => n.type === 'CLAIM_STATUS_CHANGED' && n.readAt === null,
      ),
    ).toBe(true);

    const approverNotifs = await getNotifications(
      admin.accessToken,
      approver.identity.memberId,
    );
    expect(approverNotifs.some((n) => n.type === 'CLAIM_STAGE_ENTERED')).toBe(
      true,
    );
  });

  it('deciding and disbursing a claim notify the claimant at each status change; rejection too', async () => {
    const admin = await registerOrganisation('Notif Decide Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    const approver = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');
    await grantTreasurer(admin.accessToken, approver.identity.memberId);
    const fund = await createFund(admin.accessToken);
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
    const claim = submitRes.body as { id: string };

    await request(app.getHttpServer())
      .post(`/claims/${claim.id}/decide`)
      .set('Authorization', `Bearer ${approver.accessToken}`)
      .send({ decision: 'APPROVE' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/claims/${claim.id}/disburse`)
      .set('Authorization', `Bearer ${approver.accessToken}`)
      .send({ fundId: fund.id })
      .expect(201);

    const notifs = await getNotifications(
      member.accessToken,
      member.identity.memberId,
    );
    const messages = notifs
      .filter((n) => n.type === 'CLAIM_STATUS_CHANGED')
      .map((n) => n.message);
    expect(messages.some((m) => m.includes('submitted'))).toBe(true);
    expect(messages.some((m) => m.includes('approved'))).toBe(true);
    expect(messages.some((m) => m.includes('disbursed'))).toBe(true);

    // Mark one read; self can, another ordinary member cannot.
    const unread = notifs.find((n) => !n.readAt);
    await request(app.getHttpServer())
      .patch(`/notifications/${unread!.id}/read`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(200);

    const otherMember = await joinOrganisation(admin.identity.organisationId);
    const secondUnread = notifs.find((n) => n.id !== unread!.id);
    await request(app.getHttpServer())
      .patch(`/notifications/${secondUnread!.id}/read`)
      .set('Authorization', `Bearer ${otherMember.accessToken}`)
      .expect(403);
  });

  it('a rejected claim notifies the claimant', async () => {
    const admin = await registerOrganisation('Notif Reject Org');
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
    const claim = submitRes.body as { id: string };

    await request(app.getHttpServer())
      .post(`/claims/${claim.id}/decide`)
      .set('Authorization', `Bearer ${approver.accessToken}`)
      .send({ decision: 'REJECT' })
      .expect(201);

    const notifs = await getNotifications(
      member.accessToken,
      member.identity.memberId,
    );
    expect(
      notifs.some(
        (n) =>
          n.type === 'CLAIM_STATUS_CHANGED' && n.message.includes('rejected'),
      ),
    ).toBe(true);
  });

  it('the daily sweep sends a due-date reminder once, not duplicated on a second run', async () => {
    const admin = await registerOrganisation('Notif Reminder Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');

    const planRes = await request(app.getHttpServer())
      .post('/contribution-plans')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: 'Monthly Due',
        cadence: 'monthly',
        amountValue: '20.00',
        currency: 'GHS',
        reminderDaysBeforeDue: 7,
      })
      .expect(201);
    const plan = planRes.body as RuleResponse;
    await request(app.getHttpServer())
      .post(`/contribution-plans/${plan.id}/activate`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/contribution-plans/${plan.id}/obligations`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ memberId: member.identity.memberId, dueDate: daysFromNow(3) })
      .expect(201);

    await scheduler.runDailySweep();
    await scheduler.runDailySweep();

    const notifs = await getNotifications(
      member.accessToken,
      member.identity.memberId,
    );
    const reminders = notifs.filter(
      (n) => n.type === 'CONTRIBUTION_DUE_REMINDER',
    );
    expect(reminders).toHaveLength(1);
  }, 30000);

  it('the daily sweep sends a risk alert one period before the threshold and auto-transitions status at the threshold, with no manual reassess call', async () => {
    const admin = await registerOrganisation('Notif Defaulter Sweep Org');
    const member = await joinOrganisation(admin.identity.organisationId);
    await setStatus(admin.accessToken, member.identity.memberId, 'ACTIVE');

    const planRes = await request(app.getHttpServer())
      .post('/contribution-plans')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: 'Monthly Due',
        cadence: 'monthly',
        amountValue: '20.00',
        currency: 'GHS',
      })
      .expect(201);
    const plan = planRes.body as RuleResponse;
    await request(app.getHttpServer())
      .post(`/contribution-plans/${plan.id}/activate`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post('/defaulter-policy')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ defaulterThresholdMonths: 2, forfeitureThresholdMonths: 5 })
      .expect(201);

    // One missed period: one short of the threshold (2) — risk alert only.
    await request(app.getHttpServer())
      .post(`/contribution-plans/${plan.id}/obligations`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ memberId: member.identity.memberId, dueDate: daysAgo(30) })
      .expect(201);
    await scheduler.runDailySweep();

    const afterOneMissed = await getNotifications(
      member.accessToken,
      member.identity.memberId,
    );
    expect(afterOneMissed.some((n) => n.type === 'DEFAULTER_RISK_ALERT')).toBe(
      true,
    );
    const statusAfterOneMissed = await request(app.getHttpServer())
      .get('/members/me')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(200);
    expect((statusAfterOneMissed.body as MemberDetailResponse).status).toBe(
      'ACTIVE',
    );

    // A second missed period reaches the threshold — the sweep itself
    // (never an explicit reassess-standing call) must flip the status.
    await request(app.getHttpServer())
      .post(`/contribution-plans/${plan.id}/obligations`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ memberId: member.identity.memberId, dueDate: daysAgo(1) })
      .expect(201);
    await scheduler.runDailySweep();

    const statusAfterTwoMissed = await request(app.getHttpServer())
      .get('/members/me')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .expect(200);
    expect((statusAfterTwoMissed.body as MemberDetailResponse).status).toBe(
      'DEFAULTER',
    );
  }, 30000);

  it('cross-tenant: a notification is only visible within its own organisation', async () => {
    const orgA = await registerOrganisation('Notif Cross-Tenant Org A');
    const memberA = await joinOrganisation(orgA.identity.organisationId);
    const approverA = await joinOrganisation(orgA.identity.organisationId);
    await setStatus(orgA.accessToken, memberA.identity.memberId, 'ACTIVE');
    await grantTreasurer(orgA.accessToken, approverA.identity.memberId);
    const rule = await createActiveBenefitRule(orgA.accessToken);

    await request(app.getHttpServer())
      .post(`/benefit-rules/${rule.id}/claims`)
      .set('Authorization', `Bearer ${memberA.accessToken}`)
      .send({
        memberId: memberA.identity.memberId,
        eventDate: new Date().toISOString(),
      })
      .expect(201);
    const notifsA = await getNotifications(
      orgA.accessToken,
      memberA.identity.memberId,
    );
    const notificationId = notifsA[0].id;

    const orgB = await registerOrganisation('Notif Cross-Tenant Org B');
    await request(app.getHttpServer())
      .patch(`/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .expect(404);
  });
});
