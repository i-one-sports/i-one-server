import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';
import { LocationCoordinates } from '../types/common';
import { PLAYER_POSITION, USER_ROLE } from '../types/common';

@Schema({ timestamps: true })
export class User extends AbstractDocument {
  @Prop(String)
  firstName: string;

  @Prop(String)
  lastName: string;

  @Prop(Number)
  height: number;

  @Prop({ type: String, unique: true })
  email: string;

  @Prop(Date)
  dateOfBirth: Date;

  @Prop(String)
  nickname: string;

  @Prop(String)
  avatar?: string

  @Prop()
  password: string;

  @Prop()
  address: string;

  @Prop()
  phoneNumber: string;

  @Prop({ type: String, enum: PLAYER_POSITION })
  position: PLAYER_POSITION;

  @Prop({ default: false })
  isOwner: boolean;

  @Prop({ type: String, enum: USER_ROLE, default: USER_ROLE.USER })
  role: USER_ROLE;

  @Prop({ type: Types.ObjectId, ref: 'Wallet', required: false })
  walletId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Session', default: null })
  currentSession: string;

  @Prop({ type: Number, default: null })
  otp: number;

  @Prop({ type: Date, default: null })
  otpExpiration: Date;

  @Prop({ type: Boolean, default: null })
  otpVerified: boolean;

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
export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ location: '2dsphere' });
UserSchema.index({ walletId: 1 }, { sparse: true });
