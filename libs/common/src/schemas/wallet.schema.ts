import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';

// OWNER: a pitch owner's wallet (every wallet created before platform
// accounts existed — a missing `kind` means OWNER).
// PLATFORM: i-One's own money — commission and processing-fee surplus,
// minus Paystack fees and commission reversed on refunds. Exactly one exists.
export enum WALLET_KIND {
  OWNER = 'OWNER',
  PLATFORM = 'PLATFORM',
}

@Schema({ timestamps: true, versionKey: false })
export class Wallet extends AbstractDocument {
  @Prop({ type: String, enum: Object.values(WALLET_KIND), default: WALLET_KIND.OWNER })
  kind: WALLET_KIND;

  // Required for OWNER wallets; the PLATFORM wallet belongs to no user.
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: function (this: Wallet) {
      return (this.kind ?? WALLET_KIND.OWNER) === WALLET_KIND.OWNER;
    },
  })
  userId: Types.ObjectId;

  // All money fields in this app are kobo (naira × 100) — matches
  // Paystack's native unit, avoids floating point issues entirely.
  // Frontend converts to/from naira for display; the backend never does.
  // Owner wallets never go below 0 (enforced in WalletService.debitWallet);
  // the PLATFORM wallet may, when Paystack fees exceed what was collected.
  @Prop({ type: Number, default: 0 })
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
// One wallet per user — partial, so wallets without a user (PLATFORM) don't
// collide on a missing userId. Replaces the old plain unique userId index
// (src/helpers/migrate-platform-wallets.ts drops it).
WalletSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } }, name: 'userId_unique_when_set' },
);
// Exactly one PLATFORM wallet.
WalletSchema.index(
  { kind: 1 },
  { unique: true, partialFilterExpression: { kind: WALLET_KIND.PLATFORM }, name: 'one_platform_wallet' },
);
WalletSchema.index({ status: 1 });
WalletSchema.index({ balance: -1 });
