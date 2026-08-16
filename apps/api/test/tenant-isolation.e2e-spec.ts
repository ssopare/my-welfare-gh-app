import { PrismaService } from '../src/prisma/prisma.service';

// Phase 0 exit criterion (docs/requirements §24.3): "An empty tenant can be
// created and proven isolated end-to-end in a test environment." This
// exercises the real Postgres RLS policies (infra/docker init script +
// the enable_rls/.../simplify_organisation_rls_policy migrations) through
// the same app_runtime role, provisionOrganisation(), and withTenant()
// helpers the NestJS app itself uses — nothing here is mocked.
describe('Tenant isolation (RLS)', () => {
  let prisma: PrismaService;
  let orgA: { id: string };
  let orgB: { id: string };
  let emptyOrg: { id: string };
  let accountId: string;
  let electionA: { id: string };
  let electionB: { id: string };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();

    const unique = Date.now();
    orgA = await prisma.provisionOrganisation({
      legalName: 'Org A Welfare Association',
      type: 'association',
      joinCode: `TSTA-${unique}`,
    });
    orgB = await prisma.provisionOrganisation({
      legalName: 'Org B Welfare Association',
      type: 'association',
      joinCode: `TSTB-${unique}`,
    });
    emptyOrg = await prisma.provisionOrganisation({
      legalName: 'Freshly Onboarded Org',
      type: 'association',
      joinCode: `TSTC-${unique}`,
    });

    accountId = (
      await prisma.account.create({
        data: { phoneNumber: `+233-rls-test-${Date.now()}`, passwordHash: 'x' },
      })
    ).id;

    // Seed one member under each of A and B, from within that org's own
    // tenant context — exactly like a real request would.
    const memberA = await prisma.withTenant(orgA.id, (tx) =>
      tx.member.create({ data: { accountId, organisationId: orgA.id } }),
    );
    await prisma.withTenant(orgB.id, (tx) =>
      tx.member.create({ data: { accountId, organisationId: orgB.id } }),
    );

    // One election per org (20260816020000_voting_tables_rls) — election
    // carries organisationId directly; nominee is one of the six child
    // tables scoped only through electionId, proving the join-based
    // policy variant too.
    const now = new Date();
    const later = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    electionA = await prisma.withTenant(orgA.id, (tx) =>
      tx.election.create({
        data: {
          organisationId: orgA.id,
          title: 'Org A Officer Election',
          type: 'OFFICER',
          startsAt: now,
          endsAt: later,
        },
      }),
    );
    electionB = await prisma.withTenant(orgB.id, (tx) =>
      tx.election.create({
        data: {
          organisationId: orgB.id,
          title: 'Org B Officer Election',
          type: 'OFFICER',
          startsAt: now,
          endsAt: later,
        },
      }),
    );
    await prisma.withTenant(orgA.id, (tx) =>
      tx.nominee.create({
        data: { electionId: electionA.id, memberId: memberA.id },
      }),
    );
  });

  afterAll(async () => {
    await prisma.withTenant(orgA.id, (tx) =>
      tx.nominee.deleteMany({ where: { electionId: electionA.id } }),
    );
    await prisma.withTenant(orgA.id, (tx) =>
      tx.election.deleteMany({ where: { organisationId: orgA.id } }),
    );
    await prisma.withTenant(orgB.id, (tx) =>
      tx.election.deleteMany({ where: { organisationId: orgB.id } }),
    );
    await prisma.withTenant(orgA.id, (tx) =>
      tx.member.deleteMany({ where: { organisationId: orgA.id } }),
    );
    await prisma.withTenant(orgB.id, (tx) =>
      tx.member.deleteMany({ where: { organisationId: orgB.id } }),
    );
    await prisma.account.delete({ where: { id: accountId } });
    await prisma.withTenant(orgA.id, (tx) =>
      tx.organisation.delete({ where: { id: orgA.id } }),
    );
    await prisma.withTenant(orgB.id, (tx) =>
      tx.organisation.delete({ where: { id: orgB.id } }),
    );
    await prisma.withTenant(emptyOrg.id, (tx) =>
      tx.organisation.delete({ where: { id: emptyOrg.id } }),
    );
    await prisma.onModuleDestroy();
  });

  it('a freshly created, empty tenant sees itself and no members at all', async () => {
    // Sequential, not Promise.all: both share one connection via this
    // interactive transaction's tx client, and pg doesn't support running
    // two queries concurrently on the same connection.
    const [orgs, members] = await prisma.withTenant(emptyOrg.id, async (tx) => {
      const orgResults = await tx.organisation.findMany();
      const memberResults = await tx.member.findMany();
      return [orgResults, memberResults];
    });
    expect(orgs.map((o) => o.id)).toEqual([emptyOrg.id]);
    expect(members).toHaveLength(0);
  });

  it("tenant A's scope contains only its own member, never tenant B's", async () => {
    const membersInA = await prisma.withTenant(orgA.id, (tx) =>
      tx.member.findMany(),
    );
    expect(membersInA).toHaveLength(1);
    expect(membersInA[0].organisationId).toBe(orgA.id);
  });

  it("tenant B's scope contains only its own member, never tenant A's", async () => {
    const membersInB = await prisma.withTenant(orgB.id, (tx) =>
      tx.member.findMany(),
    );
    expect(membersInB).toHaveLength(1);
    expect(membersInB[0].organisationId).toBe(orgB.id);
  });

  it("tenant A's scope cannot read organisation B's row", async () => {
    const orgs = await prisma.withTenant(orgA.id, (tx) =>
      tx.organisation.findMany(),
    );
    expect(orgs.map((o) => o.id)).toEqual([orgA.id]);
  });

  // 20260816020000_voting_tables_rls — elections carry organisationId
  // directly, so this is the same policy shape as organisation/member
  // above.
  it("tenant A's scope contains only its own election, never tenant B's", async () => {
    const elections = await prisma.withTenant(orgA.id, (tx) =>
      tx.election.findMany(),
    );
    expect(elections.map((e) => e.id)).toEqual([electionA.id]);
  });

  it("tenant B's scope contains only its own election, never tenant A's", async () => {
    const elections = await prisma.withTenant(orgB.id, (tx) =>
      tx.election.findMany(),
    );
    expect(elections.map((e) => e.id)).toEqual([electionB.id]);
  });

  // Nominee has no organisationId column at all — it's scoped only
  // through electionId, so this proves the join-based policy variant
  // (the one every other voting child table also uses) actually works,
  // not just the direct-column case elections/organisations/members share.
  it("tenant B's scope cannot read tenant A's nominee, scoped only through electionId", async () => {
    const [nomineesInA, nomineesInB] = await Promise.all([
      prisma.withTenant(orgA.id, (tx) => tx.nominee.findMany()),
      prisma.withTenant(orgB.id, (tx) => tx.nominee.findMany()),
    ]);
    expect(nomineesInA).toHaveLength(1);
    expect(nomineesInA[0].electionId).toBe(electionA.id);
    expect(nomineesInB).toHaveLength(0);
  });

  it('default-denies with no tenant context set at all', async () => {
    // No withTenant() wrapper here — app.tenant_id is unset, so
    // current_setting(..., true) is NULL and the RLS policy (organisationId
    // = NULL) is never true for any row. This is the proof that isolation
    // is enforced by Postgres itself, not by the application remembering to
    // filter — the failure mode of a forgotten WHERE clause is "see
    // nothing," never "see everything."
    const members = await prisma.member.findMany();
    const orgs = await prisma.organisation.findMany();
    const elections = await prisma.election.findMany();
    const nominees = await prisma.nominee.findMany();
    expect(members).toHaveLength(0);
    expect(orgs).toHaveLength(0);
    expect(elections).toHaveLength(0);
    expect(nominees).toHaveLength(0);
  });
});
