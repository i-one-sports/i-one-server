import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository, Location, Team, Tournament, TournamentStatus } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';

export type LiveTournament = { _id: Types.ObjectId; name: string; location: Types.ObjectId };
const LIVE = { $in: [TournamentStatus.REGISTRATION, TournamentStatus.STARTED] };

@Injectable()
export class TournamentRepository extends AbstractRepository<Tournament> {
  protected readonly logger = new Logger(Tournament.name);

  constructor(@InjectModel(Tournament.name) TournamentModel: Model<Tournament>) {
    super(TournamentModel);
  }

  // Tournaments still taking registrations or being played.
  private findLive(filter: FilterQuery<Tournament>): Promise<LiveTournament | null> {
    return this.model
      .findOne({ ...filter, status: LIVE })
      .select('name location')
      .lean<LiveTournament>()
      .exec();
  }

  findLiveForTeams(teamIds: Types.ObjectId[]) {
    return teamIds.length ? this.findLive({ registeredTeams: { $in: teamIds } }) : Promise.resolve(null);
  }

  findLiveOrganisedBy(userId: Types.ObjectId) {
    return this.findLive({ organizer: userId });
  }

  findLiveAtLocations(locationIds: Types.ObjectId[]) {
    return locationIds.length ? this.findLive({ location: { $in: locationIds } }) : Promise.resolve(null);
  }
}
