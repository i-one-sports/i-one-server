import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';

// Singleton document — there should only ever be one Settings row. Look it
// up with SettingsService.getSettings(), which creates the default row on
// first read if it doesn't exist yet, rather than relying on a fixed _id.
@Schema({ timestamps: true, versionKey: false })
export class Settings extends AbstractDocument {
  // Platform commission, as a percentage (5 means 5%), added ON TOP of a
  // session's base price when a player checks out. The owner is still
  // credited the full base price — this amount is what the player pays in
  // addition, and it's tracked separately as platform revenue (see
  // PlatformCommission), never credited to any owner wallet.
  //
  // 15% is the business decision (2026-10-15): with the processing fee on
  // top, i-One nets ≥ ₦300 per ₦2,000 share on local cards. Only applies to
  // fresh databases; an existing Settings document keeps its stored value
  // (src/helpers/migrate-platform-wallets.ts sets 15 if it was never set).
  // Change via PATCH /settings/commission.
  @Prop({ type: Number, default: 15, min: 0, max: 100 })
  commissionPercentage: number;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: false })
  commissionUpdatedBy: Types.ObjectId;

  @Prop({ type: Date, required: false })
  commissionUpdatedAt: Date;

  // Kobo. Smallest contribution a player can make into a POOL session (stops
  // ₦1 payments being eaten by Paystack fees). A contribution that exactly
  // clears what's left in the pool is always allowed, even if smaller.
  // Default ₦500 is a placeholder — needs Ops sign-off before launch.
  @Prop({ type: Number, default: 50000, min: 0 })
  minContributionAmount: number;

  // Processing fee charged to players on top of price + commission, so the
  // card processor's fee never comes out of i-One's commission. Same shape
  // as Paystack's pricing (percent + flat fee, flat waived below a
  // threshold, capped). The percent is deliberately above Paystack's ≈1.5%;
  // the surplus is platform income. Kobo except the percent.
  @Prop({ type: Number, default: 1.9, min: 0, max: 100 })
  processingFeePercent: number;

  @Prop({ type: Number, default: 10000, min: 0 })
  processingFeeFlat: number;

  @Prop({ type: Number, default: 250000, min: 0 })
  processingFeeFlatWaivedBelow: number;

  @Prop({ type: Number, default: 200000, min: 0 })
  processingFeeCap: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);
