import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AuthTokenPayload } from './auth.service';

export interface AuthenticatedRequest extends Request {
  auth: AuthTokenPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      req.auth = await this.jwt.verifyAsync<AuthTokenPayload>(
        authHeader.slice('Bearer '.length),
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return true;
  }
}
