import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';

// A pass lasts 30 days from when it starts (MP-2).
export const MONTHLY_PASS_DAYS = 30;

export enum MONTHLY_PASS_STATUS {
  // Checkout opened, not paid yet. Lapses after 30 minutes (expiry job).
  PENDING = 'PENDING',
  // Paid. Whether it covers a given time is decided by startsAt/endsAt only:
  // a pass whose startsAt is in the future is "queued" (bought early, MP-3);
  // one whose endsAt has passed is "expired". Neither needs its own status.
  ACTIVE = 'ACTIVE',
  // Checkout abandoned (never paid).
  CANCELLED = 'CANCELLED',
  // Money going back to the player: a late payment on a cancelled checkout,
  // a second charge for a pass already paid (duplicateOf), or a payment that
  // landed after the pitch stopped selling passes.
  REFUND_PENDING = 'REFUND_PENDING',
  REFUNDED = 'REFUNDED',
  REFUND_FAILED = 'REFUND_FAILED',
}

// One player's 30-day pass for one monthly pitch. Prices are snapshotted at
// checkout (kobo), same split as a session payment: the owner is credited
// baseAmount, i-One keeps commissionAmount, processingFee covers Paystack.
@Schema({ timestamps: true, versionKey: false })
export class MonthlyPass extends AbstractDocument {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Location', required: true })
  locationId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  ownerId: Types.ObjectId;

  // Kobo. What the owner is credited (the pitch's pass price at checkout).
  @Prop({ type: Number, required: true, min: 0 })
  baseAmount: number;

  @Prop({ type: Number, required: true, min: 0 })
  commissionAmount: number;

  @Prop({ type: Number, required: true, min: 0, max: 100 })
  commissionPercentage: number;

  @Prop({ type: Number, required: true, min: 0 })
  processingFee: number;

  // Kobo. What the player is charged: baseAmount + commission + processing fee.
  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  @Prop({ type: String, enum: Object.values(MONTHLY_PASS_STATUS), required: true })
  status: MONTHLY_PASS_STATUS;

  // Set when paid. startsAt = max(paid time, end of the player's latest pass
  // at this pitch), endsAt = startsAt + 30 days.
  @Prop({ type: Date, required: false })
  startsAt?: Date;

  @Prop({ type: Date, required: false })
  endsAt?: Date;

  // Current Paystack reference; earlier ones (re-opened checkouts) are kept so
  // a late payment on an old page is still recognised.
  @Prop({ type: String, required: true })
  paymentReference: string;

  @Prop({ type: [String], default: [] })
  previousReferences: string[];

  // The reference that was actually paid.
  @Prop({ type: String, required: false })
  paidReference?: string;

  @Prop({ type: Date, required: false })
  paidAt?: Date;

  // What Paystack charged us for the payment, when known.
  @Prop({ type: Number, required: false, min: 0 })
  paystackFee?: number;

  // Owner-wallet credit for this pass.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Transaction', required: false })
  transactionId?: Types.ObjectId;

  // When an unpaid checkout lapses.
  @Prop({ type: Date, required: true })
  expiresAt: Date;

  // Set on a row recording a second charge for a pass that was already paid.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'MonthlyPass', required: false })
  duplicateOf?: Types.ObjectId;

  @Prop({ type: String, required: false })
  refundReason?: string;

  @Prop({ type: String, required: false })
  refundReference?: string;

  @Prop({ type: Date, required: false })
  refundedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MonthlyPassSchema = SchemaFactory.createForClass(MonthlyPass);

MonthlyPassSchema.index({ paymentReference: 1 }, { unique: true });
// At most one open (unpaid) checkout per player per pitch. This is what makes
// pass dates safe to compute: only one pass per player per pitch can be
// waiting to activate, so two can never be dated on top of each other.
MonthlyPassSchema.index(
  { userId: 1, locationId: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' }, name: 'one_pending_pass_per_player_per_pitch' },
);
MonthlyPassSchema.index({ userId: 1, locationId: 1, endsAt: -1 });
MonthlyPassSchema.index({ status: 1, expiresAt: 1 });
MonthlyPassSchema.index({ locationId: 1, status: 1, endsAt: -1 });
MonthlyPassSchema.index({ paidReference: 1 }, { sparse: true });
MonthlyPassSchema.index({ previousReferences: 1 });
