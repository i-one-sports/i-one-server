import { Team, TeamSchema, Tournament, TournamentSchema, User, UserSchema } from '@app/common';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TeamRepository } from './teams.repository';
import { UserRepository } from 'src/users/users.repository';
import { TeamsService } from './teams.service';
import { TournamentsService } from './tournaments.service';
import { TournamentRepository } from './tournaments.repository';

@Module({
    imports: [
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: Tournament.name, schema: TournamentSchema },
          { name: Team.name, schema: TeamSchema },
        ]),
      ],
      controllers: [],
      providers: [
        TeamRepository,
        UserRepository,
        TournamentRepository,
        TeamsService,
        TournamentsService
      ],
      exports: [TeamsService, TournamentsService],
})
export class TournamentsModule {}
