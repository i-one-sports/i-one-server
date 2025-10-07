import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { AbstractDocument } from './abstract.schema';
import { Types } from 'mongoose';

@Schema()
export class Captain extends AbstractDocument {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: string;

  @Prop({ type: Types.ObjectId, required: false, ref: 'Set' })
  sessionId: string;

  @Prop({ type: Types.ObjectId, ref: 'Team', required: false })
  teamId: string;
}
export const CaptainSchema = SchemaFactory.createForClass(Captain);
