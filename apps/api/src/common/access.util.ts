import { ForbiddenException } from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import type { RbacService } from '../rbac/rbac.service';

// Real RBAC now (§13, roadmap slice 6) — a live, DB-backed check via
// RbacService, never Member.role or the AuthTokenPayload.role JWT claim
// (see the schema comment on MemberRole for why that field is no longer
// trusted for authorization). Signatures deliberately stayed close to the
// old placeholder's shape — an added `rbac` parameter, `await` at each
// call site — rather than a bigger guard/decorator rewrite, so this
// migration touches every existing call site mechanically instead of
// restructuring where each check happens.
export async function requireAdmin(
  rbac: RbacService,
  actor: AuthTokenPayload,
): Promise<void> {
  if (
    !(await rbac.hasWildcardAdminPermission(
      actor.organisationId,
      actor.memberId,
    ))
  ) {
    throw new ForbiddenException('Only an organisation admin can do this');
  }
}

export async function requireSelfOrAdmin(
  rbac: RbacService,
  actor: AuthTokenPayload,
  targetMemberId: string,
): Promise<void> {
  if (actor.memberId === targetMemberId) {
    return;
  }
  if (
    !(await rbac.hasWildcardAdminPermission(
      actor.organisationId,
      actor.memberId,
    ))
  ) {
    throw new ForbiddenException(
      'Can only do this for yourself unless you are an admin',
    );
  }
}

// For checks that aren't "admin or self" — e.g. Claims' approve/disburse
// actions, which specific non-admin roles (Treasurer, Convener, ...) hold
// via a real grant. hasPermission already treats the wildcard admin
// permission as matching any resource/action, so this alone is sufficient
// without a separate requireAdmin fallback.
export async function requirePermission(
  rbac: RbacService,
  actor: AuthTokenPayload,
  resource: string,
  action: string,
): Promise<void> {
  if (
    !(await rbac.hasPermission(
      actor.organisationId,
      actor.memberId,
      resource,
      action,
    ))
  ) {
    throw new ForbiddenException(`Missing permission: ${resource}:${action}`);
  }
}
