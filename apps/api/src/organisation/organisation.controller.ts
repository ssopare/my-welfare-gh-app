import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateOrganisationSettingsDto } from './dto/update-organisation-settings.dto';
import { OrganisationService } from './organisation.service';

@Controller('organisation')
@UseGuards(JwtAuthGuard)
export class OrganisationController {
  constructor(private readonly organisation: OrganisationService) {}

  @Get()
  getOwn(@CurrentUser() user: AuthTokenPayload) {
    return this.organisation.getOwn(user);
  }

  @Patch()
  updateSettings(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: UpdateOrganisationSettingsDto,
  ) {
    return this.organisation.updateSettings(user, dto);
  }
}
