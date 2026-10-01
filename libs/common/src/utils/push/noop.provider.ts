import { Logger } from '@nestjs/common';
import { BasePushProvider } from './base-push.provider';
import { PushMessage } from './push-provider.interface';

export class NoopPushProvider extends BasePushProvider {
  protected readonly logger = new Logger(NoopPushProvider.name);

  protected async dispatch(message: PushMessage): Promise<void> {
    this.logger.warn(`[noop push] Would send "${message.title}" — no real provider configured.`);
  }
}
