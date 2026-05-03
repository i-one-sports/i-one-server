import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';

@Schema({ timestamps: true, versionKey: false })
export class Set extends AbstractDocument {
  @Prop({ type: Types.ObjectId, ref: 'Session' })
  session: Types.ObjectId;

  @Prop(String)
  name: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }] })
  players: string[];
}
export const SetSchema = SchemaFactory.createForClass(Set);
