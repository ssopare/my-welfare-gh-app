import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformAuthGuard } from './platform-auth.guard';
import { PlatformAuthService } from './platform-auth.service';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  // Fail at startup, not on the first login attempt — same as AuthModule.
  throw new Error('JWT_SECRET environment variable is required');
}

// Deliberately a self-contained JwtModule.register() rather than importing
// AuthModule for its exported one — platform-operator auth is a
// conceptually independent actor from tenant Members (see the schema
// comment on PlatformOperator), sharing the same secret purely for
// operational simplicity (one env var), not because the two are related.
@Module({
  imports: [
    JwtModule.register({
      secret: jwtSecret,
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [PlatformAuthController],
  providers: [PlatformAuthService, PlatformAuthGuard],
  exports: [PlatformAuthGuard, JwtModule],
})
export class PlatformAuthModule {}
