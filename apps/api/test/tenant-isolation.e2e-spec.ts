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

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();

    orgA = await prisma.provisionOrganisation({
      legalName: 'Org A Welfare Association',
      type: 'association',
    });
    orgB = await prisma.provisionOrganisation({
      legalName: 'Org B Welfare Association',
      type: 'association',
    });
    emptyOrg = await prisma.provisionOrganisation({
      legalName: 'Freshly Onboarded Org',
      type: 'association',
    });

    accountId = (
      await prisma.account.create({
        data: { phoneNumber: `+233-rls-test-${Date.now()}`, passwordHash: 'x' },
      })
    ).id;

    // Seed one member under each of A and B, from within that org's own
    // tenant context — exactly like a real request would.
    await prisma.withTenant(orgA.id, (tx) =>
      tx.member.create({ data: { accountId, organisationId: orgA.id } }),
    );
    await prisma.withTenant(orgB.id, (tx) =>
      tx.member.create({ data: { accountId, organisationId: orgB.id } }),
    );
  });

  afterAll(async () => {
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

  it('default-denies with no tenant context set at all', async () => {
    // No withTenant() wrapper here — app.tenant_id is unset, so
    // current_setting(..., true) is NULL and the RLS policy (organisationId
    // = NULL) is never true for any row. This is the proof that isolation
    // is enforced by Postgres itself, not by the application remembering to
    // filter — the failure mode of a forgotten WHERE clause is "see
    // nothing," never "see everything."
    const members = await prisma.member.findMany();
    const orgs = await prisma.organisation.findMany();
    expect(members).toHaveLength(0);
    expect(orgs).toHaveLength(0);
  });
});
