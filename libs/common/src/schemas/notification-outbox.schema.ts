import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';

export enum OUTBOX_STATUS {
  PENDING = 'PENDING',
  SENDING = 'SENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  // Deliberately not sent: past deliverBefore, or no longer relevant (e.g.
  // a reminder for a session that was cancelled or moved). Kept apart from
  // FAILED so failure counts only show real delivery problems.
  SKIPPED = 'SKIPPED',
}

// Why a SENT row didn't also reach the phone, or why a row FAILED.
export enum OUTBOX_PUSH_RESULT {
  PUSHED = 'PUSHED',
  NO_DEVICE = 'NO_DEVICE',
  INVALID_TOKEN = 'INVALID_TOKEN',
  PUSH_DISABLED = 'PUSH_DISABLED',
  RETRYABLE = 'RETRYABLE',
  PERMANENT = 'PERMANENT',
  EXPIRED = 'EXPIRED',
  OBSOLETE = 'OBSOLETE',
}

// One notification to one user. Producers insert a row (fast, never waits
// on FCM); NotificationOutboxService's dispatcher delivers it with retries.
// The row is the delivery record: status, attempts, errors, and whether the
// push actually reached FCM or only went out in-app.
@Schema({ timestamps: true, versionKey: false, collection: 'notificationoutbox' })
export class NotificationOutbox extends AbstractDocument {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  targetUserId: Types.ObjectId;

  @Prop({ type: String, required: true })
  type: string;

  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String, required: true })
  body: string;

  @Prop({ type: Object, required: false })
  payload?: Record<string, any>;

  // Idempotency key — inserting a row with a key that already exists is a
  // no-op, so a producer that runs twice (two servers, a retried tick)
  // can't queue the same notification twice.
  @Prop({ type: String, required: false })
  dedupeKey?: string;

  // Drop instead of delivering after this (e.g. a reminder for a game that
  // has already started).
  @Prop({ type: Date, required: false })
  deliverBefore?: Date;

  @Prop({ type: String, enum: Object.values(OUTBOX_STATUS), default: OUTBOX_STATUS.PENDING })
  status: OUTBOX_STATUS;

  @Prop({ type: Number, default: 0 })
  attempts: number;

  @Prop({ type: Date, default: () => new Date() })
  nextAttemptAt: Date;

  // Lease while a dispatcher is delivering; a crashed server's rows are
  // reclaimed once this passes.
  @Prop({ type: Date, required: false })
  lockedUntil?: Date;

  @Prop({ type: [String], default: [] })
  deliveredVia: string[];

  @Prop({ type: String, enum: Object.values(OUTBOX_PUSH_RESULT), required: false })
  pushResult?: OUTBOX_PUSH_RESULT;

  @Prop({ type: String, required: false })
  fcmMessageId?: string;

  @Prop({ type: String, required: false })
  lastError?: string;

  @Prop({ type: Date, required: false })
  sentAt?: Date;

  // Set when the row reaches a final status; TTL removes it after that.
  @Prop({ type: Date, required: false })
  expireAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const NotificationOutboxSchema = SchemaFactory.createForClass(NotificationOutbox);

NotificationOutboxSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
NotificationOutboxSchema.index({ status: 1, nextAttemptAt: 1 });
NotificationOutboxSchema.index({ status: 1, lockedUntil: 1 });
NotificationOutboxSchema.index({ type: 1, status: 1, createdAt: -1 });
NotificationOutboxSchema.index({ targetUserId: 1, createdAt: -1 });
// "Already queued?" lookups by producers (e.g. session reminders by sessionId).
NotificationOutboxSchema.index({ type: 1, 'payload.sessionId': 1 });
NotificationOutboxSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
