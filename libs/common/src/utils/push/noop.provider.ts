import { Logger } from '@nestjs/common';
import { BasePushProvider } from './base-push.provider';
import { PushMessage, PushResult } from './push-provider.interface';

export class NoopPushProvider extends BasePushProvider {
  protected readonly logger = new Logger(NoopPushProvider.name);

  protected async dispatch(message: PushMessage): Promise<string> {
    this.logger.warn(`[noop push] Would send "${message.title}" — no real provider configured.`);
    return 'noop';
  }

  // Push isn't configured — report that instead of a silent success, so
  // tracked notifications show up as FAILED rather than looking delivered.
  async deliver(message: PushMessage): Promise<PushResult> {
    await this.dispatch(message);
    return { ok: false, reason: 'PUSH_DISABLED', message: 'Push provider not configured (Firebase env vars missing or invalid)' };
  }
}
