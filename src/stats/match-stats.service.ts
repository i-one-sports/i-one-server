import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  MATCH_OUTCOME,
  MATCH_RESULT_STATUS,
  MATCH_STATUS,
  Match,
  PlayerMatchStat,
  Set,
  lagosParts,
} from '@app/common';

// Results that feed stats. PENDING_CONFIRMATION (Referee mode on a captain's
// phone) counts straight away; a dispute voids it.
export const COUNTING_RESULTS = [MATCH_RESULT_STATUS.CONFIRMED, MATCH_RESULT_STATUS.PENDING_CONFIRMATION];

const REPAIR_GRACE_MS = 60 * 1000;
const REPAIR_BATCH = 50;

type Side = 'teamOne' | 'teamTwo';

// Writes per-player match records from officiated results. Like the money
// ledger: rows are written once and never edited, totals are summed from
// them, and a thrown-out result marks its rows void instead of subtracting.
@Injectable()
export class MatchStatsService {
  private readonly logger = new Logger(MatchStatsService.name);

  constructor(
    @InjectModel(PlayerMatchStat.name) private readonly statModel: Model<PlayerMatchStat>,
    @InjectModel(Match.name) private readonly matchModel: Model<Match>,
    @InjectModel(Set.name) private readonly setModel: Model<Set>,
  ) {}

  // Safe to call any number of times, from any server: rows are inserted
  // only if missing (unique {match, user}) and existing rows are never
  // touched — so a re-post can't undo a dispute's void.
  async postMatchStats(matchId: string | Types.ObjectId): Promise<number> {
    const match: any = await this.matchModel.findById(matchId).lean();
    if (!match || match.status !== MATCH_STATUS.FINISHED || !COUNTING_RESULTS.includes(match.resultStatus)) {
      return 0;
    }

    const rows = await this.buildRows(match);
    if (rows.length) {
      await this.statModel.bulkWrite(
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
    await this.matchModel.updateOne({ _id: match._id }, { $set: { statsPostedAt: new Date() } });

    // A dispute may have landed while we were writing; it voids existing
    // rows, so re-check now that ours exist.
    const now: any = await this.matchModel.findById(match._id).select('resultStatus').lean();
    if (!COUNTING_RESULTS.includes(now?.resultStatus)) await this.voidMatchStats(match._id);

    return rows.length;
  }

  async voidMatchStats(matchId: string | Types.ObjectId): Promise<void> {
    await this.statModel.updateMany({ match: new Types.ObjectId(matchId.toString()) }, { $set: { void: true } });
  }

  // Every minute: close review windows that have run out, and write any
  // stats a crash or failed request left unposted.
  @Cron(CronExpression.EVERY_MINUTE, { name: 'match-stats' })
  async runMaintenance(now = new Date()) {
    const closed = await this.matchModel.updateMany(
      { resultStatus: MATCH_RESULT_STATUS.PENDING_CONFIRMATION, reviewUntil: { $lte: now } },
      { $set: { resultStatus: MATCH_RESULT_STATUS.CONFIRMED } },
    );

    const unposted = await this.matchModel
      .find({
        status: MATCH_STATUS.FINISHED,
        resultStatus: { $in: COUNTING_RESULTS },
        statsPostedAt: { $exists: false },
        endedAt: { $lte: new Date(now.getTime() - REPAIR_GRACE_MS) },
      })
      .select('_id')
      .limit(REPAIR_BATCH)
      .lean();

    let repaired = 0;
    for (const { _id } of unposted) {
      try {
        await this.postMatchStats(_id);
        repaired++;
      } catch (err: any) {
        this.logger.error(`Failed to post stats for match ${_id}: ${err.message}`);
      }
    }
    if (closed.modifiedCount || repaired) {
      this.logger.log(`Review windows closed: ${closed.modifiedCount}, stats repaired: ${repaired}`);
    }
    return { reviewsClosed: closed.modifiedCount, statsRepaired: repaired };
  }

  // One row per player on either team. Goals and assists come from
  // goalScorers (undone goals were already pulled from it); shootout goals
  // never reach goalScorers, so they never count.
  async buildRows(match: any): Promise<Array<Partial<PlayerMatchStat>>> {
    const sets: any[] = await this.setModel
      .find({ _id: { $in: [match.teamOne, match.teamTwo] } })
      .select('players')
      .lean();
    const playersOf = (teamId: any): string[] =>
      (sets.find((s) => s._id.toString() === teamId.toString())?.players ?? []).map((p: any) => p.toString());

    const goals = new Map<string, number>();
    const assists = new Map<string, number>();
    for (const g of match.goalScorers ?? []) {
      goals.set(g.player.toString(), (goals.get(g.player.toString()) ?? 0) + 1);
      if (g.assistedBy) assists.set(g.assistedBy.toString(), (assists.get(g.assistedBy.toString()) ?? 0) + 1);
    }

    const season = lagosParts(new Date(match.endedAt)).year;
    const outcome = (teamId: any): MATCH_OUTCOME => {
      if (!match.winner) return MATCH_OUTCOME.DRAWN;
      return match.winner.toString() === teamId.toString() ? MATCH_OUTCOME.WON : MATCH_OUTCOME.LOST;
    };

    const rows: Array<Partial<PlayerMatchStat>> = [];
    for (const side of ['teamOne', 'teamTwo'] as Side[]) {
      const teamId = match[side];
      const conceded = side === 'teamOne' ? match.teamTwoScore : match.teamOneScore;
      // A player listed on both teams (shouldn't happen) is counted once, on teamOne.
      for (const user of playersOf(teamId)) {
        if (rows.some((r) => r.user.toString() === user)) continue;
        rows.push({
          user: new Types.ObjectId(user),
          match: match._id,
          session: match.session,
          team: teamId,
          side,
          season,
          goals: goals.get(user) ?? 0,
          assists: assists.get(user) ?? 0,
          conceded: conceded ?? 0,
          result: outcome(teamId),
          playedAt: match.endedAt,
          void: false,
        });
      }
    }
    return rows;
  }

  // Totals for a profile, summed from non-void rows. Clean sheets need a
  // goalkeeper, and positions (GK) don't exist yet — null means "not
  // tracked yet", not zero.
  async totals(userId: string, season?: number) {
    const [row] = await this.statModel.aggregate([
      {
        $match: {
          user: new Types.ObjectId(userId),
          void: false,
          ...(season !== undefined && { season }),
        },
      },
      {
        $group: {
          _id: null,
          totalMatches: { $sum: 1 },
          goals: { $sum: '$goals' },
          assists: { $sum: '$assists' },
          wins: { $sum: { $cond: [{ $eq: ['$result', MATCH_OUTCOME.WON] }, 1, 0] } },
          draws: { $sum: { $cond: [{ $eq: ['$result', MATCH_OUTCOME.DRAWN] }, 1, 0] } },
          losses: { $sum: { $cond: [{ $eq: ['$result', MATCH_OUTCOME.LOST] }, 1, 0] } },
        },
      },
    ]);

    return {
      userId,
      season: season ?? null,
      totalMatches: row?.totalMatches ?? 0,
      goals: row?.goals ?? 0,
      assists: row?.assists ?? 0,
      wins: row?.wins ?? 0,
      draws: row?.draws ?? 0,
      losses: row?.losses ?? 0,
      cleanSheets: null,
    };
  }
}
