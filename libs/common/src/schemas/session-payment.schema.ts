import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  // Paystack refunds are asynchronous (pending -> processing -> processed,
  // or failed / needs-attention along the way) — see refund.* webhook
  // handling in webhook.service.ts. REFUND_PENDING covers the whole
  // in-flight window; REFUNDED is only set once refund.processed arrives.
  REFUND_PENDING = 'REFUND_PENDING',
  REFUND_NEEDS_ATTENTION = 'REFUND_NEEDS_ATTENTION',
  REFUND_FAILED = 'REFUND_FAILED',
  REFUNDED = 'REFUNDED',
}

@Schema({ timestamps: true, versionKey: false })
export class SessionPayment extends AbstractDocument {
  @Prop({ type: Types.ObjectId, ref: 'Session', required: true })
  sessionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Location', required: true })
  locationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  ownerId: Types.ObjectId;

  // Kobo — see Wallet.balance for the app-wide currency unit convention.
  // What the player is actually charged via Paystack (baseAmount +
  // commissionAmount). This is the figure used for checkout and for
  // verifying the webhook-confirmed amount — unchanged behaviour from
  // before commission existed.
  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  // What the owner is credited — the location's listed price, with no
  // commission deducted. Falls back to `amount` for any payment record
  // created before commission existed (absence = no commission was ever
  // applied to that record, which is the correct legacy behaviour).
  @Prop({ type: Number, required: false, min: 0 })
  baseAmount: number;

  // Platform's cut, added on top of baseAmount to produce `amount`. Never
  // credited to the owner's wallet — see PlatformCommission for the audit
  // trail of where this money is tracked.
  @Prop({ type: Number, required: false, min: 0 })
  commissionAmount: number;

  // Snapshot of Settings.commissionPercentage at the moment this payment
  // was created, so historical payments stay accurate even if the platform
  // commission rate changes later.
  @Prop({ type: Number, required: false, min: 0, max: 100 })
  commissionPercentage: number;

  @Prop({ type: String, enum: Object.values(PaymentStatus), default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Prop({ type: String, required: false })
  paymentReference: string;

  @Prop({ type: Types.ObjectId, ref: 'Transaction', required: false })
  transactionId: Types.ObjectId;

  @Prop({ type: Date, required: false })
  paidAt: Date;

  // Absence means "never refunded" — correct default for every existing
  // record, so no backfill migration needed for this field.
  @Prop({ type: Date, required: false })
  refundedAt: Date;

  // Paystack's refund id (data.id from POST /refund) — lets the refund.*
  // webhook handlers correlate an incoming event back to this payment
  // without relying solely on transaction_reference.
  @Prop({ type: String, required: false })
  refundReference: string;

  @Prop({ type: Date, required: false })
  expiresAt: Date;

  @Prop({ type: Object, required: false })
  metadata: Record<string, any>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const SessionPaymentSchema = SchemaFactory.createForClass(SessionPayment);

// Indexes for fast queries
SessionPaymentSchema.index({ sessionId: 1, userId: 1 }, { unique: true });
SessionPaymentSchema.index({ sessionId: 1, status: 1 });
SessionPaymentSchema.index({ userId: 1, status: 1, createdAt: -1 });
SessionPaymentSchema.index({ ownerId: 1, status: 1, createdAt: -1 });
SessionPaymentSchema.index({ ownerId: 1, locationId: 1, paidAt: -1 });
SessionPaymentSchema.index({ paymentReference: 1 }, { sparse: true, unique: true });
SessionPaymentSchema.index({ expiresAt: 1 }, { sparse: true });
