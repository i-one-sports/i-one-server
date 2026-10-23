import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';
import { MATCH_OUTCOME, PLAYER_POSITION } from '../types/common';

// One row per player per counted match — the stats equivalent of a ledger
// entry. Written once when a result counts (MatchStatsService.postMatchStats),
// never edited; a result that's thrown out marks its rows void. Profile
// totals are always summed from these rows, never kept as counters.
@Schema({ timestamps: true, versionKey: false })
export class PlayerMatchStat extends AbstractDocument {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Match', required: true })
  match: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Session', required: true })
  session: Types.ObjectId;

  // The Set (team) the player was on in this match.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Set', required: true })
  team: Types.ObjectId;

  @Prop({ type: String, enum: ['teamOne', 'teamTwo'], required: true })
  side: 'teamOne' | 'teamTwo';

  // Lagos calendar year the match ended in.
  @Prop({ type: Number, required: true })
  season: number;

  @Prop({ type: Number, default: 0, min: 0 })
  goals: number;

  @Prop({ type: Number, default: 0, min: 0 })
  assists: number;

  // Goals the player's team let in.
  @Prop({ type: Number, default: 0, min: 0 })
  conceded: number;

  // The player's profile position when this match was counted. Frozen here
  // so a later position change never re-rates past matches. Missing on rows
  // written before it was recorded.
  @Prop({ type: String, enum: Object.values(PLAYER_POSITION) })
  position?: PLAYER_POSITION;

  // Defenders only: the team conceded nothing. Decided when the row is
  // written, from `position` above.
  @Prop({ type: Boolean, default: false })
  cleanSheet: boolean;

  // A penalty-shootout winner gets WON (shootout goals never count as goals).
  @Prop({ type: String, enum: Object.values(MATCH_OUTCOME), required: true })
  result: MATCH_OUTCOME;

  @Prop({ type: Date, required: true })
  playedAt: Date;

  @Prop({ type: Boolean, default: false })
  void: boolean;
}

export const PlayerMatchStatSchema = SchemaFactory.createForClass(PlayerMatchStat);
// A match can never be counted twice for the same player.
PlayerMatchStatSchema.index({ match: 1, user: 1 }, { unique: true });
PlayerMatchStatSchema.index({ user: 1, void: 1, season: 1 });
