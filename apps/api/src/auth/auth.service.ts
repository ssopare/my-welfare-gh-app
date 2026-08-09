import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { JoinOrganisationDto } from './dto/join-organisation.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterOrganisationDto } from './dto/register-organisation.dto';

export interface AuthTokenPayload {
  sub: string; // accountId
  memberId: string;
  organisationId: string;
  role: 'ADMIN' | 'MEMBER';
}

const PASSWORD_SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
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
      data: { phoneNumber: dto.phoneNumber, passwordHash },
    });

    const organisation = await this.prisma.provisionOrganisation({
      legalName: dto.legalName,
      type: dto.organisationType,
    });

    const member = await this.prisma.withTenant(organisation.id, async (tx) => {
      const created = await tx.member.create({
        data: {
          accountId: account.id,
          organisationId: organisation.id,
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
          organisationId: organisation.id,
          fromStatus: null,
          toStatus: 'ACTIVE',
          reason: 'Founding admin at tenant self-registration',
        },
      });
      return created;
    });

    return this.issueToken({
      accountId: account.id,
      memberId: member.id,
      organisationId: organisation.id,
      role: member.role,
    });
  }

  async joinOrganisation(dto: JoinOrganisationDto) {
    let account = await this.prisma.account.findUnique({
      where: { phoneNumber: dto.phoneNumber },
    });

    if (account) {
      if (!(await bcrypt.compare(dto.password, account.passwordHash))) {
        throw new UnauthorizedException('Invalid phone number or password');
      }
    } else {
      const passwordHash = await bcrypt.hash(
        dto.password,
        PASSWORD_SALT_ROUNDS,
      );
      account = await this.prisma.account.create({
        data: { phoneNumber: dto.phoneNumber, passwordHash },
      });
    }
    const accountId = account.id;

    // Cross-tenant read (which orgs does this account already belong to?)
    // — same bootstrapping problem login() solves, same fix: app.account_id
    // rather than any tenant context.
    const existingMemberships = await this.prisma.withAccount(accountId, (tx) =>
      tx.member.findMany({ where: { accountId } }),
    );
    if (
      existingMemberships.some((m) => m.organisationId === dto.organisationId)
    ) {
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

    const member = await this.prisma.withTenant(
      dto.organisationId,
      async (tx) => {
        const organisation = await tx.organisation.findUnique({
          where: { id: dto.organisationId },
        });
        if (!organisation) {
          throw new NotFoundException('Organisation not found');
        }

        const created = await tx.member.create({
          data: { accountId, organisationId: dto.organisationId },
        });
        await tx.memberStatusChange.create({
          data: {
            memberId: created.id,
            organisationId: dto.organisationId,
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
              organisationId: dto.organisationId,
              relationship: dependant.relationship,
              name: dependant.name,
              confirmed: false,
            },
          });
        }

        return created;
      },
    );

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
        throw new BadRequestException(
          'This account belongs to multiple organisations; specify organisationId',
        );
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
