import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { requireAdmin } from '../common/access.util';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { UpdateOrganisationSettingsDto } from './dto/update-organisation-settings.dto';

// Surfaced while building the admin console: every existing endpoint
// either operates on a specific already-known resource or returns just
// the JWT payload (GET /auth/me) — nothing anywhere returns the tenant's
// own Organisation row, so there was no way to show something as basic as
// "which organisation is this" (its name) anywhere in a UI. Open to any
// authenticated member, not admin-only — a name and type aren't sensitive
// the way financial configuration is.
@Injectable()
export class OrganisationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async getOwn(actor: AuthTokenPayload) {
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const organisation = await tx.organisation.findUnique({
        where: { id: actor.organisationId },
      });
      if (!organisation) {
        throw new NotFoundException('Organisation not found');
      }
      return organisation;
    });
  }

  // First org-settings write endpoint — everything before this only ever
  // read Organisation (see getOwn's own comment) or set fields like
  // makerCheckerEnabled directly in a test/seed script, with no HTTP
  // surface at all. Scoped to just paymentAllocationPolicy for now rather
  // than a general settings PATCH, since that's the one this slice
  // actually needs an admin to be able to change.
  async updateSettings(
    actor: AuthTokenPayload,
    dto: UpdateOrganisationSettingsDto,
  ) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.organisation.update({
        where: { id: actor.organisationId },
        data: {
          paymentAllocationPolicy: dto.paymentAllocationPolicy,
        },
      }),
    );
  }
}
