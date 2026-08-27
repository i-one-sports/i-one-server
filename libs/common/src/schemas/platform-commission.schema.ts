import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { AbstractDocument } from './abstract.schema';

// Audit trail of platform commission collected. Deliberately NOT modeled as
// a Wallet — there's no "platform user" to own one, and inventing a fake
// system user just to reuse the wallet/ledger machinery would be more
// confusing than a dedicated, append-only record of "we kept this amount
// from this payment." Sum `commissionAmount` over a date range for revenue
// reporting.
@Schema({ timestamps: true, versionKey: false })
export class PlatformCommission extends AbstractDocument {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'SessionPayment', required: true })
  sessionPaymentId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Session', required: true })
  sessionId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  payerId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  ownerId: Types.ObjectId;

  // Kobo — see Wallet.balance for the app-wide currency unit convention.
  @Prop({ type: Number, required: true, min: 0 })
  baseAmount: number;

  @Prop({ type: Number, required: true, min: 0 })
  commissionAmount: number;

  @Prop({ type: Number, required: true, min: 0, max: 100 })
  commissionPercentage: number;

  @Prop({ type: String, required: false })
  paymentReference: string;

  createdAt?: Date;
}

export const PlatformCommissionSchema = SchemaFactory.createForClass(PlatformCommission);

PlatformCommissionSchema.index({ sessionPaymentId: 1 }, { unique: true });
PlatformCommissionSchema.index({ createdAt: -1 });
PlatformCommissionSchema.index({ ownerId: 1, createdAt: -1 });
