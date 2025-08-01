import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';
import { MATCH_TYPE } from '../types/common';

@Schema({ timestamps: true })
export class Match extends AbstractDocument {
  @Prop({ type: Types.ObjectId, ref: 'Set' })
  teamOne: string;

  @Prop({ type: Types.ObjectId, ref: 'Set' })
  teamTwo: string;

  @Prop({ type: Number, default: 0 })
  teamOneScore: number;

  @Prop({ type: Number, default: 0 })
  teamTwoScore: number;

  @Prop({ type: Boolean, default: false })
  isStarted: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Session' })
  session: string;

  @Prop({type: String, default: MATCH_TYPE.FRIENDLY})
  matchType: MATCH_TYPE;
}

export const MatchSchema = SchemaFactory.createForClass(Match);
