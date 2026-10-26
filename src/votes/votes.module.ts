import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Match,
  MatchSchema,
  PlayerMatchStat,
  PlayerMatchStatSchema,
  Session,
  SessionPoll,
  SessionPollSchema,
  SessionSchema,
  SessionVote,
  SessionVoteSchema,
  Set,
  SetSchema,
  User,
  UserSchema,
} from '@app/common';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { BadgesModule } from 'src/badges/badges.module';
import { VotesController } from './votes.controller';
import { VotesService } from './votes.service';
import { SessionPollRepository } from './session-poll.repository';
import { SessionVoteRepository } from './session-vote.repository';
import { SessionRepository } from 'src/sessions/sessions.repository';
import { MatchRepository } from 'src/matches/matches.repository';
import { SetRepository } from 'src/sets/sets.repository';
import { UserRepository } from 'src/users/users.repository';
import { PlayerMatchStatRepository } from 'src/stats/player-match-stat.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SessionPoll.name, schema: SessionPollSchema },
      { name: SessionVote.name, schema: SessionVoteSchema },
      { name: Session.name, schema: SessionSchema },
      { name: Match.name, schema: MatchSchema },
      { name: Set.name, schema: SetSchema },
      { name: PlayerMatchStat.name, schema: PlayerMatchStatSchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
    BadgesModule,
  ],
  controllers: [VotesController],
  providers: [
    VotesService,
    SessionPollRepository,
    SessionVoteRepository,
    SessionRepository,
    MatchRepository,
    SetRepository,
    UserRepository,
    PlayerMatchStatRepository,
  ],
  exports: [VotesService],
})
export class VotesModule {}
