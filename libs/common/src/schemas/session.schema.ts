import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';
import { MATCH_TYPE, SESSION_STATUS, WINNING_DECIDER } from '../types/common';

@Schema({ timestamps: true, versionKey: false })
export class Session extends AbstractDocument {
  @Prop({ type: Types.ObjectId, ref: 'Location' })
  location: string;

  @Prop({ default: 0 })
  playersPerTeam: number;

  @Prop({ default: 0 })
  setNumber: number;

  @Prop({ default: 0 })
  minsPerSet: number;

  @Prop({ default: 0 })
  timeDuration: number;

  @Prop({ default: null })
  startTime: Date;

  @Prop({ default: null })
  stopTime: Date;

  @Prop({ default: WINNING_DECIDER.PENALTY })
  winningDecider: string;

  @Prop({ default: false })
  inProgress: boolean;

  @Prop({ default: false })
  finished: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  captain: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }] })
  members: string[];

  @Prop({ default: 0 })
  maxNumber: number;

  @Prop({ default: false })
  isFull: boolean;

  @Prop({ type:String, default: MATCH_TYPE.FRIENDLY })
  matchType: MATCH_TYPE;

  // Kobo — see Wallet.balance for the app-wide currency unit convention.
  @Prop({ type: Number, required: false, min: 0 })
  paymentAmount: number;

  @Prop({ type: Boolean, default: false })
  paymentRequired: boolean;

  @Prop({ type: Boolean, default: false })
  allPaymentsCompleted: boolean;

  @Prop({ type: Date, required: false })
  paymentDeadline: Date;

  @Prop({ type: String, enum: ['NOT_INITIATED', 'PENDING', 'COMPLETED', 'EXPIRED'], default: 'NOT_INITIATED' })
  paymentStatus: string;

  // Lifecycle status — see SESSION_STATUS for what this does and doesn't track.
  // NOTE: existing session documents predate this field and won't have it set.
  // Read paths that branch on `status` should not assume it's always present
  // until the backfill migration (src/helpers/migrate-session-status.ts) has
  // been run; new documents get the default below automatically.
  @Prop({ type: String, enum: Object.values(SESSION_STATUS), default: SESSION_STATUS.OPEN })
  status: SESSION_STATUS;

  @Prop({ type: Boolean, default: false })
  allRefunded: boolean;
}
export const SessionSchema = SchemaFactory.createForClass(Session);
// Indexes to improve query performance for owner dashboard and session lookups
SessionSchema.index({ startTime: 1 });
SessionSchema.index({ location: 1 });
SessionSchema.index({ paymentRequired: 1, paymentStatus: 1 });
SessionSchema.index({ allPaymentsCompleted: 1 });
SessionSchema.index({ status: 1 });
