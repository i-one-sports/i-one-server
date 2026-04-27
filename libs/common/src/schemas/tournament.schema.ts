import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { TournamentStatus } from '../typings/global.interface';
import { Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';

// Denormalized team slot stored inside each bracket match.
// Storing name/logo here avoids populate queries when serving the bracket.
export interface TeamSlot {
  teamId: Types.ObjectId;
  name: string;
  logo: string;
}

export interface BracketMatch {
  matchIndex: number;       // Sequential 0-based index, unique within tournament
  round: number;            // 1-based round number
  roundName: string;        // e.g. 'Quarter-final', 'Semi-final', 'Final'
  home: TeamSlot | null;
  away: TeamSlot | null;
  homeScore: number | null;
  awayScore: number | null;
  winner: TeamSlot | null;
  completed: boolean;
  scheduledTime: Date | null;
  nextMatchIndex: number | null;  // null for the final
  nextMatchSlot: 'home' | 'away' | null;
}

@Schema({ timestamps: true })
export class Tournament extends AbstractDocument {
  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: Types.ObjectId, ref: 'Location', required: true })
  location: Types.ObjectId;

  @Prop({ default: 0 })
  prizeMoney: number;

  @Prop({ required: true, unique: true, match: /^[a-zA-Z0-9_-]+$/ })
  code: string;

  @Prop({ default: 0 })
  registrationFee: number;

  @Prop({ type: String, enum: Object.values(TournamentStatus), default: TournamentStatus.REGISTRATION })
  status: TournamentStatus;

  // Must be 8, 16, or 32
  @Prop({ default: 8 })
  maxTeams: number;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Team' }], default: [] })
  registeredTeams: Types.ObjectId[];

  // Full bracket — all rounds embedded. Team names/logos are denormalized
  // into each match slot so the bracket can be served without extra queries.
  @Prop({ type: [Object], default: [] })
  bracket: BracketMatch[];

  // Set when the final is completed
  @Prop({ type: Object, default: null })
  winner: TeamSlot | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  organizer: Types.ObjectId;

  @Prop({ required: true })
  registrationDeadline: Date;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TournamentSchema = SchemaFactory.createForClass(Tournament);
TournamentSchema.index({ location: 1, status: 1 });
TournamentSchema.index({ code: 1 });
TournamentSchema.index({ organizer: 1 });
