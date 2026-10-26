import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository, MATCH_RESULT_STATUS, MATCH_STATUS, Match } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

// Score changes are versioned updates built in MatchesService (recordGoal /
// decrementMatchScore) — there is deliberately no blind +1/-1 here, so
// nothing can change a score without the scoreVersion check.
@Injectable()
export class MatchRepository extends AbstractRepository<Match> {
  protected readonly logger = new Logger(MatchRepository.name);

  constructor(@InjectModel(Match.name) MatchModel: Model<Match>) {
    super(MatchModel);
  }

  async markStatsPosted(matchId: Types.ObjectId): Promise<void> {
    await this.findRaw().updateOne({ _id: matchId }, { $set: { statsPostedAt: new Date() } });
  }

  // Referee-mode results whose review window has run out become CONFIRMED.
  async confirmExpiredReviews(now: Date): Promise<number> {
    const res = await this.updateMany(
      { resultStatus: MATCH_RESULT_STATUS.PENDING_CONFIRMATION, reviewUntil: { $lte: now } },
      { $set: { resultStatus: MATCH_RESULT_STATUS.CONFIRMED } },
    );
    return res.modifiedCount;
  }

  // Counted matches that ended before `endedBefore` without their stats written.
  async findUnpostedCounted(counting: MATCH_RESULT_STATUS[], endedBefore: Date, limit: number) {
    return this.findRaw()
      .find({
        status: MATCH_STATUS.FINISHED,
        resultStatus: { $in: counting },
        statsPostedAt: { $exists: false },
        endedAt: { $lte: endedBefore },
      })
      .select('_id')
      .limit(limit)
      .lean();
  }

  async hasLiveMatch(session: Types.ObjectId): Promise<boolean> {
    return !!(await this.findRaw().exists({ session, status: MATCH_STATUS.LIVE }));
  }

  // Teams (Set ids) that played at least one finished match in the session.
  async teamsWithFinishedMatch(session: Types.ObjectId): Promise<string[]> {
    const matches = await this.findRaw()
      .find({ session, status: MATCH_STATUS.FINISHED })
      .select('teamOne teamTwo')
      .lean();
    return [...new globalThis.Set(matches.flatMap((m: any) => [m.teamOne.toString(), m.teamTwo.toString()]))];
  }

  async viewMatchDetailsDeep(matchId: string): Promise<Match | null> {
    return this.model
      .findById(matchId)
      .populate([
        { path: 'teamOne', populate: { path: 'players', select: '-password' } },
        { path: 'teamTwo', populate: { path: 'players', select: '-password' } },
        { path: 'goalScorers.player', select: '-password' },
        { path: 'goalScorers.assistedBy', select: '-password' },
      ])
      .lean() as any;
  }
}
