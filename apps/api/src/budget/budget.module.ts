import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { BudgetController } from './budget.controller';
import { BudgetService } from './budget.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [BudgetController],
  providers: [BudgetService],
})
export class BudgetModule {}
