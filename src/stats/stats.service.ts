import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { StatsRepository } from './stats.repository';
import { StatsDto, statsQueryDto, updateStatsDto } from './dto/stats.dto';
import { CustomHttpException } from '@app/common';

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(private readonly statsRepository: StatsRepository) {}

  public async overallUserStats(userId: string) {
    try {
      return this.statsRepository.findOne({ userId });
    } catch (error) {
      throw new CustomHttpException(
        `cannot get user stats ${JSON.stringify(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }


public async getUserStatsBySeason(userId: string,query: statsQueryDto){
    try {
        return this.statsRepository.findOne({userId, ...query});
    } catch (error) {
        throw new CustomHttpException(
            `cannot get user stats ${JSON.stringify(error)}`,
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
    }
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

  public async updateStats(
    userId: string,
    query: statsQueryDto,
    updateData: updateStatsDto,
  ) {
    try {
      return this.statsRepository.findOneAndUpdate({userId, ...query}, {
        $inc: { [updateData.statsType]: updateData.value },
      });
    } catch (error) {
      throw new CustomHttpException(
        `cannot update user stats ${JSON.stringify(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
