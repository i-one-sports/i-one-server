import { Location, LocationSchema, User, UserSchema } from '@app/common';
import { Session, SessionSchema } from '@app/common/schemas/session.schema';
import { Match, MatchSchema } from '@app/common/schemas/match.schema';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { LocationRepository } from './locations.repository';
import { UserRepository } from 'src/users/users.repository';
import { SessionRepository } from 'src/sessions/sessions.repository';
import { MatchRepository } from 'src/matches/matches.repository';
import { AwsService } from '@app/common/providers/aws.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Location.name, schema: LocationSchema },
      { name: User.name, schema: UserSchema },
      { name: Session.name, schema: SessionSchema },
      { name: Match.name, schema: MatchSchema },
    ]),
  ],
  controllers: [LocationsController],
  providers: [
    LocationsService,
    LocationRepository,
    UserRepository,
    SessionRepository,
    MatchRepository,
    AwsService
  ],
  exports: [LocationsService],
})
export class LocationsModule {}
