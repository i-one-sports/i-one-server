import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { AbstractDocument } from './abstract.schema';

// Reference list of banks, synced from Paystack's GET /bank endpoint.
// Used to populate bank-selection dropdowns and validate bankCode on BankAccount creation.
@Schema({ timestamps: true, versionKey: false })
export class Bank extends AbstractDocument {
  @Prop({ type: Number, required: true, unique: true })
  paystackId: number;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, required: false })
  slug?: string;

  @Prop({ type: String, required: true, unique: true })
  code: string;

  @Prop({ type: String, required: false })
  longcode?: string;

  @Prop({ type: String, required: false })
  gateway?: string;

  @Prop({ type: Boolean, default: false })
  payWithBank: boolean;

  @Prop({ type: Boolean, default: false })
  supportsTransfer: boolean;

  @Prop({ type: Boolean, default: false })
  availableForDirectDebit: boolean;

  @Prop({ type: Boolean, default: true })
  active: boolean;

  @Prop({ type: String, default: 'Nigeria' })
  country: string;

  @Prop({ type: String, default: 'NGN' })
  currency: string;

  @Prop({ type: String, required: false })
  type?: string;

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const BankSchema = SchemaFactory.createForClass(Bank);

BankSchema.index({ name: 1 });
