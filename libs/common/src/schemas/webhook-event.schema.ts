import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { AbstractDocument } from './abstract.schema';

// Every incoming webhook is stored here BEFORE processing.
// The unique index on eventId means if Paystack sends the same event twice,
// the second insert fails — the handler never runs twice on the same payment.
// This is the primary guard against double-credits on wallet funding.
@Schema({ timestamps: true, versionKey: false })
export class WebhookEvent extends AbstractDocument {
  @Prop({ type: String, required: true })
  provider: string; // 'paystack'

  @Prop({ type: String, required: true })
  event: string; // 'charge.success', 'transfer.success', etc.

  @Prop({ type: String, required: true, unique: true })
  eventId: string; // Paystack payment reference — unique per transaction

  @Prop({ type: Object, required: true })
  payload: Record<string, any>;

  @Prop({ type: Boolean, default: false })
  processed: boolean;

  @Prop({ type: Date })
  processedAt?: Date;

  createdAt?: Date;
}

export const WebhookEventSchema = SchemaFactory.createForClass(WebhookEvent);

WebhookEventSchema.index({ processed: 1, createdAt: -1 });
WebhookEventSchema.index({ provider: 1, event: 1 });
