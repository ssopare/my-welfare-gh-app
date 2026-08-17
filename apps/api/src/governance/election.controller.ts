import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequiresModule } from '../subscriptions/requires-module.decorator';
import { CreateElectionDto } from './dto/create-election.dto';
import { CreateNominationDto } from './dto/create-nomination.dto';
import { VetNominationDto } from './dto/vet-nomination.dto';
import { CastVoteDto } from './dto/cast-vote.dto';
import { GovernanceService } from './governance.service';

// Gated behind the 'voting' plan module (see ModuleAccessGuard) —
// deliberately at the class level, not per-handler, so every route here
// (including reads/results) is covered uniformly. GovernanceController
// (governance-bodies/officers) is a separate controller and is
// unaffected — an organisation without the voting module keeps full
// access to committee/officer management, just not elections.
@Controller('elections')
@UseGuards(JwtAuthGuard)
@RequiresModule('voting')
export class ElectionController {
  constructor(private readonly governance: GovernanceService) {}

  @Post()
  createElection(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: CreateElectionDto,
  ) {
    return this.governance.createElection(user, dto);
  }

  @Get()
  listElections(@CurrentUser() user: AuthTokenPayload) {
    return this.governance.listElections(user);
  }

  @Get(':id')
  getElection(@CurrentUser() user: AuthTokenPayload, @Param('id') id: string) {
    return this.governance.getElection(user, id);
  }

  @Patch(':id/status')
  transitionElectionStatus(
    @CurrentUser() user: AuthTokenPayload,
    @Param('id') id: string,
    @Body('status')
    status:
      'DRAFT' | 'NOMINATION' | 'VETTING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED',
  ) {
    return this.governance.transitionElectionStatus(user, id, status);
  }

  @Post(':id/nominations')
  createNomination(
    @CurrentUser() user: AuthTokenPayload,
    @Param('id') id: string,
    @Body() dto: CreateNominationDto,
  ) {
    return this.governance.createNomination(user, id, dto);
  }

  @Post('nominations/:nominationId/second')
  secondNomination(
    @CurrentUser() user: AuthTokenPayload,
    @Param('nominationId') nominationId: string,
  ) {
    return this.governance.secondNomination(user, nominationId);
  }

  @Post('nominations/:nominationId/vet')
  vetNomination(
    @CurrentUser() user: AuthTokenPayload,
    @Param('nominationId') nominationId: string,
    @Body() dto: VetNominationDto,
  ) {
    return this.governance.vetNomination(user, nominationId, dto);
  }

  @Post(':id/vote')
  castVote(
    @CurrentUser() user: AuthTokenPayload,
    @Param('id') id: string,
    @Body() dto: CastVoteDto,
  ) {
    return this.governance.castVote(user, id, dto);
  }

  @Get(':id/results')
  getElectionResults(
    @CurrentUser() user: AuthTokenPayload,
    @Param('id') id: string,
  ) {
    return this.governance.getElectionResults(user, id);
  }
}
