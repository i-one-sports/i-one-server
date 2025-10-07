import {
  Location,
  LocationSchema,
  Match,
  MatchSchema,
  Session,
  SessionSchema,
  User,
  UserSchema,
} from '@app/common';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { UserRepository } from 'src/users/users.repository';
import { LocationRepository } from 'src/locations/locations.repository';
import { MatchRepository } from 'src/matches/matches.repository';
import { SessionRepository } from './sessions.repository';
import { CaptainsModule } from 'src/captains/captains.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Session.name, schema: SessionSchema },
      { name: User.name, schema: UserSchema },
      { name: Location.name, schema: LocationSchema },
      { name: Match.name, schema: MatchSchema },
    ]),
    CaptainsModule, // Import the entire CaptainsModule
  ],
  controllers: [SessionsController],
  providers: [
    SessionsService,
    SessionRepository,
    UserRepository,
    LocationRepository,
    MatchRepository,
  ],
  exports: [SessionsService],
})
export class SessionsModule {}
