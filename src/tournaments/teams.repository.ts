import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository, Location, Team } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class TeamRepository extends AbstractRepository<Team> {
  protected readonly logger = new Logger(Team.name);

  constructor(@InjectModel(Team.name) TeamModel: Model<Team>) {
    super(TeamModel);
  }
}
