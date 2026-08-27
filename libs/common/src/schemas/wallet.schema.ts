import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';

@Schema({ timestamps: true, versionKey: false })
export class Wallet extends AbstractDocument {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  // All money fields in this app are kobo (naira × 100) — matches
  // Paystack's native unit, avoids floating point issues entirely.
  // Frontend converts to/from naira for display; the backend never does.
  @Prop({ type: Number, default: 0, min: 0 })
  balance: number;

  @Prop({ type: String, enum: ['ACTIVE', 'SUSPENDED', 'CLOSED'], default: 'ACTIVE' })
  status: string;

  @Prop({ type: String, default: 'NGN' })
  currency: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);

// Indexes for O(1) performance
WalletSchema.index({ userId: 1 }, { unique: true });
WalletSchema.index({ status: 1 });
WalletSchema.index({ balance: -1 });
