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
import { VotesController } from './votes.controller';
import { VotesService } from './votes.service';

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
  ],
  controllers: [VotesController],
  providers: [VotesService],
  exports: [VotesService],
})
export class VotesModule {}
