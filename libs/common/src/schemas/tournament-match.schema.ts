import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";
import { Team } from "./team.schema";
import { TournamentLocation } from "./tournament-location.schema";

@Schema()
export class TournamentMatch {
  @Prop({ type: Types.ObjectId, ref: 'Team' })
  homeTeam: string;

  @Prop({ type: Types.ObjectId, ref: 'Team' })
  awayTeam: string;

  @Prop({ default: null })
  homeScore: number;

  @Prop({ default: null })
  awayScore: number;

  @Prop({ type: Object })
  location: TournamentLocation;

  @Prop({ default: Date.now })
  scheduledDate: Date;

  @Prop({ default: false })
  completed: boolean;

  @Prop({ default: '' })
  stage: string; // 'group_stage', 'round_of_16', 'quarter_final', 'semi_final', 'final'

  @Prop({ default: '' })
  group: string; // For group stage matches: 'A', 'B', 'C', etc.
}
export const TournamentMatchSchema = SchemaFactory.createForClass(TournamentMatch);