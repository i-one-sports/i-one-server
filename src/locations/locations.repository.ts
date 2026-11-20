import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository, Location, LOCATION_STATUS } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';

@Injectable()
export class LocationRepository extends AbstractRepository<Location> {
  protected readonly logger = new Logger(LocationRepository.name);

  constructor(@InjectModel(Location.name) LocationModel: Model<Location>) {
    super(LocationModel);
  }

  async findOwnedBy(ownerId: Types.ObjectId): Promise<Array<{ _id: Types.ObjectId; name: string }>> {
    return this.model.find({ owner: ownerId }).select('name').lean<Array<{ _id: Types.ObjectId; name: string }>>();
  }

  // Takes every pitch of this owner out of discovery (owner deleted their account).
  async unlistOwnedBy(ownerId: Types.ObjectId, session: ClientSession): Promise<void> {
    await this.model.updateMany({ owner: ownerId }, { $set: { status: LOCATION_STATUS.INACTIVE } }, { session });
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
