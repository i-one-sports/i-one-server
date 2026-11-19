import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Types } from 'mongoose';
import { CustomHttpException, SESSION_POLL_OUTCOME, SESSION_POLL_STATUS, lagosParts } from '@app/common';
import { NotificationOutboxService } from 'src/notifications/notification-outbox.service';
import { SessionPollRepository } from './session-poll.repository';
import { SessionVoteRepository } from './session-vote.repository';
import { SessionRepository } from 'src/sessions/sessions.repository';
import { MatchRepository } from 'src/matches/matches.repository';
import { SetRepository } from 'src/sets/sets.repository';
import { UserRepository } from 'src/users/users.repository';
import { PlayerMatchStatRepository } from 'src/stats/player-match-stat.repository';
import { NOTIFICATION_TYPE } from 'src/notifications/notification.types';
import { BadgesService } from 'src/badges/badges.service';

export const VOTING_WINDOW_MS = 2 * 60 * 60 * 1000;
// Under this share of eligible players voting, nobody gets the award.
export const MIN_TURNOUT = 0.4;
// Votes are only accepted before closesAt; waiting this long past it before
// counting makes sure a vote accepted at the last moment is in the count.
const CLOSE_GRACE_MS = 30 * 1000;
// How far back the job looks for ended sessions that still need a poll.
const OPEN_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;


// Player of the Session. Voting opens once a session is over (ended by the
// captain/owner, or past stopTime) and no match is still live; it runs for
// two hours. Players only, one vote each, never for yourself, final once
// cast. Turnout is visible while it runs; the result only after it closes.
@Injectable()
export class VotesService {
  private readonly logger = new Logger(VotesService.name);

  constructor(
    private readonly pollRepository: SessionPollRepository,
    private readonly voteRepository: SessionVoteRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly matchRepository: MatchRepository,
    private readonly setRepository: SetRepository,
    private readonly statRepository: PlayerMatchStatRepository,
    private readonly userRepository: UserRepository,
    private readonly outbox: NotificationOutboxService,
    private readonly badges: BadgesService,
  ) {}

  // ---------------------------------------------------------------- voting

  async vote(sessionId: string, voterId: string, candidateId: string) {
    const poll = await this.getPoll(sessionId);
    if (poll.status !== SESSION_POLL_STATUS.OPEN || new Date() >= poll.closesAt) {
      throw new CustomHttpException('Voting has closed', HttpStatus.BAD_REQUEST);
    }
    if (!this.isEligible(poll, voterId)) {
      throw new CustomHttpException('Only players from this session can vote', HttpStatus.FORBIDDEN);
    }
    if (voterId === candidateId) {
      throw new CustomHttpException("You can't vote for yourself", HttpStatus.BAD_REQUEST);
    }
    if (!this.isEligible(poll, candidateId)) {
      throw new CustomHttpException("That player didn't play in this session", HttpStatus.BAD_REQUEST);
    }

    try {
      await this.voteRepository.create({
        _id: new Types.ObjectId(),
        poll: poll._id,
        voter: new Types.ObjectId(voterId),
        candidate: new Types.ObjectId(candidateId),
      });
    } catch (err: any) {
      if (err?.code !== 11000) throw err;
      // Already voted. The same vote again is a retry after a lost response:
      // answer it like the first time. A different vote is a change: refused.
      const existing: any = await this.voteRepository.voteOf(poll._id, voterId);
      if (existing?.candidate.toString() !== candidateId) {
        throw new CustomHttpException("You've already voted — votes can't be changed", HttpStatus.CONFLICT);
      }
    }
    return this.view(sessionId, voterId);
  }

  // What the vote screens need. While voting is open: candidates with their
  // session goals/assists, turnout, and the caller's own vote — never anyone
  // else's or the running tally. After it closes: the result too.
  async view(sessionId: string, userId: string) {
    const poll = await this.getPoll(sessionId);
    const [votesCast, mine, candidates] = await Promise.all([
      this.voteRepository.countFor(poll._id),
      this.voteRepository.voteOf(poll._id, userId),
      this.candidates(poll),
    ]);
    const isEligible = this.isEligible(poll, userId);
    const isOpen = poll.status === SESSION_POLL_STATUS.OPEN && new Date() < poll.closesAt;

    return {
      sessionId,
      status: isOpen ? SESSION_POLL_STATUS.OPEN : SESSION_POLL_STATUS.CLOSED,
      opensAt: poll.opensAt,
      closesAt: poll.closesAt,
      eligibleCount: poll.eligible.length,
      votesCast,
      myVote: (mine as any)?.candidate ?? null,
      canVote: isOpen && isEligible && !mine,
      candidates,
      // Hidden until the result is counted, even in the 30s after closesAt.
      result: poll.status === SESSION_POLL_STATUS.CLOSED ? this.publicResult(poll) : null,
    };
  }

