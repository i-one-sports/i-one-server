import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CustomHttpException,
  MATCH_STATUS,
  Match,
  PlayerMatchStat,
  SESSION_POLL_OUTCOME,
  SESSION_POLL_STATUS,
  SESSION_STATUS,
  Session,
  SessionPoll,
  SessionVote,
  Set,
  User,
  lagosParts,
} from '@app/common';
import { NotificationOutboxService } from 'src/notifications/notification-outbox.service';
import { NOTIFICATION_TYPE } from 'src/notifications/notification.types';

export const VOTING_WINDOW_MS = 2 * 60 * 60 * 1000;
// Under this share of eligible players voting, nobody gets the award.
export const MIN_TURNOUT = 0.4;
// Votes are only accepted before closesAt; waiting this long past it before
// counting makes sure a vote accepted at the last moment is in the count.
const CLOSE_GRACE_MS = 30 * 1000;
// How far back the job looks for ended sessions that still need a poll.
const OPEN_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;

const PUBLIC_USER_FIELDS = 'firstName lastName nickname avatar position';

// Player of the Session. Voting opens once a session is over (ended by the
// captain/owner, or past stopTime) and no match is still live; it runs for
// two hours. Players only, one vote each, never for yourself, final once
// cast. Turnout is visible while it runs; the result only after it closes.
@Injectable()
export class VotesService {
  private readonly logger = new Logger(VotesService.name);

  constructor(
    @InjectModel(SessionPoll.name) private readonly pollModel: Model<SessionPoll>,
    @InjectModel(SessionVote.name) private readonly voteModel: Model<SessionVote>,
    @InjectModel(Session.name) private readonly sessionModel: Model<Session>,
    @InjectModel(Match.name) private readonly matchModel: Model<Match>,
    @InjectModel(Set.name) private readonly setModel: Model<Set>,
    @InjectModel(PlayerMatchStat.name) private readonly statModel: Model<PlayerMatchStat>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly outbox: NotificationOutboxService,
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
      await this.voteModel.create({
        _id: new Types.ObjectId(),
        poll: poll._id,
        voter: new Types.ObjectId(voterId),
        candidate: new Types.ObjectId(candidateId),
      });
    } catch (err: any) {
      if (err?.code !== 11000) throw err;
      // Already voted. The same vote again is a retry after a lost response:
      // answer it like the first time. A different vote is a change: refused.
      const existing: any = await this.voteModel.findOne({ poll: poll._id, voter: voterId }).lean();
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
      this.voteModel.countDocuments({ poll: poll._id }),
      this.voteModel.findOne({ poll: poll._id, voter: userId }).select('candidate').lean(),
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
    return this.pollModel.countDocuments({
      'result.winners': new Types.ObjectId(userId),
      ...(season !== undefined && { season }),
    });
  }

  // The share of each session's votes this player got, for the rating.
  // Every closed vote with at least one vote cast counts, whatever the
  // turnout; sessions with no vote (or nobody voting) are left out.
  async voteShares(userId: string, sessionIds: Types.ObjectId[]): Promise<number[]> {
    const polls = await this.pollModel
      .find({ session: { $in: sessionIds }, status: SESSION_POLL_STATUS.CLOSED, 'result.votesCast': { $gt: 0 } })
      .select('result')
      .lean();
    return polls.map((poll: any) => {
      const mine = poll.result.tallies.find((t: any) => t.candidate.toString() === userId)?.votes ?? 0;
      return mine / poll.result.votesCast;
    });
  }

  // ------------------------------------------------------------- the job

  @Cron(CronExpression.EVERY_MINUTE, { name: 'session-votes' })
  async runMaintenance(now = new Date()) {
    const opened = await this.openDuePolls(now);
    const closed = await this.closeDuePolls(now);
    if (opened || closed) this.logger.log(`Polls opened: ${opened}, closed: ${closed}`);
    return { opened, closed };
  }

  // Sessions that are over (ended, or past stopTime) without a poll yet.
  async openDuePolls(now: Date): Promise<number> {
    const sessions = await this.sessionModel
      .find({
        status: { $nin: [SESSION_STATUS.CANCELLED, SESSION_STATUS.REFUNDED] },
        stopTime: { $gte: new Date(now.getTime() - OPEN_LOOKBACK_MS) },
        $or: [{ status: SESSION_STATUS.COMPLETED }, { finished: true }, { stopTime: { $lte: now } }],
      })
      .select('_id')
      .lean();
    if (!sessions.length) return 0;

    const withPoll = new globalThis.Set(
      (await this.pollModel.find({ session: { $in: sessions.map((s) => s._id) } }).select('session').lean()).map((p) =>
        p.session.toString(),
      ),
    );

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
    if (await this.matchModel.exists({ session: sessionId, status: MATCH_STATUS.LIVE })) return false;

    const finished = await this.matchModel
      .find({ session: sessionId, status: MATCH_STATUS.FINISHED })
      .select('teamOne teamTwo')
      .lean();
    if (!finished.length) return false;

    const teamIds = [...new globalThis.Set(finished.flatMap((m: any) => [m.teamOne.toString(), m.teamTwo.toString()]))];
    const sets = await this.setModel.find({ _id: { $in: teamIds } }).select('players').lean();
    const eligible = [...new globalThis.Set(sets.flatMap((s: any) => (s.players ?? []).map((p: any) => p.toString())))];
    if (!eligible.length) return false;

    const closesAt = new Date(now.getTime() + VOTING_WINDOW_MS);
    const res = await this.pollModel.updateOne(
      { session: sessionId },
      {
        $setOnInsert: {
          _id: new Types.ObjectId(),
          session: sessionId,
          eligible: eligible.map((id) => new Types.ObjectId(id)),
          opensAt: now,
          closesAt,
          season: lagosParts(now).year,
          status: SESSION_POLL_STATUS.OPEN,
        },
      },
      { upsert: true },
    );
    if (!res.upsertedCount) return false;

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

  async closeDuePolls(now: Date): Promise<number> {
    const due = await this.pollModel
      .find({ status: SESSION_POLL_STATUS.OPEN, closesAt: { $lte: new Date(now.getTime() - CLOSE_GRACE_MS) } })
      .lean();
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
    const counts = await this.voteModel.aggregate([
      { $match: { poll: poll._id } },
      { $group: { _id: '$candidate', votes: { $sum: 1 } } },
      { $sort: { votes: -1, _id: 1 } },
    ]);
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

    const res = await this.pollModel.updateOne(
      { _id: poll._id, status: SESSION_POLL_STATUS.OPEN },
      { $set: { status: SESSION_POLL_STATUS.CLOSED, result, closedAt: now } },
    );
    if (!res.modifiedCount) return false;

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
    const poll = await this.pollModel.findOne({ session: new Types.ObjectId(sessionId) }).lean();
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
      this.userModel.find({ _id: { $in: poll.eligible } }).select(PUBLIC_USER_FIELDS).lean(),
      this.statModel.aggregate([
        { $match: { session: poll.session, void: false } },
        { $group: { _id: '$user', goals: { $sum: '$goals' }, assists: { $sum: '$assists' } } },
      ]),
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
