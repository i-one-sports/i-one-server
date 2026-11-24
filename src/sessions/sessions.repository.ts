import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository, SESSION_CANCEL_REASON, SESSION_PAYMENT_MODE, SESSION_STATUS, Session } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

// "Is there still a spot for `userId`?" — members plus other players'
// unexpired pass holds (buy-to-join) must stay below maxNumber. Used inside
// atomic updates so two players can never both take the last spot.
export const roomForExpr = (userId: Types.ObjectId, now: Date) => ({
  $lt: [
    {
      $add: [
        { $size: { $ifNull: ['$members', []] } },
        {
          $size: {
            $filter: {
              input: { $ifNull: ['$passHolds', []] },
              as: 'hold',
              cond: { $and: [{ $gt: ['$$hold.expiresAt', now] }, { $ne: ['$$hold.userId', userId] }] },
            },
          },
        },
      ],
    },
    '$maxNumber',
  ],
});

// Not cancelled, refunded or completed. Sessions saved before `status` existed
// have none, which counts as open.
const STILL_OPEN = { status: { $nin: [SESSION_STATUS.CANCELLED, SESSION_STATUS.REFUNDED, SESSION_STATUS.COMPLETED] } };

// A paid session that isn't ready to play: never filled (payment never
// opened) or filled but not fully paid.
const PAID_NOT_READY = { paymentRequired: true, paymentStatus: { $ne: 'COMPLETED' } };

export type LifecycleSession = Pick<Session, 'members' | 'startTime' | 'paymentMode'> & {
  _id: Types.ObjectId;
  location: Types.ObjectId;
};

@Injectable()
export class SessionRepository extends AbstractRepository<Session> {
  protected readonly logger = new Logger(SessionRepository.name);

  constructor(@InjectModel(Session.name) SessionModel: Model<Session>) {
    super(SessionModel);
  }

  // Holds a spot in an open pass session for a player who is buying a pass,
  // if there's still room. Returns false when the session is full / closed.
  async placePassHold(sessionId: Types.ObjectId, userId: Types.ObjectId, passId: Types.ObjectId, expiresAt: Date): Promise<boolean> {
    const now = new Date();
    await this.model.updateOne({ _id: sessionId }, { $pull: { passHolds: { userId } } }); // replace any older hold of theirs
    const held = await this.model.findOneAndUpdate(
      {
        _id: sessionId,
        requiresPass: true,
        status: SESSION_STATUS.OPEN,
        finished: { $ne: true },
        isFull: { $ne: true },
        members: { $ne: userId },
        $expr: roomForExpr(userId, now),
      },
      { $push: { passHolds: { userId, passId, expiresAt } } },
      { new: true },
    );
    return held !== null;
  }

  // The pitch stopped being monthly: its unplayed pass sessions stop needing
  // passes. Going free they're simply free; going hourly they become pool
  // sessions billed at the new hourly price (pricePerHour × hours). Returns
  // how many were changed.
  async releasePassSessions(locationId: Types.ObjectId, now: Date, hourly?: { pricePerHour: number }): Promise<number> {
    const filter = {
      location: locationId,
      requiresPass: true,
      status: SESSION_STATUS.OPEN,
      finished: { $ne: true },
      startTime: { $gt: now },
    };
    const result = hourly
      ? await this.model.updateMany(filter, [
          {
            $set: {
              requiresPass: false,
              pricingOption: 'hourly',
              passHolds: [],
              paymentRequired: true,
              paymentMode: SESSION_PAYMENT_MODE.POOL,
              paymentAmount: 0,
              paymentTarget: { $multiply: [hourly.pricePerHour, { $max: [1, { $ceil: { $divide: ['$timeDuration', 60] } }] }] },
              amountPaid: 0,
              amountReserved: 0,
              paymentStatus: 'NOT_INITIATED',
              allPaymentsCompleted: false,
            },
          },
        ])
      : await this.model.updateMany(filter, { $set: { requiresPass: false, passHolds: [] } });
    return result.modifiedCount;
  }

  async releasePassHold(sessionId: Types.ObjectId, passId: Types.ObjectId): Promise<void> {
    await this.model.updateOne({ _id: sessionId }, { $pull: { passHolds: { passId } } });
  }

  // ─── Session lifecycle (SessionLifecycleService) ─────────────────────────

