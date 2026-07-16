import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { CurrentUser, RolesGuard, Roles, User, USER_ROLE } from '@app/common';
import { SettingsService } from './settings.service';
import { UpdateCommissionDto } from './dto/settings.dto';

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Roles(USER_ROLE.SUPER_ADMIN)
  @Get('commission')
  async getCommission() {
    const settings = await this.settingsService.getSettings();
    return {
      commissionPercentage: settings.commissionPercentage,
      commissionUpdatedBy: settings.commissionUpdatedBy,
      commissionUpdatedAt: settings.commissionUpdatedAt,
    };
  }

  @Roles(USER_ROLE.SUPER_ADMIN)
  @Patch('commission')
  async updateCommission(
    @Body() data: UpdateCommissionDto,
    @CurrentUser() user: User,
  ) {
    return this.settingsService.setCommissionPercentage(data.percentage, user._id.toString());
  }
}
