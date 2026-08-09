import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { requireAdmin } from '../common/access.util';
import { ReverseJournalEntryDto } from './dto/reverse-journal-entry.dto';
import { LedgerService } from './ledger.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('ledger-accounts/:id/balance')
  getBalance(@CurrentUser() user: AuthTokenPayload, @Param('id') id: string) {
    return this.ledger.getLedgerAccountBalance(user.organisationId, id);
  }

  @Post('journal-entries/:id/reverse')
  reverse(
    @CurrentUser() user: AuthTokenPayload,
    @Param('id') id: string,
    @Body() dto: ReverseJournalEntryDto,
  ) {
    requireAdmin(user);
    return this.ledger.reverseJournalEntry(
      user.organisationId,
      id,
      user.memberId,
      dto.reason,
    );
  }
}
