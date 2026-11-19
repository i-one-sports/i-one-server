import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Interval } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import {
  NotificationOutbox,
  OUTBOX_PUSH_RESULT,
  OUTBOX_STATUS,
  PushNotificationService,
} from '@app/common';
import { RedisPubSubService } from 'src/redis/redis-pubsub.service';
import { UserRepository } from 'src/users/users.repository';
import { PushNotificationParams } from './notification.types';

const IN_APP_CHANNEL = 'app:notifications';
// Per dispatcher run (every 5s): up to MAX_PER_RUN rows, delivered by
// CONCURRENCY workers in parallel. Delivery is mostly waiting on Redis/FCM,
// so parallel workers raise throughput without adding real CPU load.
const MAX_PER_RUN = 200;
const CONCURRENCY = 10;
const LEASE_MS = 60 * 1000;
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [30 * 1000, 2 * 60 * 1000, 10 * 60 * 1000];
const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP_SENT_MS = 30 * DAY_MS;
const KEEP_FAILED_MS = 90 * DAY_MS;

export interface EnqueueOptions {
  // Inserting a second row with the same key is a no-op.
  dedupeKey?: string;
  // Don't deliver after this — mark SKIPPED instead.
  deliverBefore?: Date;
}

// Returns false when the notification is no longer worth sending (e.g. the
// session it's about was cancelled). Registered per notification type.
export type OutboxRelevanceCheck = (row: NotificationOutbox) => Promise<boolean>;

type Outcome = 'pushed' | 'inAppOnly' | 'retrying' | 'failed' | 'skipped';

// Notification outbox: producers insert a row and move on; the dispatcher
// below delivers it (in-app stream + FCM push), retries temporary failures,
// and records exactly what happened on the row. Runs on every server —
// rows are claimed atomically with a lease, so each is delivered once.
@Injectable()
export class NotificationOutboxService {
  private readonly logger = new Logger(NotificationOutboxService.name);
  private readonly relevanceChecks = new Map<string, OutboxRelevanceCheck>();
  private dispatching = false;

  constructor(
    @InjectModel(NotificationOutbox.name) private readonly outboxModel: Model<NotificationOutbox>,
    private readonly redisPubSub: RedisPubSubService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly userRepository: UserRepository,
  ) {}

  registerRelevanceCheck(type: string, check: OutboxRelevanceCheck) {
    this.relevanceChecks.set(type, check);
  }

  // Queues a push notification. Never waits on FCM. Returns false if a row
  // with the same dedupeKey already exists.
  async enqueue(params: PushNotificationParams, options: EnqueueOptions = {}): Promise<boolean> {
    try {
      await this.outboxModel.create({
        // AbstractDocument doesn't auto-generate _id (repositories set it).
        _id: new Types.ObjectId(),
        targetUserId: new Types.ObjectId(params.targetUserId),
        type: params.type,
        title: params.title,
        body: params.body,
        payload: params.payload,
        dedupeKey: options.dedupeKey,
        deliverBefore: options.deliverBefore,
        status: OUTBOX_STATUS.PENDING,
        nextAttemptAt: new Date(),
      });
      return true;
    } catch (error: any) {
      if (error?.code === 11000) return false;
      throw error;
    }
  }

  // Queues many notifications in ONE database write. Duplicates (same
  // dedupeKey) are skipped individually; returns how many were new.
  async enqueueMany(items: Array<{ params: PushNotificationParams; options?: EnqueueOptions }>): Promise<number> {
    if (items.length === 0) return 0;

    const now = new Date();
    const docs = items.map(({ params, options = {} }) => ({
      _id: new Types.ObjectId(),
      targetUserId: new Types.ObjectId(params.targetUserId),
      type: params.type,
      title: params.title,
      body: params.body,
      payload: params.payload,
      dedupeKey: options.dedupeKey,
      deliverBefore: options.deliverBefore,
      status: OUTBOX_STATUS.PENDING,
      attempts: 0,
      nextAttemptAt: now,
      deliveredVia: [],
      // Raw collection insert skips Mongoose timestamps; tracking sorts on these.
      createdAt: now,
      updatedAt: now,
    }));

    try {
      // ordered: false → keep inserting past duplicate-key rejections.
      const inserted = await this.outboxModel.collection.insertMany(docs, { ordered: false });
      return inserted.insertedCount;
    } catch (error: any) {
      const writeErrors = error?.writeErrors ?? [];
      const onlyDuplicates =
        writeErrors.length > 0 && writeErrors.every((e: any) => (e.code ?? e.err?.code) === 11000);
      if (!onlyDuplicates) throw error;
      return error.result?.insertedCount ?? error.insertedCount ?? docs.length - writeErrors.length;
    }
  }

  // Payloads of notifications of `type` already queued for any of `values`
  // of payload[field] — lets a producer skip work it has already done.
  async findQueuedPayloads(type: string, field: string, values: string[]): Promise<Record<string, any>[]> {
    if (values.length === 0) return [];
    const rows = await this.outboxModel
      .find({ type, [`payload.${field}`]: { $in: values } }, { payload: 1, _id: 0 })
      .lean();
    return rows.map((r) => r.payload ?? {});
  }

