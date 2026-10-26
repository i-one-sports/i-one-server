import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';

export enum BADGE {
  // 7 counted sessions in a row without a goal or an assist.
  LICENCE_TO_MISS = 'LICENCE_TO_MISS',
}

// A badge a player has unlocked. Once ever per badge (unique), private to the
// player until they share it.
@Schema({ timestamps: true, versionKey: false })
export class UserBadge extends AbstractDocument {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(BADGE), required: true })
  badge: BADGE;

  @Prop({ type: Date, required: true })
  unlockedAt: Date;

  // The sessions that earned it, newest first.
  @Prop({ type: [{ type: SchemaTypes.ObjectId, ref: 'Session' }], default: [] })
  sessions: Types.ObjectId[];

  // Set when the app has shown the unlock pop-up.
  @Prop({ type: Date, default: null })
  seenAt: Date | null;

  // Only the player sees it until they share it ("Share am").
  @Prop({ type: Boolean, default: false })
  shared: boolean;
}

export const UserBadgeSchema = SchemaFactory.createForClass(UserBadge);
UserBadgeSchema.index({ user: 1, badge: 1 }, { unique: true });
