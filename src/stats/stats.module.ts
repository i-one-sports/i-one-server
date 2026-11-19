import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Match, MatchSchema, PlayerMatchStat, PlayerMatchStatSchema, Set, SetSchema, User, UserSchema } from '@app/common';
import { Stat, StatSchema } from '@app/common/schemas/stats.schema';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { StatsRepository } from './stats.repository';
import { MatchStatsService } from './match-stats.service';
import { RatingService } from './rating.service';
import { PlayerMatchStatRepository } from './player-match-stat.repository';
import { MatchRepository } from 'src/matches/matches.repository';
import { SetRepository } from 'src/sets/sets.repository';
import { UserRepository } from 'src/users/users.repository';
import { VotesModule } from 'src/votes/votes.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Stat.name, schema: StatSchema },
      { name: PlayerMatchStat.name, schema: PlayerMatchStatSchema },
      { name: Match.name, schema: MatchSchema },
      { name: Set.name, schema: SetSchema },
      { name: User.name, schema: UserSchema },
    ]),
    VotesModule,
  ],
  controllers: [StatsController],
  providers: [
    StatsService,
    StatsRepository,
    MatchStatsService,
    RatingService,
    PlayerMatchStatRepository,
    MatchRepository,
    SetRepository,
    UserRepository,
  ],
  exports: [StatsService, StatsRepository, MatchStatsService],
})
export class StatsModule {}
