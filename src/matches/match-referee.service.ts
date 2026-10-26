import { HttpStatus, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  CustomHttpException,
  MATCH_RESULT_STATUS,
  MATCH_STATUS,
  REFEREE_MODE,
  REFEREE_STATUS,
  SessionReferee,
} from '@app/common';
import { MatchRepository } from './matches.repository';
import { SetRepository } from 'src/sets/sets.repository';
import { SessionRepository } from 'src/sessions/sessions.repository';
import { RefereesService } from 'src/referees/referees.service';
import { MatchStatsService } from 'src/stats/match-stats.service';
import { MatchEventService } from './match-event.service';
import { NotificationOutboxService } from 'src/notifications/notification-outbox.service';
import { NOTIFICATION_TYPE } from 'src/notifications/notification.types';

// How long the opposing side has to dispute a Referee-mode result. The result
// counts toward stats immediately; a dispute inside this window voids it.
export const RESULT_REVIEW_WINDOW_MS = 24 * 60 * 60 * 1000;

type TeamSide = 'teamOne' | 'teamTwo';
type Players = Record<TeamSide, globalThis.Set<string>>;

export interface Officiating {
  match: any;
  // null: the match has no referee and the caller is one of its players.
  referee: SessionReferee | null;
}

// Per-match referee rules: who may record a match, who may referee it (not
// someone playing in it), handing the role on, and confirming results that
// were recorded in Referee mode on a captain's phone.
@Injectable()
export class MatchRefereeService {
  constructor(
    private readonly matchRepository: MatchRepository,
    private readonly setRepository: SetRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly refereesService: RefereesService,
    private readonly matchStats: MatchStatsService,
    private readonly outbox: NotificationOutboxService,
    private readonly matchEvents: MatchEventService,
  ) {}

  // Gate for start / end / score / goal scorer. With a referee, only the
  // referee (or, in Referee mode, the captain's login they're using) may
  // record. Without one, the two playing teams can run the scoreboard so
  // rotation still knows the winner — but the result stays UNOFFICIAL.
  // The location owner has no recording power of their own.
  async assertCanOfficiate(matchId: string, userId: string): Promise<Officiating> {
    const match = await this.matchRepository.findOne({ _id: matchId });
    if (!match) throw new CustomHttpException('Match not found', HttpStatus.NOT_FOUND);

    if (match.referee) {
      const referee = await this.refereesService.findById(match.referee);
      if (referee?.status === REFEREE_STATUS.ACCEPTED && this.actsAs(referee, userId)) {
        return { match, referee };
      }
      throw new CustomHttpException("Only this match's referee can record it", HttpStatus.FORBIDDEN);
    }

    const players = await this.playersOf(match);
    if (players.teamOne.has(userId) || players.teamTwo.has(userId)) return { match, referee: null };
    throw new CustomHttpException(
      'This match has no referee — only its players can run the scoreboard',
      HttpStatus.FORBIDDEN,
    );
  }

  // Throws unless `referee` may referee `match`: accepted, on this session's
  // roster, not on either team in it, and not refereeing another live match.
  async assertEligible(referee: SessionReferee | null, match: any): Promise<void> {
    if (!referee || referee.status !== REFEREE_STATUS.ACCEPTED) {
      throw new CustomHttpException('That referee has not accepted yet', HttpStatus.BAD_REQUEST);
    }
    if (referee.session.toString() !== match.session.toString()) {
      throw new CustomHttpException("That referee isn't on this session's referee list", HttpStatus.BAD_REQUEST);
    }
    if (referee.user) {
      const players = await this.playersOf(match);
      const id = referee.user.toString();
      if (players.teamOne.has(id) || players.teamTwo.has(id)) {
        throw new CustomHttpException("That referee plays in this match — pick someone whose team isn't playing", HttpStatus.BAD_REQUEST);
      }
    }
    const busy = await this.matchRepository.findOne({
      _id: { $ne: match._id },
      status: MATCH_STATUS.LIVE,
      referee: { $in: await this.refereesService.entryIdsFor(referee) },
    });
    if (busy) {
      throw new CustomHttpException('That referee is already refereeing a live match', HttpStatus.BAD_REQUEST);
    }
  }

