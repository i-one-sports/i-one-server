import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository, User } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types, UpdateQuery } from 'mongoose';

@Injectable()
export class UserRepository extends AbstractRepository<User> {
  protected readonly logger = new Logger(UserRepository.name);

  constructor(@InjectModel(User.name) UserModel: Model<User>) {
    super(UserModel);
  }

  // Wipes a user's personal data (account deletion). Only applies to a user
  // who isn't deleted yet and isn't in a session — checked in the same write,
  // so a join that lands after the caller's checks makes this a no-op.
  async anonymise(userId: Types.ObjectId, update: UpdateQuery<User>, session: ClientSession): Promise<boolean> {
    const updated = await this.model.findOneAndUpdate(
      { _id: userId, deletedAt: null, currentSession: null },
      update,
      { new: true, session },
    );
    return updated !== null;
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