  // Paid, not ready, kick-off in (after, upTo]. Not started (a match in
  // progress means it was ready).
  async findPaidNotReady(after: Date | null, upTo: Date, limit: number): Promise<LifecycleSession[]> {
    return this.model
      .find({
        ...STILL_OPEN,
        ...PAID_NOT_READY,
        finished: { $ne: true },
        inProgress: { $ne: true },
        startTime: { ...(after && { $gt: after }), $lte: upTo },
      })
      .select('_id location members startTime paymentMode')
      .sort({ startTime: 1 })
      .limit(limit)
      .lean<LifecycleSession[]>();
  }

  // Ended at or before `cutoff` but never closed (nobody tapped End). Paid
  // sessions that never got paid are left to the auto-cancel sweep.
  async findOverdueForCloseOut(cutoff: Date, limit: number): Promise<Array<{ _id: Types.ObjectId }>> {
    return this.model
      .find({ ...STILL_OPEN, finished: { $ne: true }, stopTime: { $lte: cutoff }, $nor: [PAID_NOT_READY] })
      .select('_id')
      .sort({ stopTime: 1 })
      .limit(limit)
      .lean<Array<{ _id: Types.ObjectId }>>();
  }

  // Started (POST /sessions/start) but never given a date, created at or
  // before `cutoff`.
  async findStaleDrafts(cutoff: Date, limit: number): Promise<Array<{ _id: Types.ObjectId }>> {
    return this.model
      .find({ ...STILL_OPEN, startTime: null, createdAt: { $lte: cutoff } })
      .select('_id')
      .limit(limit)
      .lean<Array<{ _id: Types.ObjectId }>>();
  }

  // Open → CANCELLED, only if still open (and still matching `extra`), so a
  // manual action, a payment landing, or another server can't double-act.
  // Returns the session as it was cancelled, or null if someone got there first.
  async cancelIfOpen(id: Types.ObjectId, reason: SESSION_CANCEL_REASON | null, extra: Record<string, unknown> = {}): Promise<Session | null> {
    return this.model
      .findOneAndUpdate(
        { _id: id, ...STILL_OPEN, ...extra },
        { $set: { status: SESSION_STATUS.CANCELLED, ...(reason && { cancelReason: reason }) } },
        { new: true },
      )
      .lean<Session>();
  }

  // Bulk versions for the lifecycle job: one write for many sessions, each
  // still only changed while open (and matching `extra`). Returns how many.
  async markEndedManyIfOpen(ids: Types.ObjectId[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.model.updateMany(
      { _id: { $in: ids }, ...STILL_OPEN },
      { $set: { captain: null, inProgress: false, finished: true, status: SESSION_STATUS.COMPLETED } },
    );
    return result.modifiedCount;
  }

  async cancelManyIfOpen(ids: Types.ObjectId[], reason: SESSION_CANCEL_REASON, extra: Record<string, unknown> = {}): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.model.updateMany(
      { _id: { $in: ids }, ...STILL_OPEN, ...extra },
      { $set: { status: SESSION_STATUS.CANCELLED, cancelReason: reason } },
    );
    return result.modifiedCount;
  }

  // Is this paid session still open and not ready? (Used to drop a queued
  // "will be cancelled" push that no longer applies.)
  async isPaidNotReady(id: Types.ObjectId): Promise<boolean> {
    return (await this.model.exists({ _id: id, ...STILL_OPEN, ...PAID_NOT_READY })) !== null;
  }

  // Marks a session played and over (what the End button does), only if it
  // isn't closed already. Returns null if it was.
  async markEndedIfOpen(id: Types.ObjectId): Promise<Session | null> {
    return this.model
      .findOneAndUpdate(
        { _id: id, ...STILL_OPEN },
        { $set: { captain: null, inProgress: false, finished: true, status: SESSION_STATUS.COMPLETED } },
        { new: true },
      )
      .lean<Session>();
  }

  // The player's current or next session: open, not over, earliest first.
  // A draft they started counts too (drafts list the starter only as
  // captain, not in members, until it's configured).
  async findCurrentForUser(userId: Types.ObjectId, now: Date): Promise<{ _id: Types.ObjectId } | null> {
    return this.model
      .findOne({
        ...STILL_OPEN,
        finished: { $ne: true },
        $or: [
          { members: userId, stopTime: { $gt: now } },
          { captain: userId, startTime: null },
        ],
      })
      .sort({ startTime: 1 })
      .select('_id')
      .lean<{ _id: Types.ObjectId }>();
  }

