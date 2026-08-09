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
import { AddDependantDto } from './dto/add-dependant.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CreateChapterDto } from './dto/create-chapter.dto';
import { TransferChapterDto } from './dto/transfer-chapter.dto';
import { MembershipService } from './membership.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @Get('members/me')
  getOwnMembership(@CurrentUser() user: AuthTokenPayload) {
    return this.membershipService.getOwnMembership(user);
  }

  @Post('members/me/dependants')
  addDependant(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: AddDependantDto,
  ) {
    return this.membershipService.addDependant(user, dto);
  }

  @Patch('members/me/dependants/:dependantId/confirm')
  confirmDependant(
    @CurrentUser() user: AuthTokenPayload,
    @Param('dependantId') dependantId: string,
  ) {
    return this.membershipService.confirmDependant(user, dependantId);
  }

  @Patch('members/:memberId/status')
  changeStatus(
    @CurrentUser() user: AuthTokenPayload,
    @Param('memberId') memberId: string,
    @Body() dto: ChangeStatusDto,
  ) {
    return this.membershipService.changeStatus(user, memberId, dto);
  }

  @Post('chapters')
  createChapter(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: CreateChapterDto,
  ) {
    return this.membershipService.createChapter(user, dto);
  }

  @Patch('members/:memberId/chapter')
  transferChapter(
    @CurrentUser() user: AuthTokenPayload,
    @Param('memberId') memberId: string,
    @Body() dto: TransferChapterDto,
  ) {
    return this.membershipService.transferChapter(user, memberId, dto);
  }
}
