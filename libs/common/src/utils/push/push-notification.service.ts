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

  // firebase-admin throws synchronously if the service account is incomplete.
  // That would happen here, inside Nest's DI construction — crashing the whole
  // app on boot over a missing push config, not just disabling push. Checking
  // first and falling back to a warning + noop keeps the blast radius to
  // "push doesn't work" instead of "nothing works".
  private createFcmProvider(): BasePushProvider {
    const required = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
    const missing = required.filter((key) => !this.configService.get<string>(key));

    if (missing.length) {
      this.logger.warn(
        `Push disabled: missing env var(s) ${missing.join(', ')} — falling back to a no-op push provider.`,
      );
      return new NoopPushProvider();
    }

    return new FcmPushProvider(this.configService);
  }

  // Raw deviceToken, not a userId — same separation MailerService keeps by taking a raw email.
  async send(deviceToken: string, title: string, body: string, data?: PushData): Promise<void> {
    await this.provider.send({ deviceToken, title, body, data });
  }

  onInvalidToken(callback: (deviceToken: string) => void): void {
    this.provider.onInvalidToken = callback;
  }
}
