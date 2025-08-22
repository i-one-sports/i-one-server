import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
import { statsQueryDto, updateStatsDto } from './dto/stats.dto';
import { CurrentUser, User } from '@app/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';

@Controller('stats')
@UseGuards(JwtAuthGuard)
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get(':userId')
  async overallUserStats(@CurrentUser() user: User) {
    return this.statsService.overallUserStats(user._id.toString());
  }

  @Get('season')
  async getUserStatsBySeason(
    @CurrentUser() user: User,
    @Query() query: statsQueryDto,
  ) {
    return this.statsService.getUserStatsBySeason(user._id.toString(), query);
  }

  @Patch('update')
  async updateStats(
    @CurrentUser() user: User,
    @Query() query: statsQueryDto,
    @Body() updateData: updateStatsDto,
  ) {
    return this.statsService.updateStats(
      user._id.toString(),
      query,
      updateData,
    );
  }
}