  // Awards for a profile ("Player of the Session ×N"), shared awards included.
  async awardsFor(userId: string, season?: number): Promise<number> {
    return this.pollRepository.countAwards(new Types.ObjectId(userId), season);
  }

  // The share of each session's votes this player got, for the rating.
  // Every closed vote with at least one vote cast counts, whatever the
  // turnout; sessions with no vote (or nobody voting) are left out.
  async voteShares(userId: string, sessionIds: Types.ObjectId[]): Promise<number[]> {
    const polls = await this.pollRepository.closedWithVotes(sessionIds);
    return polls.map((poll: any) => {
      const mine = poll.result.tallies.find((t: any) => t.candidate.toString() === userId)?.votes ?? 0;
      return mine / poll.result.votesCast;
    });
  }

  // ------------------------------------------------------------- the job

  @Cron(CronExpression.EVERY_MINUTE, { name: 'session-votes' })
  async runMaintenance(now = new Date()) {
    const opened = await this.openDuePolls(now);
    const badges = await this.checkBadges();
    const closed = await this.closeDuePolls(now);
    if (opened || closed || badges) this.logger.log(`Polls opened: ${opened}, closed: ${closed}, badges unlocked: ${badges}`);
    return { opened, closed, badges };
  }

  // Sessions that are over (ended, or past stopTime) without a poll yet.
  async openDuePolls(now: Date): Promise<number> {
    const sessions = await this.sessionRepository.findEndedSince(now, OPEN_LOOKBACK_MS);
    if (!sessions.length) return 0;

    const withPoll = await this.pollRepository.sessionsWithPoll(sessions.map((s) => s._id));

    let opened = 0;
    for (const { _id } of sessions) {
      if (withPoll.has(_id.toString())) continue;
      try {
        if (await this.openPoll(_id, now)) opened++;
      } catch (err: any) {
        this.logger.error(`Failed to open voting for session ${_id}: ${err.message}`);
      }
    }
    return opened;
  }

  // Waits while a match is still live, so the last game's goals are in.
  // Safe to run concurrently: the unique {session} index lets one through.
  async openPoll(sessionId: Types.ObjectId, now: Date): Promise<boolean> {
    if (await this.matchRepository.hasLiveMatch(sessionId)) return false;

    const teamIds = await this.matchRepository.teamsWithFinishedMatch(sessionId);
    if (!teamIds.length) return false;

    const sets = await this.setRepository.playersOf(teamIds);
    const eligible = [...new globalThis.Set(sets.flatMap((s: any) => (s.players ?? []).map((p: any) => p.toString())))];
    if (!eligible.length) return false;

    const closesAt = new Date(now.getTime() + VOTING_WINDOW_MS);
    const created = await this.pollRepository.createIfMissing(sessionId, {
      eligible: eligible.map((id) => new Types.ObjectId(id)),
      opensAt: now,
      closesAt,
      season: lagosParts(now).year,
      status: SESSION_POLL_STATUS.OPEN,
    });
    if (!created) return false;

    await this.outbox
      .enqueueMany(
        eligible.map((userId) => ({
          params: {
            type: NOTIFICATION_TYPE.SESSION_VOTE_OPEN,
            targetUserId: userId,
            title: 'Who be the best player?',
            body: 'Vote for Player of the Session. Voting closes in 2 hours.',
            payload: { sessionId: sessionId.toString() },
          },
          options: { dedupeKey: `vote-open:${sessionId}:${userId}`, deliverBefore: closesAt },
        })),
      )
      .catch((err) => this.logger.error(`Queuing vote-open pushes for session ${sessionId} failed`, err));
    return true;
  }

