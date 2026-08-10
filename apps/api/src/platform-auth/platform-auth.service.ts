import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformLoginDto } from './dto/platform-login.dto';

// The `type: 'platform_operator'` discriminator is what stops a
// PlatformOperator token and a tenant Member token (AuthTokenPayload) from
// ever being mistaken for each other, even though both are signed with the
// same JWT_SECRET/JwtService — PlatformAuthGuard checks for it explicitly.
export interface PlatformAuthTokenPayload {
  sub: string; // PlatformOperator.id
  type: 'platform_operator';
}

// No self-registration endpoint exists — PlatformOperator rows are
// provisioned by scripts/create-platform-operator.ts, an ops action, not
// a product surface. This service only ever logs an existing one in.
@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: PlatformLoginDto) {
    const operator = await this.prisma.platformOperator.findUnique({
      where: { email: dto.email },
    });
    if (
      !operator ||
      !(await bcrypt.compare(dto.password, operator.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const payload: PlatformAuthTokenPayload = {
      sub: operator.id,
      type: 'platform_operator',
    };
    return { accessToken: this.jwt.sign(payload) };
  }
}
