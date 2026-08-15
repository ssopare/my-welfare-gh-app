import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AuthTokenPayload } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { CheckPhoneDto } from './dto/check-phone.dto';
import { CreateAdditionalOrganisationDto } from './dto/create-additional-organisation.dto';
import { JoinAdditionalOrganisationDto } from './dto/join-additional-organisation.dto';
import { JoinOrganisationDto } from './dto/join-organisation.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterOrganisationDto } from './dto/register-organisation.dto';
import { SwitchOrganisationDto } from './dto/switch-organisation.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register-organisation')
  registerOrganisation(@Body() dto: RegisterOrganisationDto) {
    return this.authService.registerOrganisation(dto);
  }

  // An already-logged-in account founding a *second* organisation — see
  // AuthService.createAdditionalOrganisation. Authenticated, unlike
  // register-organisation above, since it reuses the caller's existing
  // Account rather than creating one.
  @Post('organisations')
  @UseGuards(JwtAuthGuard)
  createAdditionalOrganisation(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: CreateAdditionalOrganisationDto,
  ) {
    return this.authService.createAdditionalOrganisation(user, dto);
  }

  @Post('join-organisation')
  joinOrganisation(@Body() dto: JoinOrganisationDto) {
    return this.authService.joinOrganisation(dto);
  }

  // Whether a phone number already has an Account — public, side-effect
  // free. The mobile join screen calls this before deciding whether to
  // ask for a name (new account) or just a password ("welcome back").
  @Post('check-phone')
  @HttpCode(HttpStatus.OK)
  checkPhoneExists(@Body() dto: CheckPhoneDto) {
    return this.authService.checkPhoneExists(dto);
  }

  // Looks up an organisation's details and authStrategy by its joinCode
  // — public, read-only. Needed by join flows before authentication.
  @Post('organisation-by-code')
  @HttpCode(HttpStatus.OK)
  getOrganisationByCode(@Body() body: { joinCode: string }) {
    return this.authService.getOrganisationByCode(body.joinCode);
  }

  // Authenticated counterpart to join-organisation, for a member who's
  // already logged in and just wants to join a second organisation — see
  // AuthService.joinAdditionalOrganisation.
  @Post('organisations/join')
  @UseGuards(JwtAuthGuard)
  joinAdditionalOrganisation(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: JoinAdditionalOrganisationDto,
  ) {
    return this.authService.joinAdditionalOrganisation(user, dto);
  }

  // Every organisation the caller already belongs to — feeds a "switch
  // organisation" picker so switching doesn't require memorizing a raw id.
  @Get('organisations')
  @UseGuards(JwtAuthGuard)
  listMyOrganisations(@CurrentUser() user: AuthTokenPayload) {
    return this.authService.listMyOrganisations(user);
  }

  // Reissues a token scoped to a different organisation the caller
  // already belongs to — no password needed, the JWT already proves who
  // they are. See AuthService.switchOrganisation.
  @Post('organisations/switch')
  @UseGuards(JwtAuthGuard)
  switchOrganisation(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: SwitchOrganisationDto,
  ) {
    return this.authService.switchOrganisation(user, dto);
  }

  @Post('organisations/default')
  @UseGuards(JwtAuthGuard)
  setDefaultOrganisation(
    @CurrentUser() user: AuthTokenPayload,
    @Body() body: { organisationId: string },
  ) {
    return this.authService.setDefaultOrganisation(user, body.organisationId);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthTokenPayload) {
    return user;
  }
}
