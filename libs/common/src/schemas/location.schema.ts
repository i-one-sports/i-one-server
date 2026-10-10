import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';
import {
  LocationCoordinates,
  LOCATION_PRICING_OPTION,
  LOCATION_STATUS,
  LOCATION_TIER,
  PITCH_CONDITION,
} from '../types/common';

@Schema({ timestamps: true })
export class Location extends AbstractDocument {
  @Prop({ required: true, type: String })
  name: string;

  // Lowercased, trimmed copy of `name` kept in sync at write time so name
  // search can hit an index directly instead of a case-insensitive regex
  // scan (which can't use a B-tree index).
  @Prop({ required: true, type: String })
  nameLower: string;

  @Prop({ required: true, type: String })
  address: string;

  @Prop({ required: false, type: String })
  openingHour?: string;

  @Prop({ required: false, type: String })
  closingHour?: string;

  @Prop({
    type: String,
    enum: LOCATION_TIER,
    default: LOCATION_TIER.FREE,
    required: true,
  })
  tier: LOCATION_TIER;

  @Prop({
    type: String,
    enum: LOCATION_PRICING_OPTION,
    required: false,
  })
  pricingOption?: LOCATION_PRICING_OPTION;

  // Kobo — see Wallet.balance for the app-wide currency unit convention.
  @Prop({ type: Number, required: false })
  paymentPerPersonHourly?: number;

  // Kobo. Total price of the pitch per hour — what the whole session pays,
  // split however members choose (SESSION_PAYMENT_MODE.POOL). Required for
  // new paid hourly bookings; paymentPerPersonHourly is legacy and only kept
  // for sessions created before pooling.
  @Prop({ type: Number, required: false })
  pricePerHour?: number;

  @Prop({ type: Number, required: false })
  paymentPerPersonMonthly?: number;



  @Prop()
  pitchPhoto?: string;

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

  @Prop({ type: Boolean, default: true })
  friendly: boolean;

  @Prop({ type: Boolean, default: true })
  tournament: boolean;

  // Kobo — see Wallet.balance for the app-wide currency unit convention.
  @Prop({ type: Number, required: false })
  tournamentFee: number;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: false })
  owner?: Types.ObjectId;

  @Prop({ type: String, enum: PITCH_CONDITION, required: false })
  pitchCondition?: PITCH_CONDITION;

  @Prop({ type: String, required: false })
  pitchMax?: string;

  @Prop({ type: String, required: false })
  pitchSize?: string;

  @Prop({
    type: String,
    enum: LOCATION_STATUS,
    default: LOCATION_STATUS.ACTIVE,
  })
  status: LOCATION_STATUS;

  createdAt?: Date;

  updatedAt?: Date;
}

export const LocationSchema = SchemaFactory.createForClass(Location);
LocationSchema.index({ location: '2dsphere' });
LocationSchema.index({ owner: 1 });
LocationSchema.index({ nameLower: 1 });
