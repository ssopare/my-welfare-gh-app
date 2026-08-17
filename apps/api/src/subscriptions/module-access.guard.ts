import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthTokenPayload } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { REQUIRES_MODULE } from './requires-module.decorator';

// Gates a whole optional feature (voting, so far) behind an
// organisation's subscription plan — a plan-tier boundary, not a billing
// one, so it's deliberately a *separate* guard from SubscriptionGuard:
// SubscriptionGuard only ever blocks new writes once billing lapses and
// always lets reads through (§18.1's "data is never deleted, only new
// activity pauses"); this guard blocks reads too, on purpose — an
// organisation whose plan doesn't include voting shouldn't be able to see
// election data at all, not just be stopped from creating more of it.
//
// Same self-contained JWT-decoding approach as SubscriptionGuard, for the
// same reason: global guards run before any controller's
// @UseGuards(JwtAuthGuard), so this can't rely on that having already
// run. Real authentication/authorization is still entirely
// JwtAuthGuard/RBAC's job — this only ever adds an extra block on top,
// never grants access.
@Injectable()
export class ModuleAccessGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredModule = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRES_MODULE,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredModule) {
      return true; // most routes never carry @RequiresModule at all
    }

    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return true; // JwtAuthGuard will reject this; not this guard's job
    }

    let payload: Partial<AuthTokenPayload>;
    try {
      payload = await this.jwt.verifyAsync<Partial<AuthTokenPayload>>(
        authHeader.slice('Bearer '.length),
      );
    } catch {
      return true; // an invalid/expired token is JwtAuthGuard's job to reject
    }
    if (!payload.organisationId) {
      return true; // not a tenant token (e.g. a platform operator's)
    }

    const subscription = await this.prisma.withTenant(
      payload.organisationId,
      (tx) =>
        tx.subscription.findUnique({
          where: { organisationId: payload.organisationId },
          include: { plan: true },
        }),
    );
    // No Subscription row at all, or no plan chosen yet — an org still on
    // its free trial gets full access to every module, same as every
    // other feature during trial (SubscriptionGuard only ever restricts
    // a *lapsed* trial, never an active one). This gate only starts
    // meaning anything once an org has actually converted to a specific
    // plan — that plan's own includedModules list is what's authoritative
    // from that point on.
    if (!subscription?.planId) {
      return true;
    }
    const includedModules = subscription.plan?.includedModules ?? [];
    if (includedModules.includes(requiredModule)) {
      return true;
    }

    throw new ForbiddenException(
      `This feature isn't included in your organisation's current plan.`,
    );
  }
}
