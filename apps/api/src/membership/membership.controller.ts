import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddDependantDto } from './dto/add-dependant.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CreateChapterDto } from './dto/create-chapter.dto';
import { TransferChapterDto } from './dto/transfer-chapter.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { MembershipService } from './membership.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @Get('members')
  listMembers(
    @CurrentUser() user: AuthTokenPayload,
    @Query('status') status?: string,
  ) {
    return this.membershipService.listMembers(user, status);
  }

  @Get('members/me')
  getOwnMembership(@CurrentUser() user: AuthTokenPayload) {
    return this.membershipService.getOwnMembership(user);
  }

  @Patch('members/me/profile')
  updateOwnProfile(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: UpdateOwnProfileDto,
  ) {
    return this.membershipService.updateOwnProfile(user, dto);
  }

  // Must come before members/:memberId — Nest matches GET routes in
  // declaration order, and 'removal-requests' would otherwise be parsed as
  // a memberId by the wildcard route below.
  @Get('members/removal-requests')
  listRemovalRequests(
    @CurrentUser() user: AuthTokenPayload,
    @Query('status') status?: string,
  ) {
    return this.membershipService.listRemovalRequests(user, status);
  }

  @Post('members/removal-requests/:requestId/confirm')
  confirmRemoval(
    @CurrentUser() user: AuthTokenPayload,
    @Param('requestId') requestId: string,
  ) {
    return this.membershipService.confirmRemoval(user, requestId);
  }

  @Post('members/removal-requests/:requestId/cancel')
  cancelRemoval(
    @CurrentUser() user: AuthTokenPayload,
    @Param('requestId') requestId: string,
  ) {
    return this.membershipService.cancelRemoval(user, requestId);
  }

  @Get('members/:memberId')
  getMemberDetail(
    @CurrentUser() user: AuthTokenPayload,
    @Param('memberId') memberId: string,
  ) {
    return this.membershipService.getMemberDetail(user, memberId);
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

  @Get('chapters')
  listChapters(@CurrentUser() user: AuthTokenPayload) {
    return this.membershipService.listChapters(user);
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
