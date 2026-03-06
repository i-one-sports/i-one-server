import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository, Session } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

@Injectable()
export class SessionRepository extends AbstractRepository<Session> {
  protected readonly logger = new Logger(SessionRepository.name);

  constructor(@InjectModel(Session.name) SessionModel: Model<Session>) {
    super(SessionModel);
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
