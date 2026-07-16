import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
import { statsQueryDto } from './dto/stats.dto';
import { CurrentUser, User } from '@app/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';

// No PATCH /stats/update here on purpose — stats are never self-reported.
// They're only ever written by initializeStat (on signup) and, eventually,
// by match-end aggregation off owner/official-recorded goal-scorer data
// (see matches.service.ts — not wired up yet, tracked separately).
@Controller('stats')
@UseGuards(JwtAuthGuard)
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  // Public profile lookup — any authenticated user can view anyone's stats.
  @Get(':userId')
  async overallUserStats(@Param('userId') userId: string) {
    return this.statsService.overallUserStats(userId);
  }

  @Get('season')
  async getUserStatsBySeason(
    @CurrentUser() user: User,
    @Query() query: statsQueryDto,
  ) {
    return this.statsService.getUserStatsBySeason(user._id.toString(), query);
  }
}
