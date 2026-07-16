import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
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
  // Defaults to 0 (no commission charged) until a SUPER_ADMIN sets it via
  // PATCH /settings/commission — safe default, since 0 can never overcharge
  // a player, but it does mean commission is NOT live until explicitly
  // configured. Don't treat 0 as "launch ready" for revenue purposes.
  @Prop({ type: Number, default: 0, min: 0, max: 100 })
  commissionPercentage: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  commissionUpdatedBy: Types.ObjectId;

  @Prop({ type: Date, required: false })
  commissionUpdatedAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);
