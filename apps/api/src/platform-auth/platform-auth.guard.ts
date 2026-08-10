import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { PlatformAuthTokenPayload } from './platform-auth.service';

export interface PlatformAuthenticatedRequest extends Request {
  operator: PlatformAuthTokenPayload;
}

@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<PlatformAuthenticatedRequest>();
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: PlatformAuthTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<PlatformAuthTokenPayload>(
        authHeader.slice('Bearer '.length),
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    // The discriminator check that keeps a tenant Member's token (also
    // signed with the same secret) from ever passing as a platform
    // operator's — see the comment on PlatformAuthTokenPayload.
    if (payload.type !== 'platform_operator') {
      throw new UnauthorizedException('Not a platform operator token');
    }
    req.operator = payload;
    return true;
  }
}
