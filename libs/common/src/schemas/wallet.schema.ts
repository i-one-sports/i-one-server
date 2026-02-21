import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';

@Schema({ timestamps: true, versionKey: false })
export class Wallet extends AbstractDocument {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Number, default: 0, min: 0 })
  balance: number;

  @Prop({ type: Number, default: 0, min: 0 })
  ledgerBalance: number;

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
