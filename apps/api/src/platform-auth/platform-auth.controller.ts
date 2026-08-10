import { Body, Controller, Post } from '@nestjs/common';
import { PlatformLoginDto } from './dto/platform-login.dto';
import { PlatformAuthService } from './platform-auth.service';

@Controller('platform/auth')
export class PlatformAuthController {
  constructor(private readonly platformAuth: PlatformAuthService) {}

  @Post('login')
  login(@Body() dto: PlatformLoginDto) {
    return this.platformAuth.login(dto);
  }
}
