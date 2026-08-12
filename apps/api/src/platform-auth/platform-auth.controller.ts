import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentOperator } from './current-operator.decorator';
import { PlatformLoginDto } from './dto/platform-login.dto';
import { PlatformAuthGuard } from './platform-auth.guard';
import { PlatformAuthService } from './platform-auth.service';
import type { PlatformAuthTokenPayload } from './platform-auth.service';

@Controller('platform/auth')
export class PlatformAuthController {
  constructor(private readonly platformAuth: PlatformAuthService) {}

  @Post('login')
  login(@Body() dto: PlatformLoginDto) {
    return this.platformAuth.login(dto);
  }

  // Mirrors the tenant side's GET /auth/me — the admin console's session
  // helper needs a real endpoint to verify a token against (never trust a
  // cookie's mere presence), same reasoning as requireSession() there. The
  // JWT payload itself carries no email, only the operator id, so this is
  // also how the console displays who's actually logged in.
  @UseGuards(PlatformAuthGuard)
  @Get('me')
  me(@CurrentOperator() operator: PlatformAuthTokenPayload) {
    return this.platformAuth.me(operator.sub);
  }
}
