import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';
import { MATCH_TYPE, WINNING_DECIDER } from '../types/common';

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
}
export const SessionSchema = SchemaFactory.createForClass(Session);
// Indexes to improve query performance for owner dashboard and session lookups
SessionSchema.index({ startTime: 1 });
SessionSchema.index({ location: 1 });
