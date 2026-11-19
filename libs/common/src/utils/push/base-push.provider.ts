import { Logger } from '@nestjs/common';
import { PushMessage, PushProvider, PushResult } from './push-provider.interface';

export abstract class BasePushProvider implements PushProvider {
  protected abstract readonly logger: Logger;
  // Returns the provider's message id on success; throws on failure.
  protected abstract dispatch(message: PushMessage): Promise<string>;

  // Set by PushNotificationService so a provider never needs to know about Mongo/User.
  onInvalidToken?: (deviceToken: string) => void;

  // Fire-and-forget: never throws, result only logged.
  async send(message: PushMessage): Promise<void> {
    await this.deliver(message);
  }

  // Same delivery, but reports exactly what happened.
  async deliver(message: PushMessage): Promise<PushResult> {
    if (!message.deviceToken) {
      this.logger.warn('Push skipped: empty deviceToken.');
      return { ok: false, reason: 'NO_DEVICE' };
    }

    try {
      const messageId = await this.dispatch(message);
      this.logger.log(`Push sent to token ${this.maskToken(message.deviceToken)}`);
      return { ok: true, messageId };
    } catch (error: any) {
      this.logger.error(`Push failed for token ${this.maskToken(message.deviceToken)}: ${error.message}`);
      if (this.isInvalidTokenError(error)) {
        this.onInvalidToken?.(message.deviceToken);
        return { ok: false, reason: 'INVALID_TOKEN', code: error?.code, message: error?.message };
      }
      return {
        ok: false,
        reason: this.isRetryableError(error) ? 'RETRYABLE' : 'PERMANENT',
        code: error?.code,
        message: error?.message ?? String(error),
      };
    }
  }

  protected isInvalidTokenError(_error: any): boolean {
    return false;
  }

  // Temporary problems worth retrying. Anything unrecognised is treated as
  // permanent so a misconfiguration surfaces as FAILED instead of retrying.
  protected isRetryableError(_error: any): boolean {
    return false;
  }

  private maskToken(token: string): string {
    return token.length > 8 ? `${token.slice(0, 4)}…${token.slice(-4)}` : '***';
  }
}
