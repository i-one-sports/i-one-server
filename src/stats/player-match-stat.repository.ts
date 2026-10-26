import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AbstractRepository, MATCH_OUTCOME, PlayerMatchStat } from '@app/common';

@Injectable()
export class PlayerMatchStatRepository extends AbstractRepository<PlayerMatchStat> {
  protected readonly logger = new Logger(PlayerMatchStatRepository.name);

  constructor(@InjectModel(PlayerMatchStat.name) PlayerMatchStatModel: Model<PlayerMatchStat>) {
    super(PlayerMatchStatModel);
  }

  // Inserts rows that don't exist yet (unique {match, user}); existing rows
  // are never touched, so re-posting can't undo a void.
  async insertMissing(rows: Array<Partial<PlayerMatchStat>>): Promise<void> {
    if (!rows.length) return;
    await this.findRaw().bulkWrite(
      rows.map((row) => ({
        updateOne: {
          filter: { match: row.match, user: row.user },
          update: { $setOnInsert: { _id: new Types.ObjectId(), ...row } },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }

  async voidMatch(matchId: Types.ObjectId): Promise<void> {
    await this.updateMany({ match: matchId }, { $set: { void: true } });
  }

  // Profile totals from non-void rows, optionally one season.
  async totalsFor(user: Types.ObjectId, season?: number) {
    const [row] = await this.findRaw().aggregate([
      { $match: { user, void: false, ...(season !== undefined && { season }) } },
      {
        $group: {
          _id: null,
          totalMatches: { $sum: 1 },
          goals: { $sum: '$goals' },
          assists: { $sum: '$assists' },
          cleanSheets: { $sum: { $cond: [{ $eq: ['$cleanSheet', true] }, 1, 0] } },
          wins: { $sum: { $cond: [{ $eq: ['$result', MATCH_OUTCOME.WON] }, 1, 0] } },
          draws: { $sum: { $cond: [{ $eq: ['$result', MATCH_OUTCOME.DRAWN] }, 1, 0] } },
          losses: { $sum: { $cond: [{ $eq: ['$result', MATCH_OUTCOME.LOST] }, 1, 0] } },
        },
      },
    ]);
    return row;
  }

  // The player's most recent sessions (newest first), with their team in each.
  async recentSessions(user: Types.ObjectId, limit: number): Promise<Array<{ _id: Types.ObjectId; team: Types.ObjectId }>> {
    return this.findRaw().aggregate([
      { $match: { user, void: false } },
      { $group: { _id: '$session', lastPlayed: { $max: '$playedAt' }, team: { $first: '$team' } } },
      { $sort: { lastPlayed: -1 } },
      { $limit: limit },
    ]);
  }

  async forUserInSessions(user: Types.ObjectId, sessionIds: Types.ObjectId[]) {
    return this.findRaw().find({ user, void: false, session: { $in: sessionIds } }).lean();
  }

  // Games won per team per session. One row per player per match, so
  // distinct matches are counted.
  async teamWins(sessionIds: Types.ObjectId[]): Promise<Array<{ _id: { session: Types.ObjectId; team: Types.ObjectId }; wins: number }>> {
    return this.findRaw().aggregate([
      { $match: { session: { $in: sessionIds }, void: false, result: MATCH_OUTCOME.WON } },
      { $group: { _id: { session: '$session', team: '$team', match: '$match' } } },
      { $group: { _id: { session: '$_id.session', team: '$_id.team' }, wins: { $sum: 1 } } },
    ]);
  }

  // Each player's goals and assists within one session.
  async sessionTotals(session: Types.ObjectId): Promise<Array<{ _id: Types.ObjectId; goals: number; assists: number }>> {
    return this.findRaw().aggregate([
      { $match: { session, void: false } },
      { $group: { _id: '$user', goals: { $sum: '$goals' }, assists: { $sum: '$assists' } } },
    ]);
  }

  // Players with no goal and no assist in a session's counted matches.
  async blankPlayersInSession(session: Types.ObjectId): Promise<Types.ObjectId[]> {
    const rows = await this.findRaw().aggregate([
      { $match: { session, void: false } },
      { $group: { _id: '$user', contributions: { $sum: { $add: ['$goals', '$assists'] } } } },
      { $match: { contributions: 0 } },
    ]);
    return rows.map((r) => r._id);
  }

  // A player's counted matches, newest first, read in small batches so the
  // caller can stop early. Uses the {user, void, playedAt} index.
  historyNewestFirst(user: Types.ObjectId) {
    return this.findRaw()
      .find({ user, void: false })
      .sort({ playedAt: -1 })
      .select('session goals assists')
      .lean()
      .batchSize(25)
      .cursor();
  }
}
