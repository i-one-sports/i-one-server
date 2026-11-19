import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Location,
  LocationSchema,
  Match,
  MatchSchema,
  Session,
  SessionReferee,
  SessionRefereeSchema,
  SessionSchema,
  User,
  UserSchema,
} from '@app/common';
import { RefereesController } from './referees.controller';
import { RefereesService } from './referees.service';
import { SessionRefereeRepository } from './referees.repository';
import { SessionRepository } from 'src/sessions/sessions.repository';
import { LocationRepository } from 'src/locations/locations.repository';
import { UserRepository } from 'src/users/users.repository';
import { MatchRepository } from 'src/matches/matches.repository';
import { CaptainsModule } from 'src/captains/captains.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SessionReferee.name, schema: SessionRefereeSchema },
      { name: Session.name, schema: SessionSchema },
      { name: Location.name, schema: LocationSchema },
      { name: User.name, schema: UserSchema },
      { name: Match.name, schema: MatchSchema },
    ]),
    CaptainsModule,
    NotificationsModule,
  ],
  controllers: [RefereesController],
  providers: [
    RefereesService,
    SessionRefereeRepository,
    SessionRepository,
    LocationRepository,
    UserRepository,
    MatchRepository,
  ],
  exports: [RefereesService],
})
export class RefereesModule {}
