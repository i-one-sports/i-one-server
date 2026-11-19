import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';
import { PaymentStatus } from './session-payment.schema';

@Schema({ timestamps: true, versionKey: false })
export class TournamentPayment extends AbstractDocument {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Tournament', required: true })
  tournamentId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Team', required: true })
  teamId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  captainId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Location', required: true })
  locationId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  ownerId: Types.ObjectId;

  // Kobo — see Wallet.balance for the app-wide currency unit convention.
  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  @Prop({ type: String, enum: Object.values(PaymentStatus), default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Prop({ type: String, required: true, unique: true })
  reference: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Transaction', required: false })
  transactionId: Types.ObjectId;

  @Prop({ type: Date, required: false })
  paidAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TournamentPaymentSchema = SchemaFactory.createForClass(TournamentPayment);

TournamentPaymentSchema.index({ tournamentId: 1, teamId: 1 }, { unique: true });
TournamentPaymentSchema.index({ tournamentId: 1, status: 1 });
TournamentPaymentSchema.index({ ownerId: 1, status: 1, createdAt: -1 });
