import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { TournamentStatus, TournamentType } from '../typings/global.interface';
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

// One round-robin fixture in a league tournament.
export interface LeagueFixture {
  matchIndex: number;       // Sequential 0-based index, unique within tournament
  round: number;            // 1-based matchday number
  home: TeamSlot;
  away: TeamSlot;
  homeScore: number | null;
  awayScore: number | null;
  completed: boolean;
  scheduledTime: Date | null;
}

// Denormalized league table row — updated in place ($inc) as results come in,
// so the table never needs to be recomputed from match history.
export interface LeagueStanding {
  teamId: Types.ObjectId;
  name: string;
  logo: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
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

  // Determines whether the tournament runs as a knockout bracket or a
  // round-robin league — drives which of bracket/{fixtures,standings} is used.
  @Prop({ type: String, enum: Object.values(TournamentType), default: TournamentType.KNOCKOUT })
  type: TournamentType;

  @Prop({ default: 90 })
  minutesPerMatch: number;

  @Prop({ default: 5 })
  playersPerTeam: number;

  // Knockout: must be 8, 16, or 32. League: any number >= 2.
  @Prop({ default: 8 })
  maxTeams: number;

  @Prop({ type: [String], default: [] })
  pitches: string[];

  @Prop({ type: [String], default: [] })
  teamPrizes: string[];

  @Prop({ type: [String], default: [] })
  playerPrizes: string[];

  @Prop({ type: [String], default: [] })
  rules: string[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Team' }], default: [] })
  registeredTeams: Types.ObjectId[];

  // ─── Knockout-only ─────────────────────────────────────────────────────────
  // Full bracket — all rounds embedded. Team names/logos are denormalized
  // into each match slot so the bracket can be served without extra queries.
  @Prop({ type: [Object], default: [] })
  bracket: BracketMatch[];

  // ─── League-only ───────────────────────────────────────────────────────────
  // Round-robin fixture list, generated on start.
  @Prop({ type: [Object], default: [] })
  fixtures: LeagueFixture[];

  // Denormalized league table — each row updated in place via $inc as
  // results are recorded, so the table is always O(1) to update and read.
  @Prop({ type: [Object], default: [] })
  standings: LeagueStanding[];

  // O(1) "is the league finished?" check — incremented alongside each
  // result instead of scanning fixtures for completed === true.
  @Prop({ default: 0 })
  totalFixtures: number;

  @Prop({ default: 0 })
  completedFixtures: number;

  // Set when the tournament is completed (final winner for knockout,
  // table-topper for league)
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
TournamentSchema.index({ organizer: 1 });
