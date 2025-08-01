import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { AbstractDocument } from './abstract.schema';
import { LocationCoordinates } from '../types/common';

@Schema()
export class Location extends AbstractDocument {
  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: String })
  address: string;

  @Prop({ type: Boolean, default: false})
  booked: boolean

  @Prop()
  pitchPhoto?: string

  @Prop({
    type: {
      type: String,
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      default: [0, 0],
    },
  })
  location: LocationCoordinates;
}

export const LocationSchema = SchemaFactory.createForClass(Location);
LocationSchema.index({ location: '2dsphere' });
