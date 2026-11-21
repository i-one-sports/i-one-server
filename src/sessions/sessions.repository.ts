import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository, SESSION_STATUS, Session } from '@app/common';
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

  async releasePassHold(sessionId: Types.ObjectId, passId: Types.ObjectId): Promise<void> {
    await this.model.updateOne({ _id: sessionId }, { $pull: { passHolds: { passId } } });
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
