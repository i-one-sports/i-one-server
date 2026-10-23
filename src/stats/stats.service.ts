import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { StatsRepository } from './stats.repository';
import { StatsDto } from './dto/stats.dto';
import { MatchStatsService } from './match-stats.service';
import { VotesService } from 'src/votes/votes.service';
import { Types } from 'mongoose';
import { CustomHttpException } from '@app/common';

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(
    private readonly statsRepository: StatsRepository,
    private readonly matchStats: MatchStatsService,
    private readonly votes: VotesService,
  ) {}

  // Summed from officiated match records. The stored Stat counters are no
  // longer read: they were never written by matches, and may hold values
  // from the old self-edit endpoint.
  public async userStats(userId: string, season?: number) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new CustomHttpException('Invalid user id', HttpStatus.BAD_REQUEST);
    }
    const [totals, playerOfSessionAwards] = await Promise.all([
      this.matchStats.totals(userId, season),
      this.votes.awardsFor(userId, season),
    ]);
    return { ...totals, playerOfSessionAwards };
  }

  public async initializeStat(userId: string) {
    this.logger.log(`Initializing stats for user: ${userId}`);
    try {
      const startDate: number = new Date().getFullYear();
      const endDate: number = startDate + 1;
      const dateData = {
        seasonStart: startDate,
        seasonEnd: endDate,
      };

      const stats = await this.statsRepository.create({
        userId,
        ...dateData,
      });

      this.logger.log(`Stats initialized successfully for user: ${userId}`);
      return stats;
    } catch (error: any) {
      this.logger.error(`Failed to initialize stats for user ${userId}: ${error.message}`);
      throw new CustomHttpException(
        `cannot initialise user stats ${JSON.stringify(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  public async createStat(stats: StatsDto) {
    try {
      return this.statsRepository.create(stats);
    } catch (error) {
      throw new CustomHttpException(
        `cannot create user stats ${JSON.stringify(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