  // A poll opening is the "session is over" moment, so badges are checked
  // here — once per session, for its players only. Polls not yet checked
  // (just opened, or a check that failed) are picked up on the next run.
  async checkBadges(): Promise<number> {
    const pending = await this.pollRepository.pendingBadgeChecks(50);
    let unlocked = 0;
    for (const poll of pending) {
      try {
        unlocked += await this.badges.checkSession(poll.session);
        await this.pollRepository.markBadgesChecked(poll._id);
      } catch (err: any) {
        this.logger.error(`Badge check for session ${poll.session} failed; retrying next run: ${err.message}`);
      }
    }
    return unlocked;
  }

  async closeDuePolls(now: Date): Promise<number> {
    const due = await this.pollRepository.dueToClose(new Date(now.getTime() - CLOSE_GRACE_MS));
    let closed = 0;
    for (const poll of due) {
      try {
        if (await this.closePoll(poll, now)) closed++;
      } catch (err: any) {
        this.logger.error(`Failed to close voting ${poll._id}: ${err.message}`);
      }
    }
    return closed;
  }

  // Counts once: the OPEN filter means a second server closing the same poll
  // changes nothing and sends no second round of pushes.
  async closePoll(poll: any, now: Date): Promise<boolean> {
    const counts = await this.voteRepository.tally(poll._id);
    const tallies = counts.map((c) => ({ candidate: c._id, votes: c.votes }));
    const votesCast = tallies.reduce((sum, t) => sum + t.votes, 0);
    const turnoutOk = votesCast > 0 && votesCast / poll.eligible.length >= MIN_TURNOUT;
    const top = tallies[0]?.votes ?? 0;

    const result = {
      outcome: turnoutOk ? SESSION_POLL_OUTCOME.AWARDED : SESSION_POLL_OUTCOME.NO_AWARD,
      winners: turnoutOk ? tallies.filter((t) => t.votes === top).map((t) => t.candidate) : [],
      votesCast,
      tallies,
    };

    if (!(await this.pollRepository.close(poll._id, result as any, now))) return false;

    const body =
      result.outcome === SESSION_POLL_OUTCOME.AWARDED
        ? 'Voting has closed. See who won Player of the Session.'
        : 'Voting has closed. Not enough players voted for an award this time.';
    await this.outbox
      .enqueueMany(
        poll.eligible.map((userId: Types.ObjectId) => ({
          params: {
            type: NOTIFICATION_TYPE.SESSION_VOTE_RESULT,
            targetUserId: userId.toString(),
            title: 'Player of the Session',
            body,
            payload: { sessionId: poll.session.toString() },
          },
          options: { dedupeKey: `vote-result:${poll.session}:${userId}` },
        })),
      )
      .catch((err) => this.logger.error(`Queuing vote-result pushes for poll ${poll._id} failed`, err));
    return true;
  }

  // ------------------------------------------------------------- helpers

  private async getPoll(sessionId: string): Promise<any> {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new CustomHttpException('Invalid session id', HttpStatus.BAD_REQUEST);
    }
    const poll = await this.pollRepository.findOne({ session: new Types.ObjectId(sessionId) });
    if (!poll) {
      throw new CustomHttpException('Voting for this session has not opened', HttpStatus.NOT_FOUND);
    }
    return poll;
  }

  private isEligible(poll: any, userId: string): boolean {
    return poll.eligible.some((id: Types.ObjectId) => id.toString() === userId);
  }

  // Every eligible player with their counted goals/assists this session
  // (officiated matches only, disputed ones excluded — same rows as stats).
  private async candidates(poll: any) {
    const [users, totals] = await Promise.all([
      this.userRepository.publicProfiles(poll.eligible),
      this.statRepository.sessionTotals(poll.session),
    ]);
    const byUser = new Map(totals.map((t: any) => [t._id.toString(), t]));
    return users.map((user: any) => ({
      user,
      goals: byUser.get(user._id.toString())?.goals ?? 0,
      assists: byUser.get(user._id.toString())?.assists ?? 0,
    }));
  }

  private publicResult(poll: any) {
    const { result } = poll;
    const pct = (votes: number) => (result.votesCast ? Math.round((votes / result.votesCast) * 100) : 0);
    return {
      outcome: result.outcome,
      winners: result.winners,
      votesCast: result.votesCast,
      eligibleCount: poll.eligible.length,
      minTurnout: MIN_TURNOUT,
      tallies: result.tallies.map((t: any) => ({ candidate: t.candidate, votes: t.votes, percent: pct(t.votes) })),
    };
  }
}
