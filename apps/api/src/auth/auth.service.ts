import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '../../generated/prisma/client';
import { NotificationService } from '../notifications/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { SubscriptionService } from '../subscriptions/subscription.service';
import { CheckPhoneDto } from './dto/check-phone.dto';
import { CreateAdditionalOrganisationDto } from './dto/create-additional-organisation.dto';
import { JoinAdditionalOrganisationDto } from './dto/join-additional-organisation.dto';
import { JoinOrganisationDto } from './dto/join-organisation.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterOrganisationDto } from './dto/register-organisation.dto';
import { SwitchOrganisationDto } from './dto/switch-organisation.dto';

export interface AuthTokenPayload {
  sub: string; // accountId
  memberId: string;
  organisationId: string;
  role: 'ADMIN' | 'MEMBER';
}

const PASSWORD_SALT_ROUNDS = 12;

// Excludes 0/O, 1/I/L — characters easily confused when a join code is
// read aloud or handwritten, which is the whole point of having one.
const JOIN_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const JOIN_CODE_SUFFIX_LENGTH = 5;
const JOIN_CODE_GENERATION_ATTEMPTS = 5;

function deriveJoinCodePrefix(legalName: string): string {
  const initials = legalName
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z]/g, '').charAt(0))
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 3);
  return initials || 'ORG';
}

