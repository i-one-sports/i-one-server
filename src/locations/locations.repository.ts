import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository, Location, LOCATION_STATUS } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class LocationRepository extends AbstractRepository<Location> {
  protected readonly logger = new Logger(LocationRepository.name);

  constructor(@InjectModel(Location.name) LocationModel: Model<Location>) {
    super(LocationModel);
  }

  // Anchored (`^`) regex against the indexed, pre-lowercased `nameLower`
  // field so Mongo can use the index directly instead of a full collection
  // scan — a case-insensitive regex on the raw `name` field couldn't do that.
  async searchByNamePrefix(nameLowerPrefix: string, limit: number) {
    return this.model
      .find(
        {
          nameLower: { $regex: `^${nameLowerPrefix}` },
          $or: [
            { status: LOCATION_STATUS.ACTIVE },
            { status: { $exists: false } },
          ],
        },
        {},
        { lean: true },
      )
      .limit(limit);
  }
}
