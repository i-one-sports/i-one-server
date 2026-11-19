import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { AbstractDocument } from './abstract.schema';
import { SchemaTypes } from 'mongoose';

@Schema()
export class Captain extends AbstractDocument {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  userId: string;

  @Prop({ type: SchemaTypes.ObjectId, required: false, ref: 'Set' })
  sessionId: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Team', required: false })
  teamId: string;
}
export const CaptainSchema = SchemaFactory.createForClass(Captain);
