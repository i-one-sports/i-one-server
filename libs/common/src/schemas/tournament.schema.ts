import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { TournamentFormat, TournamentStatus } from "../typings/global.interface";
import { Types } from "mongoose";
import { Team } from "./team.schema";
import { Group } from "./group.schema";
import { TournamentMatch } from "./tournament-match.schema";
import { User } from "./user.schema";
import { TournamentLocation } from "./tournament-location.schema";
import { AbstractDocument } from "./abstract.schema";

@Schema({ timestamps: true })
export class Tournament extends AbstractDocument {
  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: [Object] })
  locations: TournamentLocation[];

  @Prop({ default: 0 })
  prizeMoney: number;

  @Prop({ required: true, unique: true, match: /^[a-zA-Z0-9_-]+$/ })
  tag: string;

  @Prop({ default: 0 })
  registrationFee: number;

  @Prop({ default: TournamentStatus.REGISTRATION })
  status: string;

  @Prop({ default: TournamentFormat.UCL_CLASSIC })
  format: string;

  @Prop({ default: 32 })
  maxTeams: number;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Team' }] })
  registeredTeams: string[];

  @Prop({ type: [Object] })
  groups: Group[];

  @Prop({ type: [Object] })
  matches: TournamentMatch[];

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  organizer: string;

  @Prop({ default: Date.now })
  registrationDeadline: Date;

  @Prop({ default: Date.now })
  startDate: Date;

  @Prop({ default: Date.now })
  endDate: Date;
}
export const TournamentSchema = SchemaFactory.createForClass(Tournament);