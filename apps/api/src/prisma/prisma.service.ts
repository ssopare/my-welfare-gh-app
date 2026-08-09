import { randomUUID } from 'node:crypto';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Organisation, Prisma, PrismaClient } from '../../generated/prisma/client';

// Connects as app_runtime (see infra/docker/initdb/01-create-app-role.sh),
// never as the migration-owner role — app_runtime has no BYPASSRLS, which is
// what makes the tenant-isolation RLS policies in the enable_rls migration
// actually mean something. Never point this at DATABASE_URL.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg(process.env.APP_DATABASE_URL as string) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Runs `fn` inside a transaction with the Postgres session variable
   * `app.tenant_id` set for that transaction only (`set_config(..., true)`
   * is the parameterized equivalent of `SET LOCAL`), which the RLS policies
   * on organisations/members read via `current_setting('app.tenant_id')`.
   * Scoping it to the transaction (rather than the session) is required
   * because Prisma queries run against a pooled connection that gets reused
   * across requests/tenants.
   */
  async withTenant<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }

  /**
   * Tenant onboarding (§8.1): creates a brand-new Organisation. The id is
   * generated here, client-side, specifically so it can be passed to
   * withTenant() *before* the row exists — the organisations RLS policy
   * (see the simplify_organisation_rls_policy migration) applies to INSERT
   * too, and Prisma's .create() always does INSERT ... RETURNING, which
   * Postgres filters through the same policy. A new tenant is therefore
   * always created "as itself": the first thing that happens inside its own
   * app.tenant_id context is its own row being written.
   */
  async provisionOrganisation(
    data: Omit<Prisma.OrganisationCreateInput, 'id'>,
  ): Promise<Organisation> {
    const id = randomUUID();
    return this.withTenant(id, (tx) => tx.organisation.create({ data: { id, ...data } }));
  }
}
