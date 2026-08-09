import { Module } from '@nestjs/common';
import { RbacService } from './rbac.service';

// Deliberately no controller and no imports here (PrismaModule is
// @Global, so RbacService doesn't need it declared) — this module exists
// purely so RbacService can be imported by AuthModule, MembershipModule,
// RuleEngineModule, LedgerModule, and PaymentsModule without any of them
// creating a cycle with AuthModule. RoleController (the HTTP surface for
// roles) lives in RoleModule instead, which imports both this module and
// AuthModule (for JwtAuthGuard) — AuthModule itself only ever needs the
// service.
@Module({
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
