import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthTokenPayload } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { SKIP_SUBSCRIPTION_CHECK } from './skip-subscription-check.decorator';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// FR-SUB-02/03: a lapsed subscription blocks *new activity*, never reads —
// "data is never deleted on expiry, only new activity is paused until a
// plan is chosen" (§18.1). Registered globally (APP_GUARD in AppModule,
// not app.useGlobalGuards() in main.ts — the latter wouldn't run inside
// e2e tests, which bootstrap via Test.createTestingModule directly, never
// through main.ts's bootstrap()).
//
// Global guards run *before* any controller-level @UseGuards(JwtAuthGuard),
// so this can't rely on JwtAuthGuard having already decoded the token onto
// the request — it decodes independently (same JwtService/secret) and only
// acts when it positively recognizes a *tenant* payload (has
// organisationId). Anything it can't decode, or a platform-operator
// payload, or GET/HEAD/OPTIONS, is a no-op here — real authentication and
// authorization are still entirely JwtAuthGuard/PlatformAuthGuard's job;
// this guard only ever adds an extra block, never grants access.
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) {
      return true;
    }
    if (
      this.reflector.getAllAndOverride<boolean>(SKIP_SUBSCRIPTION_CHECK, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return true;
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
        }),
    );
    if (!subscription) {
      return true; // defensive: shouldn't happen for any org created after this slice
    }

    const trialExpired =
      subscription.status === 'TRIAL' && subscription.trialEndsAt < new Date();
    const blocked =
      subscription.status === 'SUSPENDED' ||
      subscription.status === 'CANCELLED' ||
      trialExpired;
    if (blocked) {
      throw new HttpException(
        "This organisation's subscription is not active — read access and data export still work, but new activity is paused until a plan is chosen or billing is brought current",
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return true;
  }
}
