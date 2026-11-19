import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { MatchRepository } from './matches.repository';
import { SetRepository } from '../sets/sets.repository';
import {
  CustomHttpException,
  MATCH_EVENT_TYPE,
  MATCH_RESULT_STATUS,
  MATCH_STATUS,
  MatchI,
  ROTATION_FORMAT,
  WINNING_DECIDER,
} from '@app/common';

type TeamSide = 'teamOne' | 'teamTwo';
import { Set } from '@app/common';
import { SessionRepository } from 'src/sessions/sessions.repository';
import { Types } from 'mongoose';
import { MatchEventService } from './match-event.service';
import { SessionPaymentService } from 'src/billing/services/session-payment.service';
import { RotationService } from './rotation.service';
import { MatchRefereeService, RESULT_REVIEW_WINDOW_MS } from './match-referee.service';
import { COUNTING_RESULTS, MatchStatsService } from 'src/stats/match-stats.service';

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(
    private readonly matchRepository: MatchRepository,
    private readonly setRepository: SetRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly matchEventService: MatchEventService,
    private readonly sessionPaymentService: SessionPaymentService,
    private readonly rotationService: RotationService,
    private readonly matchReferee: MatchRefereeService,
    private readonly matchStats: MatchStatsService,
  ) {}

  private assertLive(match: { status?: MATCH_STATUS }): void {
    if (match.status !== MATCH_STATUS.LIVE) {
      throw new CustomHttpException('Match is not live', HttpStatus.BAD_REQUEST);
    }
  }

  private async viewSetForSession(sessionId: string): Promise<Set[]> {
    return await this.setRepository.find({
      session: new Types.ObjectId(sessionId),
    });
  }

  async matchUp(sessionId: string) {
    const sets = await this.viewSetForSession(sessionId);
    const session = await this.sessionRepository.findOne({ _id: sessionId });

    if (!session) {
      throw new CustomHttpException('Session not found', HttpStatus.NOT_FOUND);
    }

    if (session.paymentRequired) {
      const allPaid = await this.sessionPaymentService.areAllPaymentsCompleted(
        session._id,
      );
      if (!allPaid) {
        throw new CustomHttpException(
          'Cannot start matchup: not all members have completed payment',
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
    }

    if (!sets || sets.length < 2) {
      throw new CustomHttpException(
        'A session needs at least 2 teams before matchup',
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.matchRepository.findOne({ session: sessionId });
    if (existing) {
      throw new CustomHttpException(
        'Teams already matched for this session',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Only game 1 is created here. Every later game is created by endMatch,
    // because who plays next depends on the result.
    const pairing = this.rotationService.firstMatch(
      sets.map((set) => set._id.toString()),
      session.rotationFormat ?? ROTATION_FORMAT.WINNER_STAYS,
    );
    let first;
    try {
      first = await this.matchRepository.create(
        this.buildMatch(sessionId, session.matchType, 1, pairing) as any,
      );
    } catch (err: any) {
      // Two matchup calls racing: the unique {session, sequence} index lets one through.
      if (err?.code === 11000) {
        throw new CustomHttpException('Teams already matched for this session', HttpStatus.BAD_REQUEST);
      }
      throw err;
    }

    // Array for backwards compatibility — this endpoint used to return every pairing.
    return [first];
  }

  private buildMatch(
    sessionId: string,
    matchType: string,
    sequence: number,
    pairing: { teamOne: string; teamTwo: string; waiting: string[] },
  ) {
    return {
      session: sessionId,
      matchType,
      sequence,
      status: MATCH_STATUS.SCHEDULED,
      teamOne: pairing.teamOne,
      teamTwo: pairing.teamTwo,
      waiting: pairing.waiting.map((id) => new Types.ObjectId(id)),
    };
  }

  async viewSessionMatchUps(sessionId: string) {
    const matches = await this.matchRepository.findAndPopulate(
      { session: sessionId },
      ['teamOne', 'teamTwo'],
    );
    matches?.sort((a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0));

    if (!matches || matches.length === 0) {
      throw new CustomHttpException(
        'No matchups exist in this session yet',
        HttpStatus.NOT_FOUND,
      );
    }

    return matches;
  }

  // Safe to repeat: starting a match that is already live returns it as-is,
  // so a retry after a lost response doesn't look like a failure.
  async startMatch(matchId: string, userId: string) {
    const { match: current, referee } = await this.matchReferee.assertCanOfficiate(matchId, userId);

    if (current.status !== MATCH_STATUS.LIVE) {
      // Re-checked at kick-off: the referee may have been assigned a while ago.
      if (referee) await this.matchReferee.assertEligible(referee, current);

      // Atomic: only a SCHEDULED match can go live.
      const started = await this.matchRepository.findOneAndUpdate(
        { _id: matchId, status: MATCH_STATUS.SCHEDULED },
        { status: MATCH_STATUS.LIVE, isStarted: true, startedAt: new Date() },
      );
      if (!started) {
        const now = await this.matchRepository.findOne({ _id: matchId });
        if (now?.status !== MATCH_STATUS.LIVE) {
          throw new CustomHttpException('Match has already finished', HttpStatus.BAD_REQUEST);
        }
      }
      // Only the request that actually started it announces it.
      if (started) this.announceStarted(started);
    }

    const match: MatchI = await this.matchRepository.findOneAndPopulate(
      { _id: matchId },
      ['teamOne', 'teamTwo'],
    );

    return {
      message: `${match.teamOne.name} vs ${match.teamTwo.name} is underway`,
      match: await this.matchRepository.findOne({ _id: matchId }),
    };
  }

  async endMatch(
    matchId: string,
    userId: string,
    expectedScoreVersion: number,
    penaltyWinner?: 'teamOne' | 'teamTwo',
  ) {
    const { match, referee } = await this.matchReferee.assertCanOfficiate(matchId, userId);

    // A retry of an end that already went through: same answer, nothing new.
    if (match.status === MATCH_STATUS.FINISHED) {
      return this.alreadyEnded(match, expectedScoreVersion);
    }
    this.assertLive(match);
    this.assertScoreVersion(match, expectedScoreVersion);

    const session = await this.sessionRepository.findOne({ _id: match.session });
    if (!session) {
      throw new CustomHttpException('Session not found', HttpStatus.NOT_FOUND);
    }

    const format: ROTATION_FORMAT = session.rotationFormat ?? ROTATION_FORMAT.WINNER_STAYS;
    const game = {
      sequence: match.sequence,
      teamOne: match.teamOne.toString(),
      teamTwo: match.teamTwo.toString(),
      waiting: (match.waiting ?? []).map((id: any) => id.toString()),
      teamOneScore: match.teamOneScore,
      teamTwoScore: match.teamTwoScore,
    };
    const result = this.rotationService.resolveResult(
      game,
      format,
      session.winningDecider ?? WINNING_DECIDER.PENALTY,
      penaltyWinner,
    );
    const endedAt = new Date();
    const resultStatus = this.matchReferee.resultStatusFor(referee);

    // Atomic on status, scoreVersion and referee: a goal landing mid-request
    // or a referee handoff makes this match nothing instead of finishing with a
    // stale winner / result status. A racing duplicate end lands in alreadyEnded.
    const finished = await this.matchRepository.findOneAndUpdate(
      {
        _id: matchId,
        status: MATCH_STATUS.LIVE,
        scoreVersion: this.versionFilter(match),
        referee: match.referee ?? null,
      },
      {
        status: MATCH_STATUS.FINISHED,
        isStarted: false,
        endedAt,
        winner: result.winner ? new Types.ObjectId(result.winner) : null,
        decidedBy: result.decidedBy,
        ...(result.penaltyWinner && { penaltyWinner: result.penaltyWinner }),
        resultStatus,
        ...(resultStatus === MATCH_RESULT_STATUS.PENDING_CONFIRMATION && {
          reviewUntil: new Date(endedAt.getTime() + RESULT_REVIEW_WINDOW_MS),
        }),
      },
    );
    if (!finished) {
      const now = await this.matchRepository.findOne({ _id: matchId });
      if (now?.status === MATCH_STATUS.FINISHED) return this.alreadyEnded(now, expectedScoreVersion);
      throw new CustomHttpException(
        'The score or referee changed while ending — refresh and try again',
        HttpStatus.CONFLICT,
      );
    }

    const next = await this.createNextMatch(session, match, game, result, format, userId);
    await this.afterResult(finished);
    // Only the request that actually finished it announces it (a retry lands
    // in alreadyEnded and stays quiet).
    this.announceFinished(finished, next);
    return this.endResponse(finished, next);
  }

  private teamRef(team: any) {
    return { id: team?._id ?? team, name: team?.name ?? '' };
  }

  private announceStarted(started: any): void {
    this.matchRepository
      .findOneAndPopulate<any>({ _id: started._id }, ['teamOne', 'teamTwo'])
      .then((m) =>
        this.matchEventService.emitMatchEvent({
          type: 'match_started',
          matchId: m._id,
          sessionId: m.session,
          sequence: m.sequence,
          teamOne: this.teamRef(m.teamOne),
          teamTwo: this.teamRef(m.teamTwo),
          referee: m.referee ?? null,
          startedAt: m.startedAt,
        }),
      )
      .catch((err) => this.logger.error('Failed to emit match_started', err));
  }

  // Tells match and session screens the result and which game is next, so
  // they don't have to poll for it.
  private announceFinished(finished: any, next: any): void {
    Promise.all([
      this.matchRepository.findOneAndPopulate<any>({ _id: finished._id }, ['teamOne', 'teamTwo']),
      next ? this.matchRepository.findOneAndPopulate<any>({ _id: next._id }, ['teamOne', 'teamTwo']) : null,
    ])
      .then(([m, n]) =>
        this.matchEventService.emitMatchEvent({
          type: 'match_finished',
          matchId: m._id,
          sessionId: m.session,
          sequence: m.sequence,
          teamOne: this.teamRef(m.teamOne),
          teamTwo: this.teamRef(m.teamTwo),
          teamOneScore: m.teamOneScore,
          teamTwoScore: m.teamTwoScore,
          scoreVersion: m.scoreVersion ?? 0,
          winner: m.winner ?? null,
          decidedBy: m.decidedBy,
          ...(m.penaltyWinner && { penaltyWinner: m.penaltyWinner }),
          resultStatus: m.resultStatus,
          next: n
            ? {
                matchId: n._id,
                sequence: n.sequence,
                teamOne: this.teamRef(n.teamOne),
                teamTwo: this.teamRef(n.teamTwo),
                referee: n.referee ?? null,
              }
            : null,
        }),
      )
      .catch((err) => this.logger.error('Failed to emit match_finished', err));
  }

  // Stats and review pushes for a finished match. Failures are logged, not
  // thrown: the match is already over, and the match-stats job reposts any
  // counted match missing its stats (the outbox retries pushes).
  private async afterResult(finished: any): Promise<void> {
    if (!COUNTING_RESULTS.includes(finished.resultStatus)) return;
    await this.matchStats
      .postMatchStats(finished._id)
      .catch((err) => this.logger.error(`Posting stats for match ${finished._id} failed; the repair job will retry`, err));
    if (finished.resultStatus === MATCH_RESULT_STATUS.PENDING_CONFIRMATION) {
      await this.matchReferee
        .notifyReviewers(finished)
        .catch((err) => this.logger.error(`Queuing review pushes for match ${finished._id} failed`, err));
    }
  }

  private async endResponse(finished: any, next: any) {
    const populated: MatchI = await this.matchRepository.findOneAndPopulate(
      { _id: finished._id },
      ['teamOne', 'teamTwo'],
    );
    return {
      message: `Final Score- ${populated.teamOne.name}:${populated.teamOneScore} vs ${populated.teamTwo.name}:${populated.teamTwoScore}`,
      match: finished,
      next,
    };
  }

  // The match was already finished at the version the caller saw: return the
  // same result. A different version means they ended from an out-of-date
  // screen, so they should look before assuming it's their result.
  private async alreadyEnded(match: any, expectedScoreVersion: number) {
    if ((match.scoreVersion ?? 0) !== expectedScoreVersion) {
      throw new CustomHttpException('This match has already ended', HttpStatus.CONFLICT);
    }
    return this.endResponse(match, await this.findNextMatch(match));
  }

  // The request that won the race creates the next game just after finishing
  // this one, so a racing duplicate may look a moment too early.
  private async findNextMatch(match: any) {
    if (!Array.isArray(match.waiting) || !match.sequence) return null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const next = await this.matchRepository.findOne({ session: match.session, sequence: match.sequence + 1 });
      if (next) return next;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  }

  // Null when the session's time is up, or for matches created before
  // rotation existed (no `waiting` queue to rotate from). The referee carries
  // over when still eligible — not if their own team is coming on.
  private async createNextMatch(
    session: any,
    match: any,
    game: any,
    result: any,
    format: ROTATION_FORMAT,
    userId: string,
  ) {
    if (!Array.isArray(match.waiting) || !match.sequence) return null;
    if (!session.stopTime || new Date() >= new Date(session.stopTime)) return null;

    const sets = await this.viewSetForSession(session._id.toString());
    const pairing = this.rotationService.nextMatch(
      game,
      result,
      sets.map((set) => set._id.toString()),
      format,
    );

    const referee = await this.matchReferee.carryOver(match.referee, {
      session: session._id,
      teamOne: pairing.teamOne,
      teamTwo: pairing.teamTwo,
    });

    return this.matchRepository.create({
      ...this.buildMatch(session._id.toString(), session.matchType, match.sequence + 1, pairing),
      referee,
      refereeHistory: referee ? [{ referee, at: new Date(), by: new Types.ObjectId(userId) }] : [],
    } as any);
  }

  async viewMatchDetails(matchId: string) {
    const match = await this.matchRepository.viewMatchDetailsDeep(matchId);

    if (!match) {
      throw new CustomHttpException('Match not found', HttpStatus.NOT_FOUND);
    }

    return match;
  }

  // Goal with a named scorer (and optional assist). Needs a referee: an
  // unofficiated match never records who scored.
  async recordGoalScorer(
    matchId: string,
    userId: string,
    data: { team: TeamSide; playerId: string; assistedBy?: string; eventId: string; expectedScoreVersion: number },
  ) {
    return this.recordGoal(matchId, userId, data);
  }

  // Goal without a scorer — the scoreboard for an unofficiated match, or a
  // referee who didn't catch who scored.
  async incrementMatchScore(
    matchId: string,
    team: TeamSide,
    userId: string,
    change: { eventId: string; expectedScoreVersion: number },
  ) {
    return this.recordGoal(matchId, userId, { team, ...change });
  }

  // Undo the most recent goal for `team`, removing its scorer too so stats
  // can never keep a goal that was taken back.
  async decrementMatchScore(
    matchId: string,
    team: TeamSide,
    userId: string,
    change: { eventId: string; expectedScoreVersion: number },
  ) {
    const { match, referee } = await this.matchReferee.assertCanOfficiate(matchId, userId);
    if (this.hasEvent(match, change.eventId)) return this.currentMatch(matchId);
    this.assertLive(match);
    this.assertScoreVersion(match, change.expectedScoreVersion);

    const scoreField = team === 'teamOne' ? 'teamOneScore' : 'teamTwoScore';
    if (!match[scoreField]) {
      throw new CustomHttpException('There is no goal to undo for that team', HttpStatus.BAD_REQUEST);
    }

    // Latest goal for this team not already undone. Goals from before the
    // event log existed have no event; undoing those just lowers the score.
    const events: any[] = match.events ?? [];
    const undone = new globalThis.Set(events.filter((e) => e.type === MATCH_EVENT_TYPE.UNDO).map((e) => e.undoes));
    const target = [...events]
      .reverse()
      .find((e) => e.type === MATCH_EVENT_TYPE.GOAL && e.team === team && !undone.has(e.eventId));

    const updated = await this.matchRepository.findOneAndUpdate(
      {
        _id: matchId,
        status: MATCH_STATUS.LIVE,
        scoreVersion: this.versionFilter(match),
        'events.eventId': { $ne: change.eventId },
        [scoreField]: { $gt: 0 },
      },
      {
        $inc: { [scoreField]: -1, scoreVersion: 1 },
        $push: {
          events: this.event(change.eventId, MATCH_EVENT_TYPE.UNDO, team, userId, referee, {
            undoes: target?.eventId ?? null,
          }),
        },
        ...(target && { $pull: { goalScorers: { eventId: target.eventId } } }),
      },
    );
    return this.afterScoreChange(matchId, change.eventId, updated);
  }

  private async recordGoal(
    matchId: string,
    userId: string,
    data: { team: TeamSide; playerId?: string; assistedBy?: string; eventId: string; expectedScoreVersion: number },
  ) {
    const { match, referee } = await this.matchReferee.assertCanOfficiate(matchId, userId);
    // Checked first: a retry of a goal that already landed is fine even if
    // the match has ended since.
    if (this.hasEvent(match, data.eventId)) return this.currentMatch(matchId);
    this.assertLive(match);

    if (data.playerId) {
      // No referee, no stats: an unofficiated match keeps a score for
      // rotation but never records who scored.
      if (!referee) {
        throw new CustomHttpException(
          "This match has no referee — goals and assists aren't recorded",
          HttpStatus.BAD_REQUEST,
        );
      }
      const players = await this.matchReferee.playersOf(match);
      if (!players[data.team].has(data.playerId)) {
        throw new CustomHttpException(`That player isn't on ${data.team}`, HttpStatus.BAD_REQUEST);
      }
      if (data.assistedBy && (data.assistedBy === data.playerId || !players[data.team].has(data.assistedBy))) {
        throw new CustomHttpException(
          'The assist must come from a teammate of the scorer',
          HttpStatus.BAD_REQUEST,
        );
      }
    } else if (data.assistedBy) {
      throw new CustomHttpException('An assist needs a scorer', HttpStatus.BAD_REQUEST);
    }
    this.assertScoreVersion(match, data.expectedScoreVersion);

    const scoreField = data.team === 'teamOne' ? 'teamOneScore' : 'teamTwoScore';
    const scorer = data.playerId ? new Types.ObjectId(data.playerId) : undefined;
    const assistedBy = data.assistedBy ? new Types.ObjectId(data.assistedBy) : undefined;

    const updated = await this.matchRepository.findOneAndUpdate(
      {
        _id: matchId,
        status: MATCH_STATUS.LIVE,
        scoreVersion: this.versionFilter(match),
        'events.eventId': { $ne: data.eventId },
      },
      {
        $inc: { [scoreField]: 1, scoreVersion: 1 },
        $push: {
          events: this.event(data.eventId, MATCH_EVENT_TYPE.GOAL, data.team, userId, referee, { scorer, assistedBy }),
          ...(scorer && {
            goalScorers: {
              player: scorer,
              team: data.team,
              ...(assistedBy && { assistedBy }),
              eventId: data.eventId,
              recordedBy: referee._id,
              recordedAt: new Date(),
            },
          }),
        },
      },
    );
    return this.afterScoreChange(matchId, data.eventId, updated, scorer && { player: data.playerId, team: data.team });
  }

  // The conditional update matched nothing: work out why, from fresh state.
  private async afterScoreChange(matchId: string, eventId: string, updated: any, latestScorer?: any) {
    if (!updated) {
      const now = await this.matchRepository.findOne({ _id: matchId });
      if (this.hasEvent(now, eventId)) return this.currentMatch(matchId); // a racing retry landed first
      this.assertLive(now);
      throw this.staleScore(now);
    }

    const match = await this.currentMatch(matchId);
    this.matchEventService
      .emitMatchScoreUpdate({
        matchId: new Types.ObjectId(matchId),
        sessionId: match.session,
        teamOne: { id: (match.teamOne as any)._id, name: (match.teamOne as any).name },
        teamTwo: { id: (match.teamTwo as any)._id, name: (match.teamTwo as any).name },
        teamOneScore: match.teamOneScore,
        teamTwoScore: match.teamTwoScore,
        scoreVersion: match.scoreVersion ?? 0,
        ...(latestScorer && { latestScorer }),
      })
      .catch((err) => this.logger.error('Failed to emit score update', err));
    return match;
  }

  private currentMatch(matchId: string): Promise<any> {
    return this.matchRepository.viewMatchDetailsDeep(matchId);
  }

  private hasEvent(match: any, eventId: string): boolean {
    return (match?.events ?? []).some((e: any) => e.eventId === eventId);
  }

  private assertScoreVersion(match: any, expected: number): void {
    if ((match.scoreVersion ?? 0) !== expected) throw this.staleScore(match);
  }

  private staleScore(match: any) {
    return new CustomHttpException(
      'The score changed since your screen loaded — showing the latest score',
      HttpStatus.CONFLICT,
      {
        scoreVersion: match.scoreVersion ?? 0,
        teamOneScore: match.teamOneScore,
        teamTwoScore: match.teamTwoScore,
      },
    );
  }

  // Matches from before scoreVersion existed have no field: treat as 0.
  private versionFilter(match: any) {
    const version = match.scoreVersion ?? 0;
    return version === 0 ? { $in: [0, null] } : version;
  }

  private event(
    eventId: string,
    type: MATCH_EVENT_TYPE,
    team: TeamSide,
    userId: string,
    referee: any,
    extra: Record<string, any> = {},
  ) {
    const clean = Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined));
    return {
      eventId,
      type,
      team,
      ...clean,
      recordedByUser: new Types.ObjectId(userId),
      referee: referee?._id ?? null,
      at: new Date(),
    };
  }
}
