import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Types } from 'mongoose';
import { lagosTimeLabel, NotificationOutbox, SESSION_CANCEL_REASON } from '@app/common';
import { LocationRepository } from 'src/locations/locations.repository';
import { UserRepository } from 'src/users/users.repository';
import { NotificationOutboxService } from 'src/notifications/notification-outbox.service';
import { NotificationService } from 'src/notifications/notification.service';
import { NOTIFICATION_TYPE } from 'src/notifications/notification.types';
import { LifecycleSession, SessionRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';

const MINUTE = 60 * 1000;
// A paid session not ready this long after kick-off is cancelled and refunded.
export const AUTO_CANCEL_AFTER_KICKOFF_MS = 10 * MINUTE;
// …and everyone is warned this long after kick-off (3 minutes before that).
export const AT_RISK_WARNING_AFTER_KICKOFF_MS = 7 * MINUTE;
// A session nobody ended is closed this long after its end time.
export const CLOSE_OUT_AFTER_END_MS = 30 * MINUTE;
// A session started but never given a date is cancelled after this.
export const DRAFT_TTL_MS = 24 * 60 * MINUTE;

// Per tick. Auto-cancel is smaller because each one asks Paystack for
// refunds; anything left over is picked up next minute.
const AUTO_CANCEL_LIMIT = 50;
const BULK_LIMIT = 200;

const NOT_READY = { paymentRequired: true, paymentStatus: { $ne: 'COMPLETED' } };

type NoticeKind = 'at-risk' | 'auto-cancelled';
type Notice = { session: LifecycleSession; paidUserIds?: Set<string> };
type MemberRow = { _id: Types.ObjectId; email?: string; firstName?: string };

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Closes sessions out so nothing is left hanging (see the plan "Session
// lifecycle"):
//   • paid, not ready at kick-off + 7 min  → warn every member (push + email)
//   • paid, not ready at kick-off + 10 min → cancel, refund, tell everyone
//   • over for 30 min, nobody tapped End   → mark completed
//   • a draft never given a date for 24 h  → cancel
// Players stay members throughout — only the session's state changes.
// Every change is a conditional update, so overlapping ticks, several
// servers, or a manual tap at the same moment can't act twice.
@Injectable()
export class SessionLifecycleService implements OnModuleInit {
  private readonly logger = new Logger(SessionLifecycleService.name);
  private running = false;

  constructor(
    private readonly sessions: SessionRepository,
    private readonly sessionsService: SessionsService,
    private readonly users: UserRepository,
    private readonly locations: LocationRepository,
    private readonly outbox: NotificationOutboxService,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit() {
    // A queued "will be cancelled" push is dropped if the session got paid
    // or was cancelled before it went out.
    this.outbox.registerRelevanceCheck(NOTIFICATION_TYPE.SESSION_AT_RISK, (row) => this.stillAtRisk(row));
  }

  @Cron(CronExpression.EVERY_MINUTE, { name: 'session-lifecycle' })
  async tick(): Promise<void> {
    if (this.running) return; // a slow tick never overlaps the next one
    this.running = true;
    try {
      await this.run(new Date());
    } finally {
      this.running = false;
    }
  }

  // Each step runs even if another failed.
  async run(now: Date): Promise<void> {
    const steps: Array<[string, () => Promise<number>]> = [
      ['warned', () => this.warnAtRisk(now)],
      ['auto-cancelled', () => this.autoCancel(now)],
      ['closed out', () => this.closeOut(now)],
      ['drafts cancelled', () => this.cancelStaleDrafts(now)],
    ];
    const done: string[] = [];
    for (const [label, step] of steps) {
      try {
        const count = await step();
        if (count > 0) done.push(`${count} ${label}`);
      } catch (error: unknown) {
        this.logger.error(`session-lifecycle: "${label}" step failed: ${errorMessage(error)}`);
      }
    }
    if (done.length) this.logger.log(`session-lifecycle: ${done.join(', ')}`);
  }

  // Paid sessions still not ready 7–10 minutes after kick-off.
  async warnAtRisk(now: Date): Promise<number> {
    const due = await this.sessions.findPaidNotReady(
      new Date(now.getTime() - AUTO_CANCEL_AFTER_KICKOFF_MS),
      new Date(now.getTime() - AT_RISK_WARNING_AFTER_KICKOFF_MS),
      BULK_LIMIT,
    );
    if (due.length === 0) return 0;
    await this.notify('at-risk', due.map((session) => ({ session })));
    return due.length;
  }

  async autoCancel(now: Date): Promise<number> {
    const due = await this.sessions.findPaidNotReady(null, new Date(now.getTime() - AUTO_CANCEL_AFTER_KICKOFF_MS), AUTO_CANCEL_LIMIT);
    const cancelled: Notice[] = [];
    for (const session of due) {
      try {
        // Only if still not ready: a payment completing right now wins.
        const result = await this.sessionsService.cancelAndRefund(session._id, SESSION_CANCEL_REASON.NOT_READY, NOT_READY);
        if (result) {
          cancelled.push({ session, paidUserIds: new Set(result.refunds.results.map((r) => r.userId)) });
        }
      } catch (error: unknown) {
        this.logger.error(`Auto-cancel of session ${session._id} failed: ${errorMessage(error)}`);
      }
    }
    if (cancelled.length) await this.notify('auto-cancelled', cancelled);
    return cancelled.length;
  }

  async closeOut(now: Date): Promise<number> {
    const due = await this.sessions.findOverdueForCloseOut(new Date(now.getTime() - CLOSE_OUT_AFTER_END_MS), BULK_LIMIT);
    if (due.length === 0) return 0;
    const ids = due.map((s) => s._id);
    const closed = await this.sessions.markEndedManyIfOpen(ids);
    await this.sessionsService.clearCurrentSessionPointers(ids);
    return closed;
  }

  async cancelStaleDrafts(now: Date): Promise<number> {
    const due = await this.sessions.findStaleDrafts(new Date(now.getTime() - DRAFT_TTL_MS), BULK_LIMIT);
    if (due.length === 0) return 0;
    const ids = due.map((s) => s._id);
    const cancelled = await this.sessions.cancelManyIfOpen(ids, SESSION_CANCEL_REASON.NEVER_CONFIGURED, { startTime: null });
    await this.sessionsService.clearCurrentSessionPointers(ids);
    return cancelled;
  }

  // Push + email to every member of these sessions, with a fixed number of
  // queries however many there are: one for pitches, one for members, one
  // outbox write, one batched email request. Emails go only to people whose
  // push was newly queued, so repeated ticks or servers never email twice.
  private async notify(kind: NoticeKind, notices: Notice[]): Promise<void> {
    const pitchIds = [...new Set(notices.map((n) => n.session.location.toString()))].map((id) => new Types.ObjectId(id));
    const memberIds = [...new Set(notices.flatMap((n) => (n.session.members ?? []).map((m) => m.toString())))].map((id) => new Types.ObjectId(id));

    const [pitches, members] = await Promise.all([
      this.locations.findRaw().find({ _id: { $in: pitchIds } }).select('name').lean<Array<{ _id: Types.ObjectId; name?: string }>>(),
      this.users.findRaw().find({ _id: { $in: memberIds }, deletedAt: null }).select('email firstName').lean<MemberRow[]>(),
    ]);
    const pitchName = new Map(pitches.map((p) => [p._id.toString(), p.name || 'your pitch']));
    const memberById = new Map(members.map((m) => [m._id.toString(), m]));

    type Planned = { key: string; userId: string; email?: string; variables: Record<string, string> };
    const planned: Planned[] = [];
    const pushes = notices.flatMap(({ session, paidUserIds }) => {
      const sessionId = session._id.toString();
      const startTime = new Date(session.startTime);
      const time = lagosTimeLabel(startTime);
      const pitch = pitchName.get(session.location.toString()) ?? 'your pitch';
      return (session.members ?? []).flatMap((memberId) => {
        const userId = memberId.toString();
        const member = memberById.get(userId);
        if (!member) return []; // deleted account
        const paid = paidUserIds?.has(userId) ?? false;
        const key = kind === 'at-risk'
          ? `at-risk:${sessionId}:${startTime.toISOString()}:${userId}`
          : `auto-cancelled:${sessionId}:${userId}`;
        planned.push({
          key,
          userId,
          email: member.email,
          variables: kind === 'at-risk'
            ? { firstName: member.firstName || 'there', pitchName: pitch, startTimeLabel: time, minutesLeft: '3' }
            : {
                firstName: member.firstName || 'there',
                pitchName: pitch,
                startTimeLabel: time,
                refundLine: paid
                  ? 'Your payment is being refunded and should reach you within a few working days.'
                  : "You hadn't paid anything, so there's nothing to refund.",
              },
        });
        return [
          kind === 'at-risk'
            ? {
                params: {
                  type: NOTIFICATION_TYPE.SESSION_AT_RISK,
                  targetUserId: userId,
                  title: 'Your game is about to be cancelled',
                  body: `Your ${time} game at ${pitch} will be cancelled in 3 minutes because it isn't fully paid. Pay now to keep it.`,
                  payload: { sessionId, startTime: startTime.toISOString() },
                },
                options: { dedupeKey: key, deliverBefore: new Date(startTime.getTime() + AUTO_CANCEL_AFTER_KICKOFF_MS) },
              }
            : {
                params: {
                  type: NOTIFICATION_TYPE.SESSION_AUTO_CANCELLED,
                  targetUserId: userId,
                  title: 'Game cancelled',
                  body: `Your ${time} game at ${pitch} was cancelled because it wasn't fully paid by kick-off.${paid ? ' Your payment is being refunded.' : ''}`,
                  payload: { sessionId, reason: SESSION_CANCEL_REASON.NOT_READY },
                },
                options: { dedupeKey: key },
              },
        ];
      });
    });

    const newKeys = await this.outbox.enqueueManyReturningKeys(pushes);
    const recipients = planned
      .filter((p) => newKeys.has(p.key) && p.email)
      .map((p) => ({ to: p.email as string, variables: p.variables }));
    if (recipients.length === 0) return;
    await this.notifications.sendEmailBatch({
      type: kind === 'at-risk' ? NOTIFICATION_TYPE.SESSION_AT_RISK : NOTIFICATION_TYPE.SESSION_AUTO_CANCELLED,
      recipients,
    });
  }

  private async stillAtRisk(row: NotificationOutbox): Promise<boolean> {
    const sessionId = (row.payload as { sessionId?: string } | undefined)?.sessionId;
    if (!sessionId || !Types.ObjectId.isValid(sessionId)) return false;
    return this.sessions.isPaidNotReady(new Types.ObjectId(sessionId));
  }
}
