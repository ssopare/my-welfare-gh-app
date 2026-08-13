import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateFundDto } from './dto/create-fund.dto';
import { CreateLedgerAccountDto } from './dto/create-ledger-account.dto';
import { TransferFundsDto } from './dto/transfer-funds.dto';
import { FundService } from './fund.service';
import { LedgerService } from './ledger.service';

@Controller('funds')
@UseGuards(JwtAuthGuard)
export class FundController {
  constructor(
    private readonly funds: FundService,
    private readonly ledger: LedgerService,
  ) {}

  @Post()
  create(@CurrentUser() user: AuthTokenPayload, @Body() dto: CreateFundDto) {
    return this.funds.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthTokenPayload) {
    return this.funds.list(user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthTokenPayload, @Param('id') id: string) {
    return this.funds.findOne(user, id);
  }

  @Post(':id/transfer')
  transfer(
    @CurrentUser() user: AuthTokenPayload,
    @Param('id') id: string,
    @Body() dto: TransferFundsDto,
  ) {
    return this.ledger.transferBetweenFunds(user, id, dto);
  }

  @Post(':id/accounts')
  createAccount(
    @CurrentUser() user: AuthTokenPayload,
    @Param('id') id: string,
    @Body() dto: CreateLedgerAccountDto,
  ) {
    return this.funds.createAccount(user, id, dto);
  }
}
