import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BudgetService } from './budget.service';
import { CreateBudgetDto } from './dto/create-budget.dto';

@Controller('budgets')
@UseGuards(JwtAuthGuard)
export class BudgetController {
  constructor(private readonly budgets: BudgetService) {}

  @Post()
  create(@CurrentUser() user: AuthTokenPayload, @Body() dto: CreateBudgetDto) {
    return this.budgets.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthTokenPayload) {
    return this.budgets.listWithActuals(user);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthTokenPayload, @Param('id') id: string) {
    return this.budgets.remove(user, id);
  }
}
