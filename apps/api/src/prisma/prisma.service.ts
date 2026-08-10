import { randomUUID } from 'node:crypto';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  Organisation,
  Prisma,
  PrismaClient,
} from '../../generated/prisma/client';

// Connects as app_runtime (see infra/docker/initdb/01-create-app-role.sh),
// never as the migration-owner role — app_runtime has no BYPASSRLS, which is
// what makes the tenant-isolation RLS policies in the enable_rls migration
// actually mean something. Never point this at DATABASE_URL.
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
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
   * Runs `fn` with the Postgres session variable `app.account_id` set for
   * that transaction only — the `own_memberships` RLS policy on members
   * reads it via `current_setting('app.account_id')`, letting an
   * authenticated Account discover which Organisation(s) it belongs to
   * without needing any tenant context set (see the
   * add_member_role_and_account_policy migration). Use this only for that
   * discovery step; once a request has picked/confirmed its organisationId,
   * go back to withTenant() for everything else.
   */
  async withAccount<T>(
    accountId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.account_id', ${accountId}, true)`;
      return fn(tx);
    });
  }

  /**
   * Runs `fn` with the Postgres session variable `app.system_context` set
   * to `'scheduler'` — the `system_scheduler_read` RLS policy on
   * organisations reads it, letting a genuinely cross-tenant process (only
   * NotificationSchedulerService's periodic sweep, so far) enumerate every
   * tenant before doing its real per-tenant work through the normal
   * withTenant() for everything else. Never call this from any
   * HTTP-reachable code path — nothing user-facing can set this session
   * variable, which is what makes it safe to exist at all.
   */
  async withSystemContext<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.system_context', 'scheduler', true)`;
      return fn(tx);
    });
  }

  /**
   * Runs `fn` with `app.system_context` set to `'platform_operator'` — the
   * `platform_operator_access` RLS policy on subscriptions reads it,
   * letting SubscriptionService's cross-tenant billing management
   * (changing any organisation's subscription status, regardless of which
   * tenant it belongs to) work at all. Unlike withSystemContext()
   * (scheduler-only, never HTTP-reachable), this *is* called from HTTP
   * endpoints — but only ones behind PlatformAuthGuard, which is the real
   * boundary here: only a request carrying a valid PlatformOperator JWT
   * ever reaches code that calls this. A tenant Member's JWT (checked by
   * the ordinary JwtAuthGuard) can never satisfy PlatformAuthGuard, so it
   * can never trigger this path.
   */
  async withPlatformOperatorContext<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.system_context', 'platform_operator', true)`;
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
    return this.withTenant(id, (tx) =>
      tx.organisation.create({ data: { id, ...data } }),
    );
  }
}
