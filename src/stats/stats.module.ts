import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Match, MatchSchema, PlayerMatchStat, PlayerMatchStatSchema, Set, SetSchema } from '@app/common';
import { Stat, StatSchema } from '@app/common/schemas/stats.schema';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { StatsRepository } from './stats.repository';
import { MatchStatsService } from './match-stats.service';
import { VotesModule } from 'src/votes/votes.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Stat.name, schema: StatSchema },
      { name: PlayerMatchStat.name, schema: PlayerMatchStatSchema },
      { name: Match.name, schema: MatchSchema },
      { name: Set.name, schema: SetSchema },
    ]),
    VotesModule,
  ],
  controllers: [StatsController],
  providers: [StatsService, StatsRepository, MatchStatsService],
  exports: [StatsService, StatsRepository, MatchStatsService],
})
export class StatsModule {}
