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
}
