import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
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

  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  @Prop({ type: String, enum: Object.values(PaymentStatus), default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Prop({ type: String, required: false })
  paymentReference: string;

  @Prop({ type: Types.ObjectId, ref: 'Transaction', required: false })
  transactionId: Types.ObjectId;

  @Prop({ type: Date, required: false })
  paidAt: Date;

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
SessionPaymentSchema.index({ paymentReference: 1 }, { sparse: true, unique: true });
SessionPaymentSchema.index({ expiresAt: 1 }, { sparse: true });
