import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';

// Ledger entries are the financial source of truth.
// Every balance movement (credit or debit) creates one immutable entry here.
// The wallet balance is just a cached projection of these entries.
// Entries are NEVER edited or deleted — only appended.
@Schema({ timestamps: true, versionKey: false })
export class LedgerEntry extends AbstractDocument {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Wallet', required: true })
  walletId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Transaction', required: true })
  transactionId: Types.ObjectId;

  @Prop({ type: String, enum: ['CREDIT', 'DEBIT'], required: true })
  type: 'CREDIT' | 'DEBIT';

  // Kobo — see Wallet.balance for the app-wide currency unit convention.
  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  @Prop({ type: Number, required: true })
  balanceAfter: number;

  @Prop({ type: String, required: true })
  reason: string;

  createdAt?: Date;
}

export const LedgerEntrySchema = SchemaFactory.createForClass(LedgerEntry);

LedgerEntrySchema.index({ walletId: 1, createdAt: -1 });
LedgerEntrySchema.index({ transactionId: 1 });
