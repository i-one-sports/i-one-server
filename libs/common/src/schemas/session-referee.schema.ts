import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';
import { REFEREE_MODE, REFEREE_STATUS } from '../types/common';

// A session's referee roster: someone agrees once per session, then gets
// assigned to individual matches (Match.referee) as long as their own team
// isn't playing in that match.
@Schema({ timestamps: true, versionKey: false })
export class SessionReferee extends AbstractDocument {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Session', required: true })
  session: Types.ObjectId;

  // Set for OWN_PHONE, and for CAPTAIN_DEVICE when the guest's phone number
  // belongs to an i-One account (so it counts toward their referee history).
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  user?: Types.ObjectId;

  // CAPTAIN_DEVICE only.
  @Prop({ type: String, trim: true })
  guestName?: string;

  // CAPTAIN_DEVICE only, stored internationalised (+234…). Used to link the
  // guest to an account and to recognise the same guest twice in a session.
  // Never returned in roster responses.
  @Prop({ type: String })
  guestPhone?: string;

  @Prop({ type: String, enum: Object.values(REFEREE_MODE), required: true })
  mode: REFEREE_MODE;

  // CAPTAIN_DEVICE only: the captain whose login the referee's requests arrive with.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  deviceOwner?: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(REFEREE_STATUS), required: true })
  status: REFEREE_STATUS;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  invitedBy: Types.ObjectId;

  @Prop({ type: Date })
  respondedAt?: Date;
}

export const SessionRefereeSchema = SchemaFactory.createForClass(SessionReferee);
// One roster entry per account, and per guest phone, per session.
SessionRefereeSchema.index(
  { session: 1, user: 1 },
  { unique: true, partialFilterExpression: { user: { $exists: true } } },
);
SessionRefereeSchema.index(
  { session: 1, guestPhone: 1 },
  { unique: true, partialFilterExpression: { guestPhone: { $exists: true } } },
);
SessionRefereeSchema.index({ user: 1 });
