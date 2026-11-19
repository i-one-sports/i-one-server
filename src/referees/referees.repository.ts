import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository, SessionReferee } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class SessionRefereeRepository extends AbstractRepository<SessionReferee> {
  protected readonly logger = new Logger(SessionRefereeRepository.name);

  constructor(@InjectModel(SessionReferee.name) SessionRefereeModel: Model<SessionReferee>) {
    super(SessionRefereeModel);
  }
}
