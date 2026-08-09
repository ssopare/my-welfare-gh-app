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
import { ClaimService } from './claim.service';
import { ClaimEvidenceDto } from './dto/claim-evidence.dto';
import { DecideClaimDto } from './dto/decide-claim.dto';
import { DisburseClaimDto } from './dto/disburse-claim.dto';
import { SubmitClaimDto } from './dto/submit-claim.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class ClaimController {
  constructor(private readonly claims: ClaimService) {}

  @Post('benefit-rules/:ruleId/claims')
  submit(
    @CurrentUser() user: AuthTokenPayload,
    @Param('ruleId') ruleId: string,
    @Body() dto: SubmitClaimDto,
  ) {
    return this.claims.submit(user, ruleId, dto);
  }

  @Get('claims')
  list(
    @CurrentUser() user: AuthTokenPayload,
    @Query('status') status?: string,
  ) {
    return this.claims.list(user, status);
  }

  @Get('members/:memberId/claims')
  listForMember(
    @CurrentUser() user: AuthTokenPayload,
    @Param('memberId') memberId: string,
  ) {
    return this.claims.listForMember(user, memberId);
  }

  @Get('claims/:id')
  findOne(@CurrentUser() user: AuthTokenPayload, @Param('id') id: string) {
    return this.claims.findOne(user, id);
  }

  @Post('claims/:id/evidence')
  addEvidence(
    @CurrentUser() user: AuthTokenPayload,
    @Param('id') id: string,
    @Body() dto: ClaimEvidenceDto,
  ) {
    return this.claims.addEvidence(user, id, dto);
  }

  @Post('claims/:id/decide')
  decide(
    @CurrentUser() user: AuthTokenPayload,
    @Param('id') id: string,
    @Body() dto: DecideClaimDto,
  ) {
    return this.claims.decide(user, id, dto);
  }

  @Post('claims/:id/disburse')
  disburse(
    @CurrentUser() user: AuthTokenPayload,
    @Param('id') id: string,
    @Body() dto: DisburseClaimDto,
  ) {
    return this.claims.disburse(user, id, dto);
  }
}