  // A session at one of these pitches that is booked and not over yet
  // (upcoming or being played).
  async findActiveAtLocations(locationIds: Types.ObjectId[], now: Date): Promise<{ location: Types.ObjectId } | null> {
    if (!locationIds.length) return null;
    return this.model
      .findOne({
        location: { $in: locationIds },
        stopTime: { $gt: now },
        finished: { $ne: true },
        status: { $nin: [SESSION_STATUS.CANCELLED, SESSION_STATUS.REFUNDED, SESSION_STATUS.COMPLETED] },
      })
      .select('location')
      .lean<{ location: Types.ObjectId }>()
      .exec();
  }

  // Sessions that are over — ended by the captain/owner, or past stopTime —
  // within the lookback, excluding cancelled/refunded ones.
  async findEndedSince(now: Date, lookbackMs: number): Promise<Array<{ _id: Types.ObjectId }>> {
    return this.findRaw()
      .find({
        status: { $nin: [SESSION_STATUS.CANCELLED, SESSION_STATUS.REFUNDED] },
        stopTime: { $gte: new Date(now.getTime() - lookbackMs) },
        $or: [{ status: SESSION_STATUS.COMPLETED }, { finished: true }, { stopTime: { $lte: now } }],
      })
      .select('_id')
      .lean();
  }

  async findMatchesByLocation(locationId: string, skip = 0, limit = 5): Promise<any[]> {
    const ObjectId = Types.ObjectId;
    return this.findRaw()
      .aggregate([
        { $match: { location: new ObjectId(locationId) } },
        {
          $lookup: {
            from: 'matches',
            let: { sessionId: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$session', '$$sessionId'] } } },
              { $lookup: { from: 'sets', localField: 'teamOne', foreignField: '_id', as: 'teamOne' } },
              { $unwind: { path: '$teamOne', preserveNullAndEmptyArrays: true } },
              { $lookup: { from: 'sets', localField: 'teamTwo', foreignField: '_id', as: 'teamTwo' } },
              { $unwind: { path: '$teamTwo', preserveNullAndEmptyArrays: true } },
              {
                $project: {
                  _id: 1,
                  teamOne: 1,
                  teamTwo: 1,
                  teamOneScore: 1,
                  teamTwoScore: 1,
                  isStarted: 1,
                  status: 1,
                  sequence: 1,
                  winner: 1,
                  session: 1,
                  createdAt: 1,
                },
              },
            ],
            as: 'matches',
          },
        },
        { $unwind: { path: '$matches', preserveNullAndEmptyArrays: false } },
        { $replaceRoot: { newRoot: '$matches' } },
        { $sort: { createdAt: -1 } },
        { $skip: Number(skip) },
        { $limit: Number(limit) },
      ])
      .exec();
  }

  async findVisitorCountByLocation(locationId: string): Promise<number> {
    const ObjectId = Types.ObjectId;
    const result = await this.findRaw()
      .aggregate([
        { $match: { location: new ObjectId(locationId) } },
        { $project: { members: 1, captain: 1 } },
        { $project: { users: { $concatArrays: ['$members', [{ $ifNull: ['$captain', null] }]] } } },
        { $unwind: '$users' },
        { $group: { _id: '$users' } },
        { $count: 'uniqueVisitors' },
      ])
      .exec();

    if (!result || result.length === 0) return 0;
    return result[0].uniqueVisitors || 0;
  }

  async findUpcomingSessionsByLocation(locationId: string, limit = 20, skip = 0): Promise<any[]> {
    const ObjectId = Types.ObjectId;
    return this.findRaw()
      .aggregate([
        { $match: { location: new ObjectId(locationId), startTime: { $gt: new Date() } } },
        { $sort: { startTime: 1 } },
        { $skip: Number(skip) },
        { $limit: Number(limit) },
        { $project: { _id: 1, startTime: 1, timeDuration: 1, maxNumber: 1, members: 1, captain: 1, createdAt: 1 } },
      ])
      .exec();
  }

  async getUsersChartByLocation(locationId: string): Promise<{ month: number; year: number; count: number }[]> {
    const ObjectId = Types.ObjectId;
    return this.findRaw()
      .aggregate([
        { $match: { location: new ObjectId(locationId) } },
        {
          $project: {
            users: { $concatArrays: ['$members', [{ $ifNull: ['$captain', null] }]] },
            month: { $month: '$startTime' },
            year: { $year: '$startTime' },
          },
        },
        { $unwind: '$users' },
        { $match: { users: { $ne: null } } },
        {
          $group: {
            _id: { month: '$month', year: '$year', user: '$users' },
          },
        },
        {
          $group: {
            _id: { month: '$_id.month', year: '$_id.year' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
        { $project: { _id: 0, month: '$_id.month', year: '$_id.year', count: 1 } },
      ])
      .exec();
  }

}
