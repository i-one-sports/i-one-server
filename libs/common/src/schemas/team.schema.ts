import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { SchemaTypes, Types } from "mongoose";
import { User } from "./user.schema";
import { AbstractDocument } from "./abstract.schema";

@Schema({ timestamps: true, versionKey: false })
export class Team extends AbstractDocument {
  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  logo: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: '' })
  country: string;

  @Prop({ default: '' })
  city: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }] })
  players: string[];

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  captain: string;

  // Shared with Tournament.code — a player-facing join code the captain
  // shares privately so teammates can self-add via joinTeamByCode.
  @Prop({ required: true, unique: true, match: /^[a-zA-Z0-9_-]+$/ })
  code: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Tournament', required: true })
  tournamentId: Types.ObjectId;
}
export const TeamSchema = SchemaFactory.createForClass(Team);
TeamSchema.index({ tournamentId: 1 });