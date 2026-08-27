import { Schema, SchemaFactory } from "@nestjs/mongoose";
import { AbstractDocument } from "./abstract.schema";
import { Prop } from "@nestjs/mongoose";
import { SchemaTypes } from "mongoose";


@Schema({timestamps:true, versionKey:false})
export class Stat extends AbstractDocument {
 @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  userId: string;

  @Prop()
  seasonStart: number;

  @Prop()
  seasonEnd: number;

  @Prop({default: 0})
  totalMatches: number;

  @Prop({default:0})
  goals: number;

  @Prop({default:0})
  assists: number;

}

export const StatSchema = SchemaFactory.createForClass(Stat);
