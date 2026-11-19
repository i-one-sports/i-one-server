import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository, User } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class UserRepository extends AbstractRepository<User> {
  protected readonly logger = new Logger(UserRepository.name);

  constructor(@InjectModel(User.name) UserModel: Model<User>) {
    super(UserModel);
  }

  // Only the fields safe to show other players.
  async publicProfiles(ids: any[]) {
    return this.findRaw().find({ _id: { $in: ids } }).select('firstName lastName nickname avatar position').lean();
  }

  async positionsOf(ids: any[]): Promise<Map<string, string>> {
    const users = await this.findRaw().find({ _id: { $in: ids } }).select('position').lean();
    return new Map(users.map((u: any) => [u._id.toString(), u.position]));
  }
}
