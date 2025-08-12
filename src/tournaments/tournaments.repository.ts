import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository, Location, Team, Tournament } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class TournamentRepository extends AbstractRepository<Tournament> {
  protected readonly logger = new Logger(Tournament.name);

  constructor(@InjectModel(Tournament.name) TournamentModel: Model<Tournament>) {
    super(TournamentModel);
  }
}
