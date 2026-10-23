import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
import { statsQueryDto } from './dto/stats.dto';
import { CurrentUser, User } from '@app/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';

// No PATCH /stats/update here on purpose — stats are never self-reported.
// They're summed from PlayerMatchStat rows, which are only written from
// officiated match results (see src/stats/match-stats.service.ts).
@Controller('stats')
@UseGuards(JwtAuthGuard)
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  // Declared before ':userId' — otherwise "season" is read as a user id.
  @Get('season')
  async getUserStatsBySeason(@CurrentUser() user: User, @Query() query: statsQueryDto) {
    return this.statsService.userStats(user._id.toString(), query.season);
  }

  // Public profile lookup — any authenticated user can view anyone's stats.
  @Get(':userId')
  async overallUserStats(@Param('userId') userId: string, @Query() query: statsQueryDto) {
    return this.statsService.userStats(userId, query.season);
  }
}
