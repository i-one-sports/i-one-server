import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';

@Schema({ timestamps: true, versionKey: false })
export class BankAccount extends AbstractDocument {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true })
  accountNumber: string;

  @Prop({ type: String, required: true })
  bankCode: string;

  @Prop({ type: String, required: true })
  bankName: string;

  @Prop({ type: String, required: true })
  accountName: string;

  @Prop({ type: String, required: false })
  paystackRecipientCode: string;

  @Prop({ type: Boolean, default: false })
  isDefault: boolean;

  @Prop({ type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' })
  status: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const BankAccountSchema = SchemaFactory.createForClass(BankAccount);

BankAccountSchema.index({ userId: 1 });
BankAccountSchema.index({ userId: 1, isDefault: 1 });
BankAccountSchema.index({ paystackRecipientCode: 1 }, { sparse: true });
