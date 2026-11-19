import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AbstractRepository, BADGE, UserBadge } from '@app/common';

@Injectable()
export class UserBadgeRepository extends AbstractRepository<UserBadge> {
  protected readonly logger = new Logger(UserBadgeRepository.name);

  constructor(@InjectModel(UserBadge.name) UserBadgeModel: Model<UserBadge>) {
    super(UserBadgeModel);
  }

  async has(user: Types.ObjectId, badge: BADGE): Promise<boolean> {
    return !!(await this.findRaw().exists({ user, badge }));
  }

  // Newest first. `onlyShared` for someone else's profile (no private details).
  async listFor(user: Types.ObjectId, onlyShared = false) {
    const query = this.findRaw().find({ user, ...(onlyShared && { shared: true }) });
    if (onlyShared) query.select('-sessions -seenAt');
    return query.sort({ unlockedAt: -1 }).lean();
  }
}
