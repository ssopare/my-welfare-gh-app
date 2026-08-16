import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UploadController } from './upload.controller';

// UploadController guards its one route with JwtAuthGuard, which itself
// depends on JwtService — AuthModule is what actually provides/exports
// both (see auth.module.ts), so it has to be imported here or Nest can't
// resolve JwtAuthGuard's constructor at all.
@Module({
  imports: [AuthModule],
  controllers: [UploadController],
})
export class UploadModule {}
