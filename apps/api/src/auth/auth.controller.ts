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
import { CreateAdditionalOrganisationDto } from './dto/create-additional-organisation.dto';
import { JoinOrganisationDto } from './dto/join-organisation.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterOrganisationDto } from './dto/register-organisation.dto';
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
