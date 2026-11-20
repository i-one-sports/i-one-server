import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { AbstractRepository, WebhookEvent } from '@app/common';

@Injectable()
export class WebhookEventRepository extends AbstractRepository<WebhookEvent> {
  protected readonly logger = new Logger(WebhookEventRepository.name);

  constructor(
    @InjectModel(WebhookEvent.name) model: Model<WebhookEvent>,
    @InjectConnection() connection: Connection,
  ) {
    super(model, connection);
  }

  // The subset of `eventIds` (Paystack references) whose webhook has been
  // fully processed.
  async processedEventIds(eventIds: string[]): Promise<Set<string>> {
    if (!eventIds.length) return new Set();
    const rows = await this.model
      .find({ eventId: { $in: eventIds }, processed: true })
      .select('eventId')
      .lean<Array<{ eventId: string }>>();
    return new Set(rows.map((row) => row.eventId));
  }
}
