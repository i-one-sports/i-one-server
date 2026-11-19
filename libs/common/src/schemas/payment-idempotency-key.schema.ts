import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { AbstractDocument } from './abstract.schema';

export enum IDEMPOTENCY_STATUS {
  // The winning request is talking to Paystack.
  STARTED = 'STARTED',
  // Paystack answered; `response` is the checkout every repeat gets back.
  COMPLETED = 'COMPLETED',
  PAID = 'PAID',
  EXPIRED = 'EXPIRED',
  FAILED = 'FAILED',
}

export const OPEN_IDEMPOTENCY_STATUSES = [IDEMPOTENCY_STATUS.STARTED, IDEMPOTENCY_STATUS.COMPLETED];

@Schema({ _id: false })
export class IdempotencyResponse {
  @Prop({ type: String, required: true })
  authorizationUrl: string;

  @Prop({ type: String })
  accessCode?: string;

  @Prop({ type: String, required: true })
  reference: string;
}
const IdempotencyResponseSchema = SchemaFactory.createForClass(IdempotencyResponse);

// One open checkout per thing being paid for. The key is built by the server
// from what's being paid for (e.g. session-checkout:<sessionId>:<userId>), so
// every tap, retry and device for the same payment lands on the same record.
// The payment's reference itself lives on the payment row and in the ledger;
// `response` is only a copy to hand the same checkout back.
@Schema({ timestamps: true, versionKey: false, collection: 'payment_idempotency_keys' })
export class PaymentIdempotencyKey extends AbstractDocument {
  @Prop({ type: String, required: true })
  key: string;

  @Prop({ type: String, enum: Object.values(IDEMPOTENCY_STATUS), required: true })
  status: IDEMPOTENCY_STATUS;

  @Prop({ type: IdempotencyResponseSchema })
  response?: IdempotencyResponse;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PaymentIdempotencyKeySchema = SchemaFactory.createForClass(PaymentIdempotencyKey);
// The guard: only one open (STARTED / COMPLETED) record per key. Closed ones
// (PAID / EXPIRED / FAILED) free the key for the next checkout.
PaymentIdempotencyKeySchema.index(
  { key: 1 },
  { unique: true, partialFilterExpression: { status: { $in: OPEN_IDEMPOTENCY_STATUSES } } },
);
PaymentIdempotencyKeySchema.index({ 'response.reference': 1 });
// Closed records aren't needed once the payment has settled: MongoDB deletes
// them 30 days after their last change. Open ones are never touched.
PaymentIdempotencyKeySchema.index(
  { updatedAt: 1 },
  {
    expireAfterSeconds: 30 * 24 * 60 * 60,
    partialFilterExpression: { status: { $in: [IDEMPOTENCY_STATUS.PAID, IDEMPOTENCY_STATUS.EXPIRED, IDEMPOTENCY_STATUS.FAILED] } },
  },
);
