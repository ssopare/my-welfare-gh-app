import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AppointOfficerDto } from './dto/appoint-officer.dto';
import { CreateGovernanceBodyDto } from './dto/create-governance-body.dto';
import { GovernanceService } from './governance.service';

@Controller('governance-bodies')
@UseGuards(JwtAuthGuard)
export class GovernanceController {
  constructor(private readonly governance: GovernanceService) {}

  @Post()
  create(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: CreateGovernanceBodyDto,
  ) {
    return this.governance.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthTokenPayload) {
    return this.governance.list(user);
  }

  @Get(':id/officers')
  listOfficers(@CurrentUser() user: AuthTokenPayload, @Param('id') id: string) {
    return this.governance.listOfficers(user, id);
  }

  @Post(':id/officers')
  appointOfficer(
    @CurrentUser() user: AuthTokenPayload,
    @Param('id') id: string,
    @Body() dto: AppointOfficerDto,
  ) {
    return this.governance.appointOfficer(user, id, dto);
  }
}
