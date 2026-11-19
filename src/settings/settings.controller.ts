import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { CurrentUser, RolesGuard, Roles, User, USER_ROLE } from '@app/common';
import { SettingsService } from './settings.service';
import { UpdateCommissionDto, UpdateMinContributionDto, UpdateProcessingFeeDto } from './dto/settings.dto';

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

  @Roles(USER_ROLE.SUPER_ADMIN)
  @Get('min-contribution')
  async getMinContribution() {
    return { minContributionAmount: await this.settingsService.getMinContributionAmount() };
  }

  @Roles(USER_ROLE.SUPER_ADMIN)
  @Patch('min-contribution')
  async updateMinContribution(@Body() data: UpdateMinContributionDto) {
    return this.settingsService.setMinContributionAmount(data.amount);
  }

  @Roles(USER_ROLE.SUPER_ADMIN)
  @Get('processing-fee')
  async getProcessingFee() {
    return this.settingsService.getProcessingFeeConfig();
  }

  @Roles(USER_ROLE.SUPER_ADMIN)
  @Patch('processing-fee')
  async updateProcessingFee(@Body() data: UpdateProcessingFeeDto) {
    return this.settingsService.setProcessingFeeConfig(data);
  }
}
