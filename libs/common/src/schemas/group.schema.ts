import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";
import { Team } from "./team.schema";

@Schema()
export class Group{
  @Prop({ required: true })
  name: string; // 'A', 'B', 'C', etc.

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Team' }] })
  teams: string[];

  @Prop({ type: [{ type: Object }] })
  standings: {
    team: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    points: number;
  }[];
}
export const GroupSchema = SchemaFactory.createForClass(Group);