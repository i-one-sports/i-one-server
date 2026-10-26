import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AbstractRepository, SessionVote } from '@app/common';

@Injectable()
export class SessionVoteRepository extends AbstractRepository<SessionVote> {
  protected readonly logger = new Logger(SessionVoteRepository.name);

  constructor(@InjectModel(SessionVote.name) SessionVoteModel: Model<SessionVote>) {
    super(SessionVoteModel);
  }

  async countFor(poll: Types.ObjectId): Promise<number> {
    return this.findRaw().countDocuments({ poll });
  }

  async voteOf(poll: Types.ObjectId, voter: string) {
    return this.findRaw().findOne({ poll, voter }).select('candidate').lean();
  }

  // Votes per candidate, most first.
  async tally(poll: Types.ObjectId): Promise<Array<{ _id: Types.ObjectId; votes: number }>> {
    return this.findRaw().aggregate([
      { $match: { poll } },
      { $group: { _id: '$candidate', votes: { $sum: 1 } } },
      { $sort: { votes: -1, _id: 1 } },
    ]);
  }
}
