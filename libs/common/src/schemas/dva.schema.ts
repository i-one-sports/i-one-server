import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';

@Schema({ timestamps: true, versionKey: false })
export class DedicatedVirtualAccount extends AbstractDocument {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Wallet', required: true })
  walletId: Types.ObjectId;

  @Prop({ type: String, required: true })
  accountNumber: string;

  @Prop({ type: String, required: true })
  bankName: string;

  @Prop({ type: String, required: true })
  bankCode: string;

  @Prop({ type: String, required: true })
  accountName: string;

  @Prop({ type: String, required: true, unique: true })
  paystackCustomerCode: string;

  @Prop({ type: String, required: false })
  paystackAccountReference: string;

  @Prop({ type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' })
  status: string;

  @Prop({ type: String, default: 'NGN' })
  currency: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const DvaSchema = SchemaFactory.createForClass(DedicatedVirtualAccount);

// Indexes for fast lookups
DvaSchema.index({ userId: 1 });
DvaSchema.index({ walletId: 1 });
DvaSchema.index({ paystackCustomerCode: 1 }, { unique: true });
DvaSchema.index({ accountNumber: 1 });
