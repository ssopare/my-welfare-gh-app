// Populates a realistic demo organisation so the admin console and mobile
// app have something real to render — every screen (dashboard KPIs,
// Member 360, Claims, Contributions, Ledger) is empty by default since
// this project has no seed data otherwise, and an empty dashboard can't
// be fairly judged against a populated one.
//
// Boots the real Nest app and drives it through supertest, exactly like
// the e2e specs do — every row created here goes through the same
// validation, RLS, and business logic (ledger balancing, RBAC, defaulter
// side effects) real usage would, not hand-crafted rows that might not
// reflect what the app actually allows.
//
// Run with:
//   cd apps/api && npx ts-node -r tsconfig-paths/register scripts/seed-demo-data.ts
//
// Safe to re-run — each run creates a fresh organisation (unique phone
// numbers), it never touches existing data. Nothing here is deleted
// automatically; use the same afterAll-style Prisma cleanup the e2e specs
// use if you want to wipe a specific run.
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface AccessTokenResponse {
  accessToken: string;
}
interface MeResponse {
  sub: string;
  memberId: string;
  organisationId: string;
}
interface RoleResponse {
  id: string;
  name: string;
}
interface ChapterResponse {
  id: string;
  name: string;
}
interface FundResponse {
  id: string;
  ledgerAccounts: { id: string; name: string }[];
}
interface RuleResponse {
  id: string;
}
interface ObligationResponse {
  id: string;
}
interface ClaimResponse {
  id: string;
  status: string;
  currentStageIndex: number;
}

const PASSWORD = 'DemoPass123!';
let phoneCounter = 200000;
function uniquePhone() {
  phoneCounter += 1;
  return `+233${phoneCounter}`;
}

