import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";
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

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  captain: string;
}
export const TeamSchema = SchemaFactory.createForClass(Team);