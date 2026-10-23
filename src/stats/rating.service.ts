import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MATCH_OUTCOME, PlayerMatchStat } from '@app/common';
import { VotesService } from 'src/votes/votes.service';

// The player rating (out of 10), from the profile designs. Every part is
// "how far toward its cap", times its weight. Same weights for every
// position; clean sheets only ever exist on defenders' rows, so a
// defender's contribution includes them and everyone else's doesn't.
export const RATING = {
  WINDOW_SESSIONS: 20,
  CONTRIBUTION: { max: 3.5, capPerSession: 3 }, // goals + assists (+ clean sheets) per session
  SET_WIN: { max: 2 }, // games won / games played
  SESSION_WIN: { max: 1.5 }, // sessions where the player's team won the most games
  VOTES: { max: 2, capShare: 0.3 }, // average share of Player of the Session votes
  EXPERIENCE: { max: 1 }, // sessions played / WINDOW_SESSIONS
} as const;

const round1 = (n: number) => Math.round(n * 10) / 10;
const part = (fraction: number, max: number) => Math.min(Math.max(fraction, 0), 1) * max;

export interface RatingInputs {
  sessions: number; // counted sessions in the window
  contributions: number; // goals + assists + clean sheets
  gamesPlayed: number;
  gamesWon: number;
  sessionsWon: number;
  voteShare: number; // average share of votes, 0–1
}

// The formula on its own, so it can be checked against the designs.
export function scoreRating(i: RatingInputs) {
  const perSession = i.sessions ? i.contributions / i.sessions : 0;
  const setWinPct = i.gamesPlayed ? i.gamesWon / i.gamesPlayed : 0;
  const sessionWinPct = i.sessions ? i.sessionsWon / i.sessions : 0;
  const components = [
    { key: 'contribution', score: part(perSession / RATING.CONTRIBUTION.capPerSession, RATING.CONTRIBUTION.max), max: RATING.CONTRIBUTION.max },
    { key: 'setWin', score: part(setWinPct, RATING.SET_WIN.max), max: RATING.SET_WIN.max },
    { key: 'sessionWin', score: part(sessionWinPct, RATING.SESSION_WIN.max), max: RATING.SESSION_WIN.max },
    { key: 'votes', score: part(i.voteShare / RATING.VOTES.capShare, RATING.VOTES.max), max: RATING.VOTES.max },
    { key: 'experience', score: part(i.sessions / RATING.WINDOW_SESSIONS, RATING.EXPERIENCE.max), max: RATING.EXPERIENCE.max },
  ];
  return {
    rating: i.sessions ? round1(components.reduce((n, c) => n + c.score, 0)) : null,
    perSession,
    setWinPct,
    sessionWinPct,
    components: components.map((c) => ({ ...c, score: round1(c.score) })),
  };
}

// Built only from counted (officiated, not disputed) match rows, over the
// player's last 20 sessions with such a match — the session that just
// finished included as soon as its matches are counted. Calculated on every
// request, so there's nothing stored to go stale.
@Injectable()
export class RatingService {
  constructor(
    @InjectModel(PlayerMatchStat.name) private readonly statModel: Model<PlayerMatchStat>,
    private readonly votes: VotesService,
  ) {}

  async rating(userId: string) {
    const user = new Types.ObjectId(userId);

    // Last 20 sessions, newest first.
    const recent = await this.statModel.aggregate([
      { $match: { user, void: false } },
      { $group: { _id: '$session', lastPlayed: { $max: '$playedAt' }, team: { $first: '$team' } } },
      { $sort: { lastPlayed: -1 } },
      { $limit: RATING.WINDOW_SESSIONS },
    ]);
    const sessionIds = recent.map((s) => s._id);
    const sessions = sessionIds.length;

    const [rows, teamWins, shares] = await Promise.all([
      this.statModel.find({ user, void: false, session: { $in: sessionIds } }).lean(),
      this.teamWinsBySession(sessionIds),
      this.votes.voteShares(userId, sessionIds),
    ]);

    const goals = rows.reduce((n, r: any) => n + (r.goals ?? 0), 0);
    const assists = rows.reduce((n, r: any) => n + (r.assists ?? 0), 0);
    const cleanSheets = rows.filter((r: any) => r.cleanSheet === true).length;
    const gamesPlayed = rows.length;
    const gamesWon = rows.filter((r: any) => r.result === MATCH_OUTCOME.WON).length;

    // A session counts as won only if the player's team won strictly more
    // games than every other team in it. A tie for most: nobody.
    const sessionsWon = recent.filter(({ _id, team }) => {
      const wins = teamWins.get(_id.toString()) ?? new Map<string, number>();
      const mine = wins.get(team.toString()) ?? 0;
      return mine > 0 && [...wins].every(([t, w]) => t === team.toString() || w < mine);
    }).length;

    const voteShare = shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : 0;
    const scored = scoreRating({
      sessions,
      contributions: goals + assists + cleanSheets,
      gamesPlayed,
      gamesWon,
      sessionsWon,
      voteShare,
    });

    return {
      userId,
      // null until the player has a counted session.
      rating: scored.rating,
      window: { sessions, of: RATING.WINDOW_SESSIONS },
      totals: {
        goals,
        assists,
        cleanSheets,
        gamesPlayed,
        gamesWon,
        contributionsPerSession: round1(scored.perSession),
        setWinPct: round1(scored.setWinPct * 100),
        sessionsWon,
        sessionWinPct: round1(scored.sessionWinPct * 100),
        voteSharePct: round1(voteShare * 100),
        votesCounted: shares.length,
      },
      components: scored.components,
    };
  }

  // session -> team -> games won, across every team in each session (counted
  // matches only). One row per player per match, so count distinct matches.
  private async teamWinsBySession(sessionIds: Types.ObjectId[]) {
    const wins = await this.statModel.aggregate([
      { $match: { session: { $in: sessionIds }, void: false, result: MATCH_OUTCOME.WON } },
      { $group: { _id: { session: '$session', team: '$team', match: '$match' } } },
      { $group: { _id: { session: '$_id.session', team: '$_id.team' }, wins: { $sum: 1 } } },
    ]);
    const bySession = new Map<string, Map<string, number>>();
    for (const { _id, wins: n } of wins) {
      const key = _id.session.toString();
      if (!bySession.has(key)) bySession.set(key, new Map());
      bySession.get(key).set(_id.team.toString(), n);
    }
    return bySession;
  }
}
