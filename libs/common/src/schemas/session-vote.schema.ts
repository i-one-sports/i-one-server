import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';

export enum SESSION_POLL_STATUS {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export enum SESSION_POLL_OUTCOME {
  AWARDED = 'AWARDED',
  // Turnout under the minimum, or nobody voted.
  NO_AWARD = 'NO_AWARD',
}

@Schema({ _id: false })
export class PollTally {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  candidate: Types.ObjectId;

  @Prop({ type: Number, required: true })
  votes: number;
}
export const PollTallySchema = SchemaFactory.createForClass(PollTally);

@Schema({ _id: false })
export class PollResult {
  @Prop({ type: String, enum: Object.values(SESSION_POLL_OUTCOME), required: true })
  outcome: SESSION_POLL_OUTCOME;

  // Everyone tied on the most votes shares the award. Empty for NO_AWARD.
  @Prop({ type: [{ type: SchemaTypes.ObjectId, ref: 'User' }], default: [] })
  winners: Types.ObjectId[];

  @Prop({ type: Number, required: true })
  votesCast: number;

  // Most votes first.
  @Prop({ type: [PollTallySchema], default: [] })
  tallies: PollTally[];
}
export const PollResultSchema = SchemaFactory.createForClass(PollResult);

// "Player of the Session": one poll per session, opened once the session is
// over. Who may vote is fixed when it opens.
@Schema({ timestamps: true, versionKey: false })
export class SessionPoll extends AbstractDocument {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Session', required: true })
  session: Types.ObjectId;

  // Players on a team that played at least one finished match. They are both
  // the voters and the candidates.
  @Prop({ type: [{ type: SchemaTypes.ObjectId, ref: 'User' }], default: [] })
  eligible: Types.ObjectId[];

  @Prop({ type: Date, required: true })
  opensAt: Date;

  // Lagos calendar year voting opened in — the season an award counts toward.
  @Prop({ type: Number, required: true })
  season: number;

  @Prop({ type: Date, required: true })
  closesAt: Date;

  @Prop({ type: String, enum: Object.values(SESSION_POLL_STATUS), default: SESSION_POLL_STATUS.OPEN })
  status: SESSION_POLL_STATUS;

  @Prop({ type: PollResultSchema })
  result?: PollResult;

  @Prop({ type: Date })
  closedAt?: Date;
}
export const SessionPollSchema = SchemaFactory.createForClass(SessionPoll);
SessionPollSchema.index({ session: 1 }, { unique: true });
SessionPollSchema.index({ status: 1, closesAt: 1 });
SessionPollSchema.index({ 'result.winners': 1 });

// One vote per player per session, final once cast. The voter is stored to
// enforce that, but never returned by the API — votes are anonymous to
// other players.
@Schema({ timestamps: true, versionKey: false })
export class SessionVote extends AbstractDocument {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'SessionPoll', required: true })
  poll: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  voter: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  candidate: Types.ObjectId;
}
export const SessionVoteSchema = SchemaFactory.createForClass(SessionVote);
SessionVoteSchema.index({ poll: 1, voter: 1 }, { unique: true });
