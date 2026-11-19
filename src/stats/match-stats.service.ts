import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Types } from 'mongoose';
import { MATCH_OUTCOME, MATCH_RESULT_STATUS, MATCH_STATUS, PLAYER_POSITION, PlayerMatchStat, lagosParts } from '@app/common';
import { PlayerMatchStatRepository } from './player-match-stat.repository';
import { MatchRepository } from 'src/matches/matches.repository';
import { SetRepository } from 'src/sets/sets.repository';
import { UserRepository } from 'src/users/users.repository';

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
    private readonly statRepository: PlayerMatchStatRepository,
    private readonly matchRepository: MatchRepository,
    private readonly setRepository: SetRepository,
    private readonly userRepository: UserRepository,
  ) {}

  // Safe to call any number of times, from any server: rows are inserted
  // only if missing (unique {match, user}) and existing rows are never
  // touched — so a re-post can't undo a dispute's void.
  async postMatchStats(matchId: string | Types.ObjectId): Promise<number> {
    const match: any = await this.matchRepository.findOne({ _id: matchId });
    if (!match || match.status !== MATCH_STATUS.FINISHED || !COUNTING_RESULTS.includes(match.resultStatus)) {
      return 0;
    }

    const rows = await this.buildRows(match);
    await this.statRepository.insertMissing(rows);
    await this.matchRepository.markStatsPosted(match._id);

    // A dispute may have landed while we were writing; it voids existing
    // rows, so re-check now that ours exist.
    const now: any = await this.matchRepository.findOne({ _id: match._id });
    if (!COUNTING_RESULTS.includes(now?.resultStatus)) await this.voidMatchStats(match._id);

    return rows.length;
  }

  async voidMatchStats(matchId: string | Types.ObjectId): Promise<void> {
    await this.statRepository.voidMatch(new Types.ObjectId(matchId.toString()));
  }

  // Every minute: close review windows that have run out, and write any
  // stats a crash or failed request left unposted.
  @Cron(CronExpression.EVERY_MINUTE, { name: 'match-stats' })
  async runMaintenance(now = new Date()) {
    const reviewsClosed = await this.matchRepository.confirmExpiredReviews(now);
    const unposted = await this.matchRepository.findUnpostedCounted(
      COUNTING_RESULTS,
      new Date(now.getTime() - REPAIR_GRACE_MS),
      REPAIR_BATCH,
    );

    let repaired = 0;
    for (const { _id } of unposted) {
      try {
        await this.postMatchStats(_id);
        repaired++;
      } catch (err: any) {
        this.logger.error(`Failed to post stats for match ${_id}: ${err.message}`);
      }
    }
    if (reviewsClosed || repaired) {
      this.logger.log(`Review windows closed: ${reviewsClosed}, stats repaired: ${repaired}`);
    }
    return { reviewsClosed, statsRepaired: repaired };
  }

  // One row per player on either team. Goals and assists come from
  // goalScorers (undone goals were already pulled from it); shootout goals
  // never reach goalScorers, so they never count.
  async buildRows(match: any): Promise<Array<Partial<PlayerMatchStat>>> {
    const sets = await this.setRepository.playersOf([match.teamOne, match.teamTwo]);
    const playersOf = (teamId: any): string[] =>
      (sets.find((s) => s._id.toString() === teamId.toString())?.players ?? []).map((p: any) => p.toString());

    const goals = new Map<string, number>();
    const assists = new Map<string, number>();
    for (const g of match.goalScorers ?? []) {
      goals.set(g.player.toString(), (goals.get(g.player.toString()) ?? 0) + 1);
      if (g.assistedBy) assists.set(g.assistedBy.toString(), (assists.get(g.assistedBy.toString()) ?? 0) + 1);
    }

    // Positions as they are now, frozen into the rows (a later change never
    // re-rates this match).
    const positionOf = await this.userRepository.positionsOf(sets.flatMap((s) => s.players ?? []));

    const season = lagosParts(new Date(match.endedAt)).year;
    const outcome = (teamId: any): MATCH_OUTCOME => {
      if (!match.winner) return MATCH_OUTCOME.DRAWN;
      return match.winner.toString() === teamId.toString() ? MATCH_OUTCOME.WON : MATCH_OUTCOME.LOST;
    };

    const rows: Array<Partial<PlayerMatchStat>> = [];
    for (const side of ['teamOne', 'teamTwo'] as Side[]) {
      const teamId = match[side];
      const conceded = (side === 'teamOne' ? match.teamTwoScore : match.teamOneScore) ?? 0;
      // A player listed on both teams (shouldn't happen) is counted once, on teamOne.
      for (const user of playersOf(teamId)) {
        if (rows.some((r) => r.user.toString() === user)) continue;
        const position = positionOf.get(user) as PLAYER_POSITION | undefined;
        rows.push({
          user: new Types.ObjectId(user),
          match: match._id,
          session: match.session,
          team: teamId,
          side,
          season,
          goals: goals.get(user) ?? 0,
          assists: assists.get(user) ?? 0,
          conceded,
          ...(position && { position }),
          cleanSheet: position === PLAYER_POSITION.DEFENDER && conceded === 0,
          result: outcome(teamId),
          playedAt: match.endedAt,
          void: false,
        });
      }
    }
    return rows;
  }

  // Totals for a profile, summed from non-void rows.
  async totals(userId: string, season?: number) {
    const row = await this.statRepository.totalsFor(new Types.ObjectId(userId), season);

    return {
      userId,
      season: season ?? null,
      totalMatches: row?.totalMatches ?? 0,
      goals: row?.goals ?? 0,
      assists: row?.assists ?? 0,
      wins: row?.wins ?? 0,
      draws: row?.draws ?? 0,
      losses: row?.losses ?? 0,
      cleanSheets: row?.cleanSheets ?? 0,
    };
  }
}