function generateJoinCode(legalName: string): string {
  let suffix = '';
  for (let i = 0; i < JOIN_CODE_SUFFIX_LENGTH; i += 1) {
    suffix +=
      JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)];
  }
  return `${deriveJoinCodePrefix(legalName)}-${suffix}`;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly rbac: RbacService,
    private readonly subscriptions: SubscriptionService,
    private readonly notifications: NotificationService,
  ) {}

  async registerOrganisation(dto: RegisterOrganisationDto) {
    const existing = await this.prisma.account.findUnique({
      where: { phoneNumber: dto.phoneNumber },
    });
    if (existing) {
      throw new ConflictException(
        'An account with this phone number already exists',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS);
    const account = await this.prisma.account.create({
      data: { phoneNumber: dto.phoneNumber, passwordHash, name: dto.name },
    });

    const organisation = await this.provisionOrganisationWithJoinCode(dto);

    const member = await this.prisma.withTenant(organisation.id, (tx) =>
      this.foundOrganisationMemberInTx(
        tx,
        organisation.id,
        account.id,
        'Founding admin at tenant self-registration',
      ),
    );

    return this.issueToken({
      accountId: account.id,
      memberId: member.id,
      organisationId: organisation.id,
      role: member.role,
    });
  }

  // FR-ONB-01's other direction: an already-authenticated account founding
  // an *additional* organisation, rather than registerOrganisation's
  // brand-new-Account path (which explicitly refuses a phone number that's
  // already registered — see the ConflictException above). Same founding-
  // admin setup, just keyed to the caller's existing accountId instead of
  // creating a new one, and returning a token scoped to the new org since
  // every session here is single-org — the caller lands in the new
  // organisation's context immediately, the same way registering does.
  async createAdditionalOrganisation(
    actor: AuthTokenPayload,
    dto: CreateAdditionalOrganisationDto,
  ) {
    const organisation = await this.provisionOrganisationWithJoinCode(dto);

    const member = await this.prisma.withTenant(organisation.id, (tx) =>
      this.foundOrganisationMemberInTx(
        tx,
        organisation.id,
        actor.sub,
        'Founding admin — additional organisation created from an existing account',
      ),
    );

    return this.issueToken({
      accountId: actor.sub,
      memberId: member.id,
      organisationId: organisation.id,
      role: member.role,
    });
  }

  private async foundOrganisationMemberInTx(
    tx: Prisma.TransactionClient,
    organisationId: string,
    accountId: string,
    statusChangeReason: string,
  ) {
    const created = await tx.member.create({
      data: {
        accountId,
        organisationId,
        role: 'ADMIN',
        // The founding admin isn't "pending" anything — there's no one
        // else in the org yet to approve them. PENDING (the default for
        // everyone else) is for FR-MEM-09's join-an-existing-org path.
        status: 'ACTIVE',
      },
    });
    await tx.memberStatusChange.create({
      data: {
        memberId: created.id,
        organisationId,
        fromStatus: null,
        toStatus: 'ACTIVE',
        reason: statusChangeReason,
      },
    });

    // §13.2: a fresh tenant gets real, assignable roles from day one,
    // not an empty role list — and the founding admin's actual
    // authorization now comes from holding this RoleAssignment, not
    // from Member.role (see the schema comment on MemberRole).
    const roleIdsByName = await this.rbac.seedStarterRolesInTx(
      tx,
      organisationId,
    );
    const orgAdminRoleId = roleIdsByName.get('Org Admin');
    if (!orgAdminRoleId) {
      throw new Error('Org Admin starter role template failed to seed');
    }
    await this.rbac.assignRoleInTx(
      tx,
      organisationId,
      created.id,
      orgAdminRoleId,
    );

    // §18.1: "Free Trial: every new tenant, automatically."
    await this.subscriptions.createTrialInTx(tx, organisationId);

    return created;
  }

  // Wraps PrismaService.provisionOrganisation with a generated joinCode,
  // retrying on the astronomically unlikely chance of a collision (5
  // random chars from a 32-symbol alphabet — see generateJoinCode) rather
  // than trusting it never happens.
  private async provisionOrganisationWithJoinCode(dto: {
    legalName: string;
    organisationType: string;
  }) {
    for (
      let attempt = 1;
      attempt <= JOIN_CODE_GENERATION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.prisma.provisionOrganisation({
          legalName: dto.legalName,
          type: dto.organisationType,
          joinCode: generateJoinCode(dto.legalName),
        });
      } catch (error) {
        const isJoinCodeCollision =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          (error.meta?.target as string[] | undefined)?.includes('joinCode');
        if (!isJoinCodeCollision || attempt === JOIN_CODE_GENERATION_ATTEMPTS) {
          throw error;
        }
      }
    }
    // Unreachable — the loop above always either returns or throws.
    throw new Error('Failed to generate a unique join code');
  }

  // Either dto.joinCode (the normal path — see the organisation_join_code
  // migration) or dto.organisationId (the raw id, still accepted — e.g.
  // an admin re-inviting someone who already has the id from elsewhere)
  // can identify the organisation to join; exactly one of them is
  // required, enforced here rather than at the DTO level since it's a
  // cross-field business rule, not a per-field shape check. Typed to the
  // shared shape (not JoinOrganisationDto specifically) so the
  // authenticated join-additional-organisation path can reuse this too.
  private async resolveOrganisationId(dto: {
    organisationId?: string;
    joinCode?: string;
  }): Promise<string> {
    if (dto.organisationId) {
      return dto.organisationId;
    }
    if (!dto.joinCode) {
      throw new BadRequestException(
        'Either an organisationId or a joinCode is required',
      );
    }
    const organisation = await this.prisma.withJoinCodeLookupContext((tx) =>
      tx.organisation.findFirst({
        where: { joinCode: dto.joinCode },
        select: { id: true },
      }),
    );
    if (!organisation) {
      throw new NotFoundException('Invalid join code');
    }
    return organisation.id;
  }

  async joinOrganisation(dto: JoinOrganisationDto) {
    const organisationId = await this.resolveOrganisationId(dto);

    let account = await this.prisma.account.findUnique({
      where: { phoneNumber: dto.phoneNumber },
    });

    if (account) {
      if (!(await bcrypt.compare(dto.password, account.passwordHash))) {
        throw new UnauthorizedException('Invalid phone number or password');
      }
    } else {
      if (!dto.name) {
        throw new BadRequestException(
          'A name is required to create a new account',
        );
      }
      const passwordHash = await bcrypt.hash(
        dto.password,
        PASSWORD_SALT_ROUNDS,
      );
      account = await this.prisma.account.create({
        data: { phoneNumber: dto.phoneNumber, passwordHash, name: dto.name },
      });
    }

    return this.joinOrganisationForAccount(account.id, organisationId);
  }

  // Whether dto.phoneNumber has an Account yet — nothing else is leaked
  // (no name, no org membership). Lets the join screen decide up front
  // whether to ask for a name (new account) or just a password ("welcome
  // back"), instead of always asking for both and silently discarding the
  // name when it turns out the account already existed.
  async checkPhoneExists(dto: CheckPhoneDto): Promise<{ exists: boolean }> {
    const account = await this.prisma.account.findUnique({
      where: { phoneNumber: dto.phoneNumber },
      select: { id: true },
    });
    return { exists: !!account };
  }

  // Authenticated counterpart to joinOrganisation, for a member who's
  // already logged in and just wants to join a second organisation — the
  // caller's JWT already proves who they are, so this needs nothing but a
  // join code, the same way createAdditionalOrganisation reuses actor.sub
  // to *found* a second org instead of asking to re-register.
  async joinAdditionalOrganisation(
    actor: AuthTokenPayload,
    dto: JoinAdditionalOrganisationDto,
  ) {
    const organisationId = await this.resolveOrganisationId(dto);
    return this.joinOrganisationForAccount(actor.sub, organisationId);
  }

  // Shared core for both join paths above — the only place a Member ever
  // gets created for FR-MEM-09's "join an existing org" flow (as opposed
  // to founding one), so the admin notification below can't accidentally
  // diverge between the phone/password entry point and the
  // already-logged-in one.
  private async joinOrganisationForAccount(
    accountId: string,
    organisationId: string,
  ) {
    // Cross-tenant read (which orgs does this account already belong to?)
    // — same bootstrapping problem login() solves, same fix: app.account_id
    // rather than any tenant context.
    const existingMemberships = await this.prisma.withAccount(accountId, (tx) =>
      tx.member.findMany({ where: { accountId } }),
    );
    if (existingMemberships.some((m) => m.organisationId === organisationId)) {
      throw new ConflictException(
        'This account is already a member of that organisation',
      );
    }

    // FR-MEM-10 prefill source. Dependant only carries the ordinary
    // tenant_isolation RLS policy (no account-scoped one — this is a rare,
    // join-time-only lookup, not worth a second permissive policy the way
    // Member's own_memberships earns its keep on every login). So each
    // existing membership's dependants are fetched through *that*
    // membership's own tenant context, one at a time, rather than via
    // app.account_id.
    const prefillDependants: { relationship: string; name: string }[] = [];
    const seenDependantKeys = new Set<string>();
    for (const existing of existingMemberships) {
      const dependants = await this.prisma.withTenant(
        existing.organisationId,
        (tx) => tx.dependant.findMany({ where: { memberId: existing.id } }),
      );
      for (const dependant of dependants) {
        const key = `${dependant.relationship}::${dependant.name}`;
        if (seenDependantKeys.has(key)) continue;
        seenDependantKeys.add(key);
        prefillDependants.push({
          relationship: dependant.relationship,
          name: dependant.name,
        });
      }
    }

    const joiningAccount = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { phoneNumber: true },
    });

    const member = await this.prisma.withTenant(organisationId, async (tx) => {
      const organisation = await tx.organisation.findUnique({
        where: { id: organisationId },
      });
      if (!organisation) {
        throw new NotFoundException('Organisation not found');
      }

      const created = await tx.member.create({
        data: { accountId, organisationId },
      });
      await tx.memberStatusChange.create({
        data: {
          memberId: created.id,
          organisationId,
          fromStatus: null,
          toStatus: created.status,
          reason: 'Joined organisation (FR-MEM-09)',
        },
      });

      // FR-MEM-10: prefill dependants from the account's other
      // memberships, but unconfirmed — each needs explicit re-confirmation
      // before this org's claims can treat it as pre-registered.
      for (const dependant of prefillDependants) {
        await tx.dependant.create({
          data: {
            memberId: created.id,
            organisationId,
            relationship: dependant.relationship,
            name: dependant.name,
            confirmed: false,
          },
        });
      }

      // The starter templates were already seeded when this org was
      // created (registerOrganisation), so joining just looks up the
      // existing "Member" template rather than reseeding anything.
      const memberRole = await tx.role.findFirst({
        where: {
          organisationId,
          name: 'Member',
          isTemplate: true,
        },
      });
      if (memberRole) {
        await this.rbac.assignRoleInTx(
          tx,
          organisationId,
          created.id,
          memberRole.id,
        );
      }

      // New joiners land in PENDING (Member.status default) and need an
      // admin to review them (MembershipService.changeStatus) — until
      // now, nothing ever told an admin one was waiting; the only signal
      // was a "pending approval" line under a dashboard KPI, easy to miss
      // indefinitely. Same admin-targeting requireAdmin itself checks
      // (RbacService.hasWildcardAdminPermission), same fan-out pattern
      // already used for subscription-lapsed notices
      // (NotificationSchedulerService).
      if (created.status === 'PENDING') {
        const adminIds = await this.rbac.listMembersWithPermissionInTx(
          tx,
          '*',
          '*',
        );
        for (const adminId of adminIds) {
          await this.notifications.notifyInTx(
            tx,
            organisationId,
            adminId,
            'MEMBER_JOIN_PENDING',
            `${joiningAccount?.phoneNumber ?? 'A new member'} has requested to join and is awaiting approval.`,
            { sourceType: 'member', sourceId: created.id },
          );
        }
      }

      return created;
    });

    return this.issueToken({
      accountId,
      memberId: member.id,
      organisationId: member.organisationId,
      role: member.role,
    });
  }

  async login(dto: LoginDto) {
    const account = await this.prisma.account.findUnique({
      where: { phoneNumber: dto.phoneNumber },
    });
    if (
      !account ||
      !(await bcrypt.compare(dto.password, account.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid phone number or password');
    }

    const memberships = await this.prisma.withAccount(account.id, (tx) =>
      tx.member.findMany({ where: { accountId: account.id } }),
    );
    if (memberships.length === 0) {
      throw new UnauthorizedException(
        'This account has no organisation memberships',
      );
    }

    let member = memberships[0];
    if (memberships.length > 1) {
      if (!dto.organisationId) {
        // The password already checked out above, so revealing which
        // organisations this account belongs to here is safe — same
        // "authenticate before disclosing membership" ordering as
        // everywhere else. Lets the frontend render real organisation
        // names instead of demanding a memorized raw id (see
        // hydrateMembershipOrganisations).
        const organisations =
          await this.hydrateMembershipOrganisations(memberships);
        throw new BadRequestException({
          message:
            'This account belongs to multiple organisations; specify organisationId',
          organisations,
        });
      }
      const match = memberships.find(
        (m) => m.organisationId === dto.organisationId,
      );
      if (!match) {
        throw new UnauthorizedException(
          'Not a member of the specified organisation',
        );
      }
      member = match;
    }

    return this.issueToken({
      accountId: account.id,
      memberId: member.id,
      organisationId: member.organisationId,
      role: member.role,
    });
  }

  // Turns a raw membership list into the browseable {organisationId,
  // legalName, role, status, isCurrent} shape shared by listMyOrganisations
  // and login()'s multi-org disambiguation — one withTenant() per
  // membership to read that org's own legalName, same per-org loop
  // pattern already used for dependant-prefill in
  // joinOrganisationForAccount, since there's no cross-tenant "read many
  // organisations at once" RLS policy and these lists are always short
  // (one account's own memberships, not a general org directory).
  // currentOrganisationId is omitted pre-login (login() has no "current"
  // org yet to mark) — every entry's isCurrent is then simply false.
  private async hydrateMembershipOrganisations(
    memberships: { organisationId: string; role: 'ADMIN' | 'MEMBER'; status: string }[],
    currentOrganisationId?: string,
  ) {
    const organisations: {
      organisationId: string;
      legalName: string;
      role: 'ADMIN' | 'MEMBER';
      status: string;
      isCurrent: boolean;
    }[] = [];
    for (const membership of memberships) {
      const organisation = await this.prisma.withTenant(
        membership.organisationId,
        (tx) =>
          tx.organisation.findUnique({
            where: { id: membership.organisationId },
            select: { legalName: true },
          }),
      );
      if (!organisation) continue;
      organisations.push({
        organisationId: membership.organisationId,
        legalName: organisation.legalName,
        role: membership.role,
        status: membership.status,
        isCurrent: membership.organisationId === currentOrganisationId,
      });
    }
    return organisations;
  }

  // Every organisation the caller's account belongs to, for a "switch
  // organisation" picker — the counterpart to login()'s multi-org
  // disambiguation, but browseable instead of requiring a memorized raw
  // id. Same cross-tenant discovery call login() and
  // joinOrganisationForAccount() already use.
  async listMyOrganisations(actor: AuthTokenPayload) {
    const memberships = await this.prisma.withAccount(actor.sub, (tx) =>
      tx.member.findMany({ where: { accountId: actor.sub } }),
    );
    return this.hydrateMembershipOrganisations(
      memberships,
      actor.organisationId,
    );
  }

  // Reissues a token scoped to a *different* organisation the caller's
  // account already belongs to — no password, the JWT already proves who
  // they are, same reasoning as joinAdditionalOrganisation. This is what
  // actually lets someone "switch groups" instead of logging out and back
  // in with that org's raw id (previously the only way back — see the
  // comment on the admin console's createAdditionalOrganisationAction).
  async switchOrganisation(
    actor: AuthTokenPayload,
    dto: SwitchOrganisationDto,
  ) {
    const membership = await this.prisma.withAccount(actor.sub, (tx) =>
      tx.member.findFirst({
        where: { accountId: actor.sub, organisationId: dto.organisationId },
      }),
    );
    if (!membership) {
      throw new UnauthorizedException(
        'Not a member of the specified organisation',
      );
    }

    return this.issueToken({
      accountId: actor.sub,
      memberId: membership.id,
      organisationId: membership.organisationId,
      role: membership.role,
    });
  }

  private issueToken(params: {
    accountId: string;
    memberId: string;
    organisationId: string;
    role: 'ADMIN' | 'MEMBER';
  }) {
    const payload: AuthTokenPayload = {
      sub: params.accountId,
      memberId: params.memberId,
      organisationId: params.organisationId,
      role: params.role,
    };
    return { accessToken: this.jwt.sign(payload) };
  }
}
