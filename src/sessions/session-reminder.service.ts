import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Types } from 'mongoose';
import { NotificationOutbox, SESSION_PAYMENT_MODE, SESSION_STATUS, lagosTimeLabel } from '@app/common';
import { PaymentStatus } from '@app/common/schemas/session-payment.schema';
import { SessionPaymentService } from 'src/billing/services/session-payment.service';
import { LocationRepository } from 'src/locations/locations.repository';
import { NotificationOutboxService } from 'src/notifications/notification-outbox.service';
import { NOTIFICATION_TYPE } from 'src/notifications/notification.types';
import { SessionRepository } from './sessions.repository';

const MINUTE = 60 * 1000;
const INACTIVE_STATUSES = [SESSION_STATUS.CANCELLED, SESSION_STATUS.REFUNDED, SESSION_STATUS.COMPLETED];

type ReminderKind = 15 | 5;
type Role = 'member' | 'captain' | 'owner';

interface Reminder {
  userId: string;
  role: Role;
  title: string;
  body: string;
}

const naira = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

// Reminds everyone in a session 15 and 5 minutes before kick-off.
//   Fully paid (or free) → every member: get ready.
//   Not fully paid       → members: pay now; captain: collect payment,
//                          reschedule or cancel; pitch owner: heads-up.
//   Not full yet (paid)  → payment hasn't opened, so members are asked to
//                          invite players instead of to pay.
// Reminders go through the notification outbox (never awaited on FCM,
// retried, tracked). Each reminder has a dedupe key that includes the
// session's start time, so repeated ticks and multiple servers can't
// double-send, and a rescheduled session gets fresh reminders.
@Injectable()
export class SessionReminderService implements OnModuleInit {
  private readonly logger = new Logger(SessionReminderService.name);

  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly locationRepository: LocationRepository,
    private readonly sessionPaymentService: SessionPaymentService,
    private readonly outbox: NotificationOutboxService,
  ) {}

  onModuleInit() {
    // Checked again right before delivery: skip if the session was
    // cancelled or moved, or if a "please pay" reminder no longer applies.
    this.outbox.registerRelevanceCheck(NOTIFICATION_TYPE.SESSION_REMINDER, (row) => this.isStillRelevant(row));
  }

  @Cron(CronExpression.EVERY_MINUTE, { name: 'session-start-reminders' })
  async sendStartReminders() {
    const now = Date.now();
    // Works from a window, not exact times: a missed tick (restart, sleeping
    // host) still sends whichever reminder is current.
    const sessions = await this.sessionRepository
      .findRaw()
      .find({
        status: { $nin: INACTIVE_STATUSES },
        finished: { $ne: true },
        startTime: { $gt: new Date(now), $lte: new Date(now + 15 * MINUTE) },
        'members.0': { $exists: true },
      })
      .lean();
    if (sessions.length === 0) return;

    const due = sessions.map((session: any) => ({
      session,
      kind: (session.startTime.getTime() - now > 5 * MINUTE ? 15 : 5) as ReminderKind,
    }));

    // A session sits in the window for ~10 ticks, on every server. Skip the
    // ones whose reminders are already in the outbox — one query for all —
    // so repeat ticks cost 2 queries instead of rebuilding everything.
    const alreadyQueued = new Set(
      (
        await this.outbox.findQueuedPayloads(
          NOTIFICATION_TYPE.SESSION_REMINDER,
          'sessionId',
          due.map(({ session }) => session._id.toString()),
        )
      ).map((p) => `${p.sessionId}:${p.minutesBefore}:${p.startTime}`),
    );
    const todo = due.filter(
      ({ session, kind }) => !alreadyQueued.has(`${session._id}:${kind}:${session.startTime.toISOString()}`),
    );
    if (todo.length === 0) return;

    try {
      const queued = await this.remindMany(todo, now);
      if (queued > 0) {
        this.logger.log(`session-start-reminders: queued ${queued} reminder(s) for ${todo.length} session(s)`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to queue start reminders for ${todo.length} session(s): ${error.message}`);
    }
  }

  // Builds and queues reminders for many sessions with a fixed number of
  // queries, however many sessions there are: one for pitches, one for
  // payments, one insert. Returns how many new reminders were queued.
  async remindMany(todo: Array<{ session: any; kind: ReminderKind }>, now = Date.now()): Promise<number> {
    const locationIds = [...new Set(todo.map(({ session }) => session.location?.toString()).filter(Boolean))];
    const locations = await this.locationRepository
      .findRaw()
      .find({ _id: { $in: locationIds.map((id) => new Types.ObjectId(id)) } }, { name: 1, owner: 1 })
      .lean();
    const locationById = new Map(locations.map((l: any) => [l._id.toString(), l]));

    // Only paid sessions whose payment has opened need payment rows.
    const needPayments = todo
      .filter(({ session }) => session.paymentRequired && session.paymentStatus !== 'NOT_INITIATED')
      .map(({ session }) => session._id);
    const payments = await this.sessionPaymentService.getPaymentSummaries(needPayments);

    const items = todo.flatMap(({ session, kind }) =>
      this.buildReminders(session, kind, now, locationById.get(session.location?.toString()), payments.get(session._id.toString())),
    );
    return this.outbox.enqueueMany(items);
  }

  // Single-session convenience (same path as the job).
  async remind(session: any, kind: ReminderKind, now = Date.now()): Promise<number> {
    return this.remindMany([{ session, kind }], now);
  }

  // Pure: works out who gets what from data already loaded — no queries.
  private buildReminders(
    session: any,
    kind: ReminderKind,
    now: number,
    location: any,
    payments?: { paidBase: number; rowCount: number; unpaidCount: number; statusByUser: Map<string, PaymentStatus> },
  ) {
    const sessionId = session._id.toString();
    const startTime: Date = session.startTime;
    const pitch = location?.name ?? 'the pitch';
    const time = lagosTimeLabel(startTime);
    const minutesLeft = Math.max(1, Math.ceil((startTime.getTime() - now) / MINUTE));
    const startsIn = `${minutesLeft} min`;
    const members: string[] = Array.from(new Set((session.members ?? []).map((m: any) => m.toString())));

    // Same rules as SessionPaymentService.areAllPaymentsCompleted: a POOL
    // session is paid once the pot is full; PER_PERSON once no row is unpaid.
    const fullyPaid =
      !session.paymentRequired ||
      (session.paymentMode === SESSION_PAYMENT_MODE.POOL
        ? session.paymentStatus === 'COMPLETED'
        : session.paymentStatus !== 'NOT_INITIATED' && (!payments || payments.unpaidCount === 0));

    const reminders: Reminder[] = [];

    if (fullyPaid) {
      for (const userId of members) {
        reminders.push({
          userId,
          role: 'member',
          title: `Kick-off in ${startsIn}`,
          body: `Your game at ${pitch} starts at ${time} — get ready!`,
        });
      }
    } else {
      let shortfall: string;

      if (session.paymentStatus === 'NOT_INITIATED') {
        // Payment only opens once the session is full, so nobody can pay
        // yet — the problem is missing players, not missing money.
        const spots = Math.max(0, (session.maxNumber ?? 0) - members.length);
        const players = spots > 0 ? `${spots} more player${spots === 1 ? '' : 's'}` : 'more players';
        shortfall = `${players} needed`;
        for (const userId of members) {
          reminders.push({
            userId,
            role: 'member',
            title: `Kick-off in ${startsIn} — game not full`,
            body: `Your ${time} game at ${pitch} still needs ${players} before payment opens. Invite friends to join.`,
          });
        }
      } else if (session.paymentMode === SESSION_PAYMENT_MODE.POOL) {
        const remaining = Math.max(0, (session.paymentTarget ?? 0) - (payments?.paidBase ?? 0));
        shortfall = `${naira(remaining)} still needed`;
        for (const userId of members) {
          reminders.push({
            userId,
            role: 'member',
            title: `Payment needed — kick-off in ${startsIn}`,
            body: `${shortfall} for your ${time} game at ${pitch}. Pay now or it can't start.`,
          });
        }
      } else {
        const paidBy = payments?.statusByUser ?? new Map<string, PaymentStatus>();
        const unpaid = members.filter((m) => paidBy.get(m) !== PaymentStatus.PAID);
        shortfall = unpaid.length === 1 ? "1 player hasn't paid" : `${unpaid.length} players haven't paid`;
        for (const userId of members) {
          const owes = unpaid.includes(userId);
          reminders.push({
            userId,
            role: 'member',
            title: owes ? `Payment needed — kick-off in ${startsIn}` : `Kick-off in ${startsIn}`,
            body: owes
              ? `You haven't paid for your ${time} game at ${pitch}. Pay now or it can't start.`
              : `You're paid — waiting on ${unpaid.length} player${unpaid.length === 1 ? '' : 's'} before kick-off at ${time}.`,
          });
        }
      }

      if (session.captain) {
        reminders.push({
          userId: session.captain.toString(),
          role: 'captain',
          title: `Your ${time} game isn't fully paid`,
          body:
            session.paymentStatus === 'NOT_INITIATED'
              ? `Your game at ${pitch} (starts in ${startsIn}) isn't full — ${shortfall}. Invite players, reschedule or cancel.`
              : `${shortfall} for your game at ${pitch} (starts in ${startsIn}). Collect payment, reschedule or cancel.`,
        });
      }

      if (location?.owner) {
        reminders.push({
          userId: location.owner.toString(),
          role: 'owner',
          title: `Unpaid session at ${pitch}`,
          body: `The ${time} session starts in ${startsIn} and isn't fully paid (${shortfall}).`,
        });
      }
    }

    return reminders.map((r) => ({
      params: {
        type: NOTIFICATION_TYPE.SESSION_REMINDER,
        targetUserId: r.userId,
        title: r.title,
        body: r.body,
        payload: {
          sessionId,
          minutesBefore: kind,
          role: r.role,
          fullyPaid,
          startTime: startTime.toISOString(),
        },
      },
      options: {
        dedupeKey: `reminder:${sessionId}:${kind}:${startTime.toISOString()}:${r.userId}:${r.role}`,
        deliverBefore: startTime,
      },
    }));
  }

  private async isStillRelevant(row: NotificationOutbox): Promise<boolean> {
    const payload = row.payload ?? {};
    if (!payload.sessionId || !Types.ObjectId.isValid(payload.sessionId)) return false;

    const session: any = await this.sessionRepository
      .findRaw()
      .findById(payload.sessionId)
      .select('status startTime finished paymentRequired')
      .lean();

    if (!session || session.finished || INACTIVE_STATUSES.includes(session.status)) return false;
    if (session.startTime?.toISOString() !== payload.startTime) return false; // rescheduled

    // A "please pay" reminder is stale once the session is fully paid.
    if (payload.fullyPaid === false && session.paymentRequired) {
      return !(await this.sessionPaymentService.areAllPaymentsCompleted(session._id));
    }
    return true;
  }
}