  // Assign before kick-off, or hand off mid-match.
  async assign(matchId: string, userId: string, refereeId: string) {
    const match = await this.getUnfinishedMatch(matchId);
    await this.assertCanManageReferee(match, userId);

    const referee = await this.refereesService.findById(refereeId);
    if (!referee) throw new CustomHttpException('Referee not found', HttpStatus.NOT_FOUND);
    if (match.referee?.toString() === referee._id.toString()) return match;
    await this.assertEligible(referee, match);

    return this.swapReferee(match, referee._id, userId);
  }

  // The match carries on unofficiated: no goal scorers, result UNOFFICIAL.
  async remove(matchId: string, userId: string) {
    const match = await this.getUnfinishedMatch(matchId);
    await this.assertCanManageReferee(match, userId);
    if (!match.referee) return match;
    return this.swapReferee(match, null, userId);
  }

  // The referee of a finished game moves to the next one if still eligible
  // (their own team might be coming on). Null leaves the slot empty for
  // someone to pick.
  async carryOver(
    refereeId: Types.ObjectId | null | undefined,
    next: { session: any; teamOne: string; teamTwo: string },
  ): Promise<Types.ObjectId | null> {
    if (!refereeId) return null;
    const referee = await this.refereesService.findById(refereeId);
    try {
      await this.assertEligible(referee, { _id: null, ...next });
      return referee._id;
    } catch {
      return null;
    }
  }

  resultStatusFor(referee: SessionReferee | null): MATCH_RESULT_STATUS {
    if (!referee) return MATCH_RESULT_STATUS.UNOFFICIAL;
    return referee.mode === REFEREE_MODE.CAPTAIN_DEVICE
      ? MATCH_RESULT_STATUS.PENDING_CONFIRMATION
      : MATCH_RESULT_STATUS.CONFIRMED;
  }

  // A Referee-mode result arrives with the captain's login, so the server
  // can't tell the referee's taps from the captain's. It counts straight away,
  // and the other side can dispute it until reviewUntil; a dispute takes it
  // out of stats. Who may respond: see canReview.
  async respondToResult(matchId: string, userId: string, confirm: boolean) {
    const match = await this.matchRepository.findOne({ _id: matchId });
    if (!match) throw new CustomHttpException('Match not found', HttpStatus.NOT_FOUND);
    if (match.resultStatus !== MATCH_RESULT_STATUS.PENDING_CONFIRMATION) {
      throw new CustomHttpException('This result is not waiting for review', HttpStatus.BAD_REQUEST);
    }
    if (match.reviewUntil && new Date() > new Date(match.reviewUntil)) {
      throw new CustomHttpException('The review window for this result has closed', HttpStatus.BAD_REQUEST);
    }

    const referee = await this.refereesService.findById(match.referee);
    const players = await this.playersOf(match);
    if (!this.canReview(userId, referee?.deviceOwner?.toString(), players)) {
      throw new CustomHttpException(
        'Only a player on the other team can confirm or dispute this result',
        HttpStatus.FORBIDDEN,
      );
    }

    const updated = await this.matchRepository.findOneAndUpdate(
      { _id: matchId, resultStatus: MATCH_RESULT_STATUS.PENDING_CONFIRMATION },
      {
        resultStatus: confirm ? MATCH_RESULT_STATUS.CONFIRMED : MATCH_RESULT_STATUS.DISPUTED,
        confirmedBy: new Types.ObjectId(userId),
        confirmedAt: new Date(),
      },
    );
    if (!updated) {
      throw new CustomHttpException('This result was already confirmed or disputed', HttpStatus.CONFLICT);
    }

    // Disputed: out of stats until reviewed. Confirmed: already counted —
    // posting again is a no-op, but repairs it if the first post failed.
    if (confirm) await this.matchStats.postMatchStats(matchId);
    else await this.matchStats.voidMatchStats(matchId);
    return updated;
  }

