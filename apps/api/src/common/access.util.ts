import { ForbiddenException } from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';

// RBAC is still a placeholder (Member.role ADMIN/MEMBER — see the real
// model's slot in the Phase 1 roadmap, §13). These inline checks are
// deliberately minimal and will be replaced outright when that slice lands,
// not built out into a bigger guard/decorator framework ahead of it.
export function requireAdmin(actor: AuthTokenPayload) {
  if (actor.role !== 'ADMIN') {
    throw new ForbiddenException('Only an organisation admin can do this');
  }
}

export function requireSelfOrAdmin(
  actor: AuthTokenPayload,
  targetMemberId: string,
) {
  if (actor.memberId !== targetMemberId && actor.role !== 'ADMIN') {
    throw new ForbiddenException(
      'Can only do this for yourself unless you are an admin',
    );
  }
}
