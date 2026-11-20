import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository, Location, Team } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

@Injectable()
export class TeamRepository extends AbstractRepository<Team> {
  protected readonly logger = new Logger(Team.name);

  constructor(@InjectModel(Team.name) TeamModel: Model<Team>) {
    super(TeamModel);
  }

  async findIdsWithPlayer(userId: Types.ObjectId): Promise<Types.ObjectId[]> {
    const teams = await this.model.find({ players: userId }).select('_id').lean<Array<{ _id: Types.ObjectId }>>();
    return teams.map((team) => team._id);
  }
}