  // Push every player allowed to review a Referee-mode result. dedupeKey
  // makes a retried end request harmless.
  async notifyReviewers(match: any): Promise<void> {
    const referee = await this.refereesService.findById(match.referee);
    const players = await this.playersOf(match);
    const deviceOwner = referee?.deviceOwner?.toString();
    const reviewers = [...players.teamOne, ...players.teamTwo].filter((id) => this.canReview(id, deviceOwner, players));

    await this.outbox.enqueueMany(
      reviewers.map((userId) => ({
        params: {
          type: NOTIFICATION_TYPE.MATCH_RESULT_REVIEW,
          targetUserId: userId,
          title: 'Check the result',
          body: `Final score ${match.teamOneScore}–${match.teamTwoScore}, recorded on a captain's phone. It already counts — dispute it if it's wrong.`,
          payload: { matchId: match._id.toString(), sessionId: match.session.toString() },
        },
        options: {
          dedupeKey: `match-review:${match._id}:${userId}`,
          deliverBefore: match.reviewUntil ? new Date(match.reviewUntil) : undefined,
        },
      })),
    );
  }

  // A player on the team opposing the captain whose phone was used. If that
  // captain's team wasn't in the match, a player from either team. Never the
  // captain themselves.
  private canReview(userId: string, deviceOwner: string | undefined, players: Players): boolean {
    if (!userId || userId === deviceOwner) return false;
    if (players.teamOne.has(deviceOwner)) return players.teamTwo.has(userId);
    if (players.teamTwo.has(deviceOwner)) return players.teamOne.has(userId);
    return players.teamOne.has(userId) || players.teamTwo.has(userId);
  }

  async playersOf(match: { teamOne: any; teamTwo: any }): Promise<Players> {
    const sets = await this.setRepository.find({ _id: { $in: [match.teamOne, match.teamTwo] } });
    const playersFor = (teamId: any) =>
      new globalThis.Set<string>(
        (sets.find((s: any) => s._id.toString() === teamId?.toString())?.players ?? []).map((p: any) => p.toString()),
      );
    return { teamOne: playersFor(match.teamOne), teamTwo: playersFor(match.teamTwo) };
  }

  private actsAs(referee: SessionReferee, userId: string): boolean {
    const login = referee.mode === REFEREE_MODE.CAPTAIN_DEVICE ? referee.deviceOwner : referee.user;
    return login?.toString() === userId;
  }

  // Any session captain, the location owner, or the referee handing over.
  private async assertCanManageReferee(match: any, userId: string): Promise<void> {
    const session = await this.sessionRepository.findOne({ _id: match.session });
    if (!session) throw new CustomHttpException('Session not found', HttpStatus.NOT_FOUND);

    if (await this.refereesService.isCaptain(session, userId)) return;
    if (await this.refereesService.isOwner(session, userId)) return;
    if (match.referee) {
      const current = await this.refereesService.findById(match.referee);
      if (current && this.actsAs(current, userId)) return;
    }
    throw new CustomHttpException(
      'Only a session captain, the pitch owner or the current referee can change the referee',
      HttpStatus.FORBIDDEN,
    );
  }

  private async getUnfinishedMatch(matchId: string) {
    const match = await this.matchRepository.findOne({ _id: matchId });
    if (!match) throw new CustomHttpException('Match not found', HttpStatus.NOT_FOUND);
    if (match.status === MATCH_STATUS.FINISHED) {
      throw new CustomHttpException('This match has finished', HttpStatus.BAD_REQUEST);
    }
    return match;
  }

  // Filters on the referee we read, so two people handing off at the same
  // moment can't silently overwrite each other.
  private async swapReferee(match: any, refereeId: Types.ObjectId | null, userId: string) {
    const updated = await this.matchRepository.findOneAndUpdate(
      { _id: match._id, status: { $ne: MATCH_STATUS.FINISHED }, referee: match.referee ?? null },
      {
        referee: refereeId,
        $push: { refereeHistory: { referee: refereeId, at: new Date(), by: new Types.ObjectId(userId) } },
      },
    );
    if (!updated) {
      throw new CustomHttpException('The referee or match just changed — refresh and try again', HttpStatus.CONFLICT);
    }
    // The old referee's app should stop recording; viewers see who's in charge.
    this.matchEvents
      .emitMatchEvent({
        type: 'referee_changed',
        matchId: updated._id,
        sessionId: updated.session,
        referee: refereeId,
        by: new Types.ObjectId(userId),
      })
      .catch(() => undefined);
    return updated;
  }
}
