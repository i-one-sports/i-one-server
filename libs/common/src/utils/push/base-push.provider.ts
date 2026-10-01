import { Logger } from '@nestjs/common';
import { PushMessage, PushProvider } from './push-provider.interface';

export abstract class BasePushProvider implements PushProvider {
  protected abstract readonly logger: Logger;
  protected abstract dispatch(message: PushMessage): Promise<void>;

  // Set by PushNotificationService so a provider never needs to know about Mongo/User.
  onInvalidToken?: (deviceToken: string) => void;

  async send(message: PushMessage): Promise<void> {
    if (!message.deviceToken) {
      this.logger.warn('Push skipped: empty deviceToken.');
      return;
    }

    try {
      await this.dispatch(message);
      this.logger.log(`Push sent to token ${this.maskToken(message.deviceToken)}`);
    } catch (error: any) {
      this.logger.error(`Push failed for token ${this.maskToken(message.deviceToken)}: ${error.message}`);
      if (this.isInvalidTokenError(error)) {
        this.onInvalidToken?.(message.deviceToken);
      }
    }
  }

  protected isInvalidTokenError(_error: any): boolean {
    return false;
  }

  private maskToken(token: string): string {
    return token.length > 8 ? `${token.slice(0, 4)}…${token.slice(-4)}` : '***';
  }
}