export async function runSeed() {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  const http = app.getHttpServer();

  async function post<T>(path: string, token: string | null, body: unknown): Promise<T> {
    const req = request(http).post(path);
    if (token) req.set('Authorization', `Bearer ${token}`);
    const res = await req.send(body as Record<string, unknown>);
    if (res.status >= 300) {
      throw new Error(`POST ${path} -> ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res.body as T;
  }
  async function patch<T>(path: string, token: string, body: unknown): Promise<T> {
    const res = await request(http).patch(path).set('Authorization', `Bearer ${token}`).send(body as Record<string, unknown>);
    if (res.status >= 300) {
      throw new Error(`PATCH ${path} -> ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res.body as T;
  }
  async function get<T>(path: string, token: string): Promise<T> {
    const res = await request(http).get(path).set('Authorization', `Bearer ${token}`);
    if (res.status >= 300) {
      throw new Error(`GET ${path} -> ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res.body as T;
  }

  async function me(accessToken: string): Promise<MeResponse> {
    return get<MeResponse>('/auth/me', accessToken);
  }

  console.log('Registering demo organisation...');
  const adminPhone = uniquePhone();
  const { accessToken: adminToken } = await post<AccessTokenResponse>(
    '/auth/register-organisation',
    null,
    {
      phoneNumber: adminPhone,
      password: PASSWORD,
      legalName: 'St. Joseph Staff Welfare',
      organisationType: 'employer-linked',
    },
  );
  const adminIdentity = await me(adminToken);
  const organisationId = adminIdentity.organisationId;

  // --- Chapters --------------------------------------------------------
  const headOffice = await post<ChapterResponse>('/chapters', adminToken, { name: 'Head Office' });
  const regionalBranch = await post<ChapterResponse>('/chapters', adminToken, { name: 'Regional Branch' });

  // --- Members -----------------------------------------------------------
  console.log('Joining demo members...');
  interface JoinedMember {
    phone: string;
    memberId: string;
    accessToken: string;
  }
  async function join(chapterId: string, category = 'standard'): Promise<JoinedMember> {
    const phone = uniquePhone();
    const { accessToken } = await post<AccessTokenResponse>('/auth/join-organisation', null, {
      phoneNumber: phone,
      password: PASSWORD,
      organisationId,
    });
    const identity = await me(accessToken);
    await patch(`/members/${identity.memberId}/chapter`, adminToken, { chapterId });
    if (category !== 'standard') {
      // No dedicated endpoint for category — same "no HTTP surface yet"
      // situation as makerCheckerEnabled; not worth adding just for seed
      // data, so this stays standard. Left here as a documented gap.
    }
    return { phone, memberId: identity.memberId, accessToken };
  }

  const headOfficeMembers = [
    await join(headOffice.id),
    await join(headOffice.id),
    await join(headOffice.id),
    await join(headOffice.id),
    await join(headOffice.id),
    await join(headOffice.id),
    await join(headOffice.id),
    await join(headOffice.id),
  ];
  const regionalMembers = [
    await join(regionalBranch.id),
    await join(regionalBranch.id),
    await join(regionalBranch.id),
    await join(regionalBranch.id),
    await join(regionalBranch.id),
  ];
  // A realistic status spread — most in good standing, a few in every
  // other state so the Members page's filter chips all have something
  // behind them, and one left PENDING (never activated) to show that
  // state too.
  const [m0, m1, m2, m3, m4, m5, m6, m7] = headOfficeMembers;
  const [m8, m9, m10, m11, m12] = regionalMembers;
  const activeMembers = [m0, m1, m2, m3, m4, m8, m9];
  for (const m of activeMembers) {
    await patch(`/members/${m.memberId}/status`, adminToken, { status: 'ACTIVE', reason: 'Approved after review' });
  }
  await patch(`/members/${m5.memberId}/status`, adminToken, { status: 'PROBATION', reason: 'New joiner, first period' });
  await patch(`/members/${m10.memberId}/status`, adminToken, { status: 'PROBATION', reason: 'New joiner, first period' });
  await patch(`/members/${m6.memberId}/status`, adminToken, { status: 'GRACE', reason: 'Missed most recent contribution' });
  await patch(`/members/${m11.memberId}/status`, adminToken, { status: 'DEFAULTER', reason: 'Multiple consecutive missed contributions' });
  await patch(`/members/${m7.memberId}/status`, adminToken, { status: 'SUSPENDED', reason: 'Under review by governance body' });
  // m12 stays PENDING — never activated, deliberately.

  // --- Dependants ----------------------------------------------------
  console.log('Adding dependants...');
  async function addDependant(member: JoinedMember, relationship: string, name: string, confirm: boolean) {
    const dep = await post<{ id: string }>('/members/me/dependants', member.accessToken, { relationship, name });
    if (confirm) {
      await patch(`/members/me/dependants/${dep.id}/confirm`, member.accessToken, {});
    }
  }
  await addDependant(m0, 'spouse', 'Abena Opare', true);
  await addDependant(m0, 'child', 'Nana Opare', true);
  await addDependant(m1, 'spouse', 'Efua Mensah', true);
  await addDependant(m2, 'child', 'Yaw Appiah', false);

  // --- Fund ------------------------------------------------------------
  console.log('Creating fund...');
  const fund = await post<FundResponse>('/funds', adminToken, { name: 'General Welfare Fund' });

  // --- Contribution plans ---------------------------------------------
  console.log('Creating contribution plans...');
  async function createActivePlan(name: string, amountValue: string, cadence = 'monthly') {
    const plan = await post<RuleResponse>('/contribution-plans', adminToken, {
      name,
      cadence,
      amountValue,
      currency: 'GHS',
    });
    return post<RuleResponse>(`/contribution-plans/${plan.id}/activate`, adminToken, {});
  }
  const monthlyPlan = await createActivePlan('Monthly Staff Contribution', '100.00');
  await createActivePlan('Executive Contribution', '250.00');
  await createActivePlan('Retiree Contribution', '80.00');

  // --- Obligations + payments -----------------------------------------
  console.log('Creating obligations and recording payments...');
  const dueDates = ['2026-05-10', '2026-06-10', '2026-07-10', '2026-08-10'];
  const payFully = [m0, m1, m2, m3, m8];
  const payPartially = [m4, m9];
  const neverPay = [m6];

  const obligationsByMember = new Map<string, ObligationResponse[]>();
  for (const m of [...activeMembers, m6]) {
    const obligations: ObligationResponse[] = [];
    for (const dueDate of dueDates) {
      obligations.push(
        await post<ObligationResponse>(`/contribution-plans/${monthlyPlan.id}/obligations`, adminToken, {
          memberId: m.memberId,
          dueDate,
        }),
      );
    }
    obligationsByMember.set(m.memberId, obligations);
  }
  // One upcoming (future) obligation, so the UPCOMING status appears too.
  await post<ObligationResponse>(`/contribution-plans/${monthlyPlan.id}/obligations`, adminToken, {
    memberId: m0.memberId,
    dueDate: '2026-09-10',
  });

  for (const m of payFully) {
    for (let i = 0; i < 4; i += 1) {
      await post('/payments/contribution', adminToken, {
        memberId: m.memberId,
        fundId: fund.id,
        amountValue: '100.00',
        currency: 'GHS',
        reference: `Demo payment ${i + 1}`,
      });
    }
  }
  for (const m of payPartially) {
    await post('/payments/contribution', adminToken, {
      memberId: m.memberId,
      fundId: fund.id,
      amountValue: '250.00', // covers 2 of the 4 in full, none partial exactly — close enough
      currency: 'GHS',
    });
    await post('/payments/contribution', adminToken, {
      memberId: m.memberId,
      fundId: fund.id,
      amountValue: '50.00', // partially pays a 3rd
      currency: 'GHS',
    });
  }
  void neverPay; // left entirely unpaid on purpose — see OVERDUE touch-up below

  // Push m6's (never-pay) oldest two obligations to OVERDUE directly —
  // real usage derives this via DefaulterService's scheduled reassessment,
  // which this script doesn't run; this is purely a cosmetic touch-up so
  // the OVERDUE status chip has something to show in the demo.
  const prisma = app.get(PrismaService);
  const m6Obligations = obligationsByMember.get(m6.memberId) ?? [];
  await prisma.withTenant(organisationId, (tx) =>
    tx.obligation.updateMany({
      where: { id: { in: m6Obligations.slice(0, 2).map((o) => o.id) } },
      data: { status: 'OVERDUE' },
    }),
  );

  // --- Roles for claims approval ---------------------------------------
  console.log('Granting Treasurer/Convener roles...');
  const roles = await get<RoleResponse[]>('/roles', adminToken);
  const treasurerRole = roles.find((r) => r.name === 'Treasurer');
  const convenerRole = roles.find((r) => r.name === 'Convener');
  const treasurer = m1; // Head Office
  const convener = m2; // Head Office
  if (treasurerRole) {
    await post(`/roles/${treasurerRole.id}/assignments`, adminToken, { memberId: treasurer.memberId });
  }
  if (convenerRole) {
    await post(`/roles/${convenerRole.id}/assignments`, adminToken, {
      memberId: convener.memberId,
      chapterId: headOffice.id,
    });
  }

  // --- Benefit rules -----------------------------------------------------
  console.log('Creating benefit rules...');
  async function createActiveRule(overrides: Record<string, unknown>) {
    const rule = await post<RuleResponse>('/benefit-rules', adminToken, {
      name: 'Benefit',
      triggerEvent: 'member.event',
      subjectTypes: ['self'],
      amountValue: '500.00',
      currency: 'GHS',
      occurrenceCapMax: 1,
      approvalChain: [],
      ...overrides,
    });
    return post<RuleResponse>(`/benefit-rules/${rule.id}/activate`, adminToken, {});
  }
  // subjectTypes stays ['self'] for both rules — no e2e test anywhere in
  // this codebase exercises ['dependant'] or whatever extra field claim
  // submission would need for it, so it's untested territory not worth
  // risking in a seed script.
  const bereavementRule = await createActiveRule({
    name: 'Bereavement Support',
    triggerEvent: 'member.bereavement',
    subjectTypes: ['self'],
    amountValue: '3000.00',
    approvalChain: ['convener_verify', 'treasurer_disburse'],
  });
  const medicalRule = await createActiveRule({
    name: 'Medical Support',
    triggerEvent: 'member.hospitalisation',
    subjectTypes: ['self'],
    amountValue: '1500.00',
    approvalChain: ['treasurer_disburse'],
  });

  // --- Claims, at every stage of the lifecycle ---------------------------
  console.log('Submitting and deciding claims...');
  async function submitClaim(rule: RuleResponse, member: JoinedMember, eventDate: string) {
    return post<ClaimResponse>(`/benefit-rules/${rule.id}/claims`, member.accessToken, {
      memberId: member.memberId,
      eventDate,
    });
  }

  // 1. Full lifecycle: submitted -> both stages approved -> disbursed (PAID).
  const claimPaid = await submitClaim(bereavementRule, m3, '2026-07-20');
  await post(`/claims/${claimPaid.id}/decide`, convener.accessToken, { decision: 'APPROVE', comment: 'Verified with chapter records' });
  await post(`/claims/${claimPaid.id}/decide`, treasurer.accessToken, { decision: 'APPROVE' });
  await post(`/claims/${claimPaid.id}/disburse`, treasurer.accessToken, { fundId: fund.id });

  // 2. Approved, not yet disbursed.
  const claimApproved = await submitClaim(medicalRule, m4, '2026-08-01');
  await post(`/claims/${claimApproved.id}/decide`, treasurer.accessToken, { decision: 'APPROVE' });

  // 3 & 4. Still awaiting a decision.
  await submitClaim(medicalRule, m8, '2026-08-05');
  await submitClaim(medicalRule, m9, '2026-08-08');

  // 5. Rejected partway through.
  const claimRejected = await submitClaim(bereavementRule, m0, '2026-06-15');
  await post(`/claims/${claimRejected.id}/decide`, convener.accessToken, { decision: 'APPROVE' });
  await post(`/claims/${claimRejected.id}/decide`, treasurer.accessToken, {
    decision: 'REJECT',
    comment: 'Missing death certificate — resubmit with documentation',
  });

  await app.close();

  console.log('\n=== Demo data ready ===');
  console.log(`Organisation: St. Joseph Staff Welfare`);
  console.log(`Organisation ID: ${organisationId}`);
  console.log(`\nAdmin login  — phone: ${adminPhone}  password: ${PASSWORD}`);
  console.log(`Treasurer    — phone: ${treasurer.phone}  password: ${PASSWORD}`);
  console.log(`Convener     — phone: ${convener.phone}  password: ${PASSWORD}`);
  console.log(`Ordinary member — phone: ${m0.phone}  password: ${PASSWORD}`);
  console.log(`Pending (unapproved) member — phone: ${m12.phone}  password: ${PASSWORD}`);
  console.log('\nUse the admin login on the web console (localhost:3001) and any');
  console.log('member phone/password to join-test or log into the Flutter app.');
}

// Only self-invokes when run directly (the documented ts-node command) —
// not when imported, e.g. by a one-off Jest wrapper that needs a working
// module-resolution pipeline instead. See that note at the top of this
// file for why ts-node alone doesn't work in this project as-is.
if (require.main === module) {
  void runSeed().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
