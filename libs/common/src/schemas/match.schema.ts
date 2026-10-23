import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';
import { MATCH_DECIDED_BY, MATCH_EVENT_TYPE, MATCH_RESULT_STATUS, MATCH_STATUS, MATCH_TYPE } from '../types/common';

@Schema({ _id: false })
export class GoalScorer {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  player: Types.ObjectId;

  @Prop({ type: String, enum: ['teamOne', 'teamTwo'], required: true })
  team: 'teamOne' | 'teamTwo';

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  assistedBy?: Types.ObjectId;

  // The GOAL event this came from, so an undo removes exactly this entry.
  // Missing on goals recorded before the event log existed.
  @Prop({ type: String })
  eventId?: string;

  // The roster entry refereeing when the goal was recorded. Missing on goals
  // recorded before referees existed.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'SessionReferee' })
  recordedBy?: Types.ObjectId;

  @Prop({ type: Date })
  recordedAt?: Date;
}

export const GoalScorerSchema = SchemaFactory.createForClass(GoalScorer);

// One row per referee change on a match: assigned, handed off, or removed (referee: null).
@Schema({ _id: false })
export class RefereeChange {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'SessionReferee', default: null })
  referee: Types.ObjectId | null;

  @Prop({ type: Date, required: true })
  at: Date;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  by: Types.ObjectId;
}

export const RefereeChangeSchema = SchemaFactory.createForClass(RefereeChange);

// One row per score change. `eventId` comes from the phone (one per tap,
// reused on retries) so a retried request is recognised and not applied twice.
@Schema({ _id: false })
export class MatchEvent {
  @Prop({ type: String, required: true })
  eventId: string;

  @Prop({ type: String, enum: Object.values(MATCH_EVENT_TYPE), required: true })
  type: MATCH_EVENT_TYPE;

  @Prop({ type: String, enum: ['teamOne', 'teamTwo'], required: true })
  team: 'teamOne' | 'teamTwo';

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  scorer?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  assistedBy?: Types.ObjectId;

  // UNDO only: the eventId of the goal it cancelled (null when undoing a goal
  // from before the event log existed).
  @Prop({ type: String, default: undefined })
  undoes?: string | null;

  // Who sent it, and the referee roster entry if the match had one.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  recordedByUser: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'SessionReferee', default: null })
  referee: Types.ObjectId | null;

  @Prop({ type: Date, required: true })
  at: Date;
}

export const MatchEventSchema = SchemaFactory.createForClass(MatchEvent);

@Schema({ timestamps: true })
export class Match extends AbstractDocument {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Set' })
  teamOne: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Set' })
  teamTwo: string;

  @Prop({ type: Number, default: 0 })
  teamOneScore: number;

  @Prop({ type: Number, default: 0 })
  teamTwoScore: number;

  // Deprecated — kept in sync with `status === LIVE` so older app builds keep
  // working. Read `status` instead.
  @Prop({ type: Boolean, default: false })
  isStarted: boolean;

  @Prop({ type: String, enum: Object.values(MATCH_STATUS), default: MATCH_STATUS.SCHEDULED })
  status: MATCH_STATUS;

  // Game number within the session (1, 2, 3…). Unique per session, see index below.
  @Prop({ type: Number, min: 1 })
  sequence: number;

  // Teams waiting while this game is played, front of the queue first. Under
  // WINNER_STAYS teamOne is the team that stayed on and teamTwo the one coming
  // on. Deliberately has no default: matches created before rotation existed
  // don't have it, and endMatch uses that to skip creating a next game for them.
  @Prop({ type: [{ type: SchemaTypes.ObjectId, ref: 'Set' }], default: undefined })
  waiting: Types.ObjectId[];

  @Prop({ type: Date })
  startedAt: Date;

  @Prop({ type: Date })
  endedAt: Date;

  // null on a draw that stayed a draw (round robin, or BOTH_OFF).
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Set', default: null })
  winner: Types.ObjectId | null;

  @Prop({ type: String, enum: Object.values(MATCH_DECIDED_BY) })
  decidedBy: MATCH_DECIDED_BY;

  // Set when a draw was settled on penalties. Shootout goals never touch the
  // score or goalScorers.
  @Prop({ type: String, enum: ['teamOne', 'teamTwo'] })
  penaltyWinner: 'teamOne' | 'teamTwo';

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Session' })
  session: string;

  @Prop({ type: String, default: MATCH_TYPE.FRIENDLY })
  matchType: MATCH_TYPE;

  @Prop({ type: [GoalScorerSchema], default: [] })
  goalScorers: GoalScorer[];

  // Goes up by 1 on every goal and undo, never on anything else. Each score
  // change must name the version it was made against, so a retry or a
  // duplicate tap from an out-of-date screen is rejected (409) instead of
  // counting twice. Missing (= 0) on matches from before it existed.
  @Prop({ type: Number, default: 0, min: 0 })
  scoreVersion: number;

  @Prop({ type: [MatchEventSchema], default: [] })
  events: MatchEvent[];

  // Current referee (a SessionReferee roster entry), or null: unofficiated.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'SessionReferee', default: null })
  referee: Types.ObjectId | null;

  @Prop({ type: [RefereeChangeSchema], default: [] })
  refereeHistory: RefereeChange[];

  // Set when the match ends. Only CONFIRMED results may feed stats.
  @Prop({ type: String, enum: Object.values(MATCH_RESULT_STATUS) })
  resultStatus: MATCH_RESULT_STATUS;

  // Who confirmed or disputed a PENDING_CONFIRMATION result.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  confirmedBy: Types.ObjectId;

  @Prop({ type: Date })
  confirmedAt: Date;

  // Referee-mode results count straight away; until this time the opposing
  // side can still dispute them. After it, they become CONFIRMED.
  @Prop({ type: Date })
  reviewUntil: Date;

  // Set once PlayerMatchStat rows are written. A counted match without it is
  // picked up by the repair job, so a crash mid-way can't lose stats.
  @Prop({ type: Date })
  statsPostedAt: Date;
}

export const MatchSchema = SchemaFactory.createForClass(Match);
// Backstop against two "next game" documents for the same slot. Partial so
// matches created before `sequence` existed don't collide on null before the
// migration (src/helpers/migrate-match-rotation.ts) numbers them.
MatchSchema.index({ referee: 1, status: 1 });
MatchSchema.index(
  { session: 1, sequence: 1 },
  { unique: true, partialFilterExpression: { sequence: { $exists: true } } },
);
