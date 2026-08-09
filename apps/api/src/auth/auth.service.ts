import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
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

    const member = await this.prisma.withTenant(organisation.id, (tx) =>
      tx.member.create({
        data: {
          accountId: account.id,
          organisationId: organisation.id,
          role: 'ADMIN',
        },
      }),
    );

    return this.issueToken({
      accountId: account.id,
      memberId: member.id,
      organisationId: organisation.id,
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
