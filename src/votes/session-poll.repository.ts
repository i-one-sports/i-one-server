import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AbstractRepository, SESSION_POLL_STATUS, SessionPoll } from '@app/common';

@Injectable()
export class SessionPollRepository extends AbstractRepository<SessionPoll> {
  protected readonly logger = new Logger(SessionPollRepository.name);

  constructor(@InjectModel(SessionPoll.name) SessionPollModel: Model<SessionPoll>) {
    super(SessionPollModel);
  }

  // Creates the session's poll unless one exists (unique {session}). True
  // only for the call that created it.
  async createIfMissing(session: Types.ObjectId, poll: Partial<SessionPoll>): Promise<boolean> {
    const res = await this.findRaw().updateOne(
      { session },
      { $setOnInsert: { _id: new Types.ObjectId(), session, ...poll } },
      { upsert: true },
    );
    return res.upsertedCount === 1;
  }

  async sessionsWithPoll(sessionIds: Types.ObjectId[]): Promise<globalThis.Set<string>> {
    const polls = await this.findRaw().find({ session: { $in: sessionIds } }).select('session').lean();
    return new globalThis.Set(polls.map((p) => p.session.toString()));
  }

  async dueToClose(before: Date) {
    return this.findRaw().find({ status: SESSION_POLL_STATUS.OPEN, closesAt: { $lte: before } }).lean();
  }

  // Closes an OPEN poll with its result. False if it was already closed.
  async close(pollId: Types.ObjectId, result: SessionPoll['result'], closedAt: Date): Promise<boolean> {
    const res = await this.findRaw().updateOne(
      { _id: pollId, status: SESSION_POLL_STATUS.OPEN },
      { $set: { status: SESSION_POLL_STATUS.CLOSED, result, closedAt } },
    );
    return res.modifiedCount === 1;
  }

  async pendingBadgeChecks(limit: number) {
    return this.findRaw().find({ badgesCheckedAt: { $exists: false } }).select('session').limit(limit).lean();
  }

  async markBadgesChecked(pollId: Types.ObjectId): Promise<void> {
    await this.findRaw().updateOne({ _id: pollId }, { $set: { badgesCheckedAt: new Date() } });
  }

  async countAwards(user: Types.ObjectId, season?: number): Promise<number> {
    return this.findRaw().countDocuments({ 'result.winners': user, ...(season !== undefined && { season }) });
  }

  // Closed polls in these sessions where at least one vote was cast.
  async closedWithVotes(sessionIds: Types.ObjectId[]) {
    return this.findRaw()
      .find({ session: { $in: sessionIds }, status: SESSION_POLL_STATUS.CLOSED, 'result.votesCast': { $gt: 0 } })
      .select('result')
      .lean();
  }
}
