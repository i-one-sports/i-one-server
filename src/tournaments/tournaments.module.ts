import { Team, TeamSchema, Tournament, TournamentSchema, User, UserSchema, Location, LocationSchema } from '@app/common';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TeamRepository } from './teams.repository';
import { UserRepository } from 'src/users/users.repository';
import { TeamsService } from './teams.service';
import { TournamentsService } from './tournaments.service';
import { TournamentRepository } from './tournaments.repository';
import { TournamentsController } from './tournaments.controller';
import { LocationRepository } from 'src/locations/locations.repository';
import { TournamentEventService } from './tournament-event.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Tournament.name, schema: TournamentSchema },
      { name: Team.name, schema: TeamSchema },
      { name: Location.name, schema: LocationSchema },
    ]),
  ],
  controllers: [TournamentsController],
  providers: [
    TeamRepository,
    UserRepository,
    LocationRepository,
    TournamentRepository,
    TeamsService,
    TournamentsService,
    TournamentEventService,
  ],
  exports: [TeamsService, TournamentsService],
})
export class TournamentsModule {}
