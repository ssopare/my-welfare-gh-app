import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { requireAdmin, requirePermission } from '../common/access.util';
import { RbacService } from '../rbac/rbac.service';
import { ReverseJournalEntryDto } from './dto/reverse-journal-entry.dto';
import { LedgerService } from './ledger.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class LedgerController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly rbac: RbacService,
  ) {}

  // ledger:view exists in the RBAC catalog specifically for Treasurer/
  // Auditor to see real account balances — this route had no check at
  // all before, so any plain Member (zero ledger grants) could read the
  // exact live Cash/Contributions Income/etc. balance for any account id
  // in their org.
  @Get('ledger-accounts/:id/balance')
  async getBalance(
    @CurrentUser() user: AuthTokenPayload,
    @Param('id') id: string,
  ) {
    await requirePermission(this.rbac, user, 'ledger', 'view');
    return this.ledger.getLedgerAccountBalance(user.organisationId, id);
  }

  @Get('journal-entries')
  listJournalEntries(
    @CurrentUser() user: AuthTokenPayload,
    @Query('fundId') fundId?: string,
  ) {
    return this.ledger.listJournalEntries(user, fundId);
  }

  @Post('journal-entries/:id/reverse')
  async reverse(
    @CurrentUser() user: AuthTokenPayload,
    @Param('id') id: string,
    @Body() dto: ReverseJournalEntryDto,
  ) {
    await requireAdmin(this.rbac, user);
    return this.ledger.reverseJournalEntry(
      user.organisationId,
      id,
      user.memberId,
      dto.reason,
    );
  }
}
