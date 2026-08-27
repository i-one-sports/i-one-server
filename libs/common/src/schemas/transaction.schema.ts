import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';

export enum TransactionType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED',
}

export enum TransactionSource {
  SESSION_PAYMENT = 'SESSION_PAYMENT',
  WALLET_FUNDING = 'WALLET_FUNDING',
  TOURNAMENT_REGISTRATION = 'TOURNAMENT_REGISTRATION',
  ADMIN_FUNDING = 'ADMIN_FUNDING',
  WITHDRAWAL = 'WITHDRAWAL',
  TRANSFER = 'TRANSFER',
  REFUND = 'REFUND',
}

@Schema({ timestamps: true, versionKey: false })
export class Transaction extends AbstractDocument {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Wallet', required: true })
  walletId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(TransactionType), required: true })
  type: TransactionType;

  // Kobo — see Wallet.balance for the app-wide currency unit convention.
  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  @Prop({ type: Number, required: true })
  balanceBefore: number;

  @Prop({ type: Number, required: true })
  balanceAfter: number;

  @Prop({ type: String, enum: Object.values(TransactionStatus), default: TransactionStatus.PENDING })
  status: TransactionStatus;

  @Prop({ type: String, enum: Object.values(TransactionSource), required: true })
  source: TransactionSource;

  @Prop({ type: String, required: true })
  reference: string;

  @Prop({ type: String, required: false })
  paystackReference: string;

  @Prop({ type: String, required: false })
  description: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Session', required: false })
  sessionId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: false })
  initiatedBy: Types.ObjectId;

  @Prop({ type: Object, required: false })
  metadata: Record<string, any>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

// Indexes for O(1) or O(log n) performance
TransactionSchema.index({ walletId: 1, createdAt: -1 });
TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ reference: 1 }, { unique: true });
TransactionSchema.index({ paystackReference: 1 }, { sparse: true });
TransactionSchema.index({ sessionId: 1 });
TransactionSchema.index({ status: 1, createdAt: -1 });
TransactionSchema.index({ source: 1, createdAt: -1 });
