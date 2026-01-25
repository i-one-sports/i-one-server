import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository, Location } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class LocationRepository extends AbstractRepository<Location> {
  protected readonly logger = new Logger(LocationRepository.name);

  constructor(@InjectModel(Location.name) LocationModel: Model<Location>) {
    super(LocationModel);
  }

  

}
