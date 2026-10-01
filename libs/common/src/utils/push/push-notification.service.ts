import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PushData } from './push-provider.interface';
import { BasePushProvider } from './base-push.provider';
import { FcmPushProvider } from './fcm.provider';
import { NoopPushProvider } from './noop.provider';

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private readonly provider: BasePushProvider;

  constructor(private readonly configService: ConfigService) {
    const providerName = (this.configService.get<string>('PUSH_PROVIDER') || 'fcm').toLowerCase();

    switch (providerName) {
      case 'fcm':
        this.provider = this.createFcmProvider();
        break;
      case 'noop':
        this.provider = new NoopPushProvider();
        break;
      default:
        this.logger.warn(`Unknown PUSH_PROVIDER "${providerName}" — falling back to fcm.`);
        this.provider = this.createFcmProvider();
    }

    this.logger.log(`Push provider: ${providerName}`);
  }

  // firebase-admin throws synchronously — both for missing fields AND for
  // present-but-malformed ones (e.g. a truncated/corrupted private key
  // throws "Failed to parse private key." from inside cert()). Either way
  // that throw would happen here, inside Nest's DI construction, crashing
  // the whole app on boot over a push misconfiguration, not just disabling
  // push. The upfront missing-var check gives a precise message for the
  // common case; the try/catch around construction is the actual safety
  // net that catches everything else (malformed values, library changes).
  private createFcmProvider(): BasePushProvider {
    const required = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
    const missing = required.filter((key) => !this.configService.get<string>(key));

    if (missing.length) {
      this.logger.warn(
        `Push disabled: missing env var(s) ${missing.join(', ')} — falling back to a no-op push provider.`,
      );
      return new NoopPushProvider();
    }

    try {
      return new FcmPushProvider(this.configService);
    } catch (error: any) {
      this.logger.error(
        `Push disabled: failed to initialize Firebase (${error.message}) — falling back to a no-op push provider.`,
      );
      return new NoopPushProvider();
    }
  }

  // Raw deviceToken, not a userId — same separation MailerService keeps by taking a raw email.
  async send(deviceToken: string, title: string, body: string, data?: PushData): Promise<void> {
    await this.provider.send({ deviceToken, title, body, data });
  }

  onInvalidToken(callback: (deviceToken: string) => void): void {
    this.provider.onInvalidToken = callback;
  }
}