  @Interval('notification-outbox-dispatcher', 5000)
  async dispatchDue() {
    if (this.dispatching) return; // previous run on this server still going
    this.dispatching = true;

    const counts: Record<Outcome, number> = { pushed: 0, inAppOnly: 0, retrying: 0, failed: 0, skipped: 0 };
    let budget = MAX_PER_RUN;

    // Each worker claims a row, delivers it, repeats — until the queue is
    // empty or the run's budget is spent. claimNext() is atomic, so workers
    // never get the same row (the same guarantee that keeps servers apart).
    const worker = async () => {
      while (budget > 0) {
        budget--; // reserve a slot before awaiting (single-threaded, so no race)
        const row = await this.claimNext();
        if (!row) return;
        try {
          counts[await this.deliverRow(row)]++;
        } catch (error: any) {
          // Row stays SENDING; its lease expires and it's retried later.
          this.logger.error(`Outbox delivery of ${row._id} crashed: ${error.message}`);
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    } catch (error: any) {
      this.logger.error(`Outbox dispatch run failed: ${error.message}`);
    } finally {
      this.dispatching = false;
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total > 0) {
      this.logger.log(
        `notification-outbox: ${counts.pushed + counts.inAppOnly} sent (${counts.pushed} push, ` +
          `${counts.inAppOnly} in-app only), ${counts.retrying} retrying, ${counts.failed} failed, ` +
          `${counts.skipped} skipped`,
      );
    }
  }

  // PENDING rows that are due, or SENDING rows whose lease ran out (the
  // server delivering them died). Atomic, so each row goes to one server.
  private async claimNext(): Promise<NotificationOutbox | null> {
    const now = new Date();
    return this.outboxModel
      .findOneAndUpdate(
        {
          $or: [
            { status: OUTBOX_STATUS.PENDING, nextAttemptAt: { $lte: now } },
            { status: OUTBOX_STATUS.SENDING, lockedUntil: { $lt: now } },
          ],
        },
        {
          $set: { status: OUTBOX_STATUS.SENDING, lockedUntil: new Date(now.getTime() + LEASE_MS) },
          $inc: { attempts: 1 },
        },
        { new: true, sort: { nextAttemptAt: 1 } },
      )
      .lean();
  }

  private async deliverRow(row: NotificationOutbox): Promise<Outcome> {
    if (row.deliverBefore && row.deliverBefore.getTime() <= Date.now()) {
      await this.finish(row, OUTBOX_STATUS.SKIPPED, { pushResult: OUTBOX_PUSH_RESULT.EXPIRED });
      return 'skipped';
    }

    const check = this.relevanceChecks.get(row.type);
    if (check && !(await check(row).catch(() => true))) {
      await this.finish(row, OUTBOX_STATUS.SKIPPED, { pushResult: OUTBOX_PUSH_RESULT.OBSOLETE });
      return 'skipped';
    }

    const targetUserId = row.targetUserId.toString();

    // In-app (live stream). Recorded on the row as soon as it succeeds so a
    // retry of a failed push doesn't show the in-app message twice.
    if (!row.deliveredVia?.includes('in_app')) {
      try {
        await this.redisPubSub.publish(
          IN_APP_CHANNEL,
          JSON.stringify({
            targetUserId,
            type: row.type,
            title: row.title,
            body: row.body,
            payload: row.payload,
            timestamp: Date.now(),
          }),
        );
        await this.outboxModel.updateOne({ _id: row._id }, { $addToSet: { deliveredVia: 'in_app' } });
      } catch (error: any) {
        return this.retryOrFail(row, OUTBOX_PUSH_RESULT.RETRYABLE, `In-app publish failed: ${error.message}`);
      }
    }

    // Push (FCM).
    const user = await this.userRepository.findOne({ _id: targetUserId });
    if (!user?.fcmToken) {
      await this.finish(row, OUTBOX_STATUS.SENT, { pushResult: OUTBOX_PUSH_RESULT.NO_DEVICE });
      return 'inAppOnly';
    }

    const result = await this.pushNotificationService.deliver(
      user.fcmToken,
      row.title,
      row.body,
      row.payload ? { payload: JSON.stringify(row.payload) } : undefined,
    );

    if (result.ok === true) {
      await this.finish(row, OUTBOX_STATUS.SENT, {
        pushResult: OUTBOX_PUSH_RESULT.PUSHED,
        fcmMessageId: result.messageId,
        deliveredVia: 'push',
      });
      return 'pushed';
    }

    const error = [result.code, result.message].filter(Boolean).join(': ') || undefined;
    switch (result.reason) {
      case 'NO_DEVICE':
      case 'INVALID_TOKEN':
        // Reached the user in-app; the device just can't take pushes.
        await this.finish(row, OUTBOX_STATUS.SENT, { pushResult: OUTBOX_PUSH_RESULT[result.reason], lastError: error });
        return 'inAppOnly';
      case 'RETRYABLE':
        return this.retryOrFail(row, OUTBOX_PUSH_RESULT.RETRYABLE, error);
      case 'PUSH_DISABLED':
      case 'PERMANENT':
      default:
        await this.finish(row, OUTBOX_STATUS.FAILED, {
          pushResult: OUTBOX_PUSH_RESULT[result.reason] ?? OUTBOX_PUSH_RESULT.PERMANENT,
          lastError: error,
        });
        this.logger.error(`Notification ${row._id} (${row.type}) FAILED: ${error}`);
        return 'failed';
    }
  }

  private async retryOrFail(row: NotificationOutbox, pushResult: OUTBOX_PUSH_RESULT, error?: string): Promise<Outcome> {
    if (row.attempts >= MAX_ATTEMPTS) {
      await this.finish(row, OUTBOX_STATUS.FAILED, { pushResult, lastError: error });
      this.logger.error(`Notification ${row._id} (${row.type}) FAILED after ${row.attempts} attempts: ${error}`);
      return 'failed';
    }

    const backoff = RETRY_BACKOFF_MS[Math.min(row.attempts - 1, RETRY_BACKOFF_MS.length - 1)];
    await this.outboxModel.updateOne(
      { _id: row._id },
      {
        $set: {
          status: OUTBOX_STATUS.PENDING,
          nextAttemptAt: new Date(Date.now() + backoff),
          pushResult,
          lastError: error,
        },
        $unset: { lockedUntil: 1 },
      },
    );
    return 'retrying';
  }

  private async finish(
    row: NotificationOutbox,
    status: OUTBOX_STATUS,
    fields: { pushResult?: OUTBOX_PUSH_RESULT; fcmMessageId?: string; lastError?: string; deliveredVia?: string },
  ) {
    const now = Date.now();
    const keepFor = status === OUTBOX_STATUS.FAILED ? KEEP_FAILED_MS : KEEP_SENT_MS;
    const { deliveredVia, ...rest } = fields;
    await this.outboxModel.updateOne(
      { _id: row._id },
      {
        $set: {
          status,
          ...rest,
          ...(status === OUTBOX_STATUS.SENT ? { sentAt: new Date(now) } : {}),
          expireAt: new Date(now + keepFor),
        },
        $unset: { lockedUntil: 1 },
        ...(deliveredVia ? { $addToSet: { deliveredVia } } : {}),
      },
    );
  }

  // ── Tracking (admin) ──────────────────────────────────────────────────

  async getSummary(sinceHours = 24) {
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
    const rows = await this.outboxModel.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { status: '$status', pushResult: '$pushResult' }, count: { $sum: 1 } } },
    ]);

    const byStatus: Record<string, number> = {};
    const byPushResult: Record<string, number> = {};
    for (const r of rows) {
      byStatus[r._id.status] = (byStatus[r._id.status] ?? 0) + r.count;
      const key = `${r._id.status}:${r._id.pushResult ?? 'none'}`;
      byPushResult[key] = (byPushResult[key] ?? 0) + r.count;
    }

    return {
      since,
      total: rows.reduce((sum, r) => sum + r.count, 0),
      byStatus,
      sent: {
        pushed: byPushResult[`SENT:${OUTBOX_PUSH_RESULT.PUSHED}`] ?? 0,
        inAppOnlyNoDevice: byPushResult[`SENT:${OUTBOX_PUSH_RESULT.NO_DEVICE}`] ?? 0,
        inAppOnlyInvalidToken: byPushResult[`SENT:${OUTBOX_PUSH_RESULT.INVALID_TOKEN}`] ?? 0,
      },
      failed: {
        pushDisabled: byPushResult[`FAILED:${OUTBOX_PUSH_RESULT.PUSH_DISABLED}`] ?? 0,
        permanent: byPushResult[`FAILED:${OUTBOX_PUSH_RESULT.PERMANENT}`] ?? 0,
        retriesExhausted: byPushResult[`FAILED:${OUTBOX_PUSH_RESULT.RETRYABLE}`] ?? 0,
      },
    };
  }

  async list(filter: { status?: string; type?: string; userId?: string }, page = 1, limit = 50) {
    const query: Record<string, any> = {};
    if (filter.status) query.status = filter.status;
    if (filter.type) query.type = filter.type;
    if (filter.userId && Types.ObjectId.isValid(filter.userId)) {
      query.targetUserId = new Types.ObjectId(filter.userId);
    }

    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const [items, total] = await Promise.all([
      this.outboxModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((Math.max(page, 1) - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      this.outboxModel.countDocuments(query),
    ]);

    return { items, pagination: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) } };
  }

  // Puts a FAILED or SKIPPED notification back in the queue.
  async retry(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Notification not found');
    const row = await this.outboxModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), status: { $in: [OUTBOX_STATUS.FAILED, OUTBOX_STATUS.SKIPPED] } },
        {
          $set: { status: OUTBOX_STATUS.PENDING, attempts: 0, nextAttemptAt: new Date() },
          $unset: { expireAt: 1, lockedUntil: 1, deliverBefore: 1 },
        },
        { new: true },
      )
      .lean();
    if (!row) throw new NotFoundException('No failed or skipped notification with that id');
    return row;
  }
}
