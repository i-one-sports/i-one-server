import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { BasePushProvider } from './base-push.provider';
import { PushMessage } from './push-provider.interface';

let fcmApp: App | undefined;
const startupLogger = new Logger('FirebaseAdmin');

function getFcmApp(configService: ConfigService): App {
  if (fcmApp) return fcmApp;

  const privateKey = (configService.get<string>('FIREBASE_PRIVATE_KEY') || '').replace(/\\n/g, '\n');
  const credential = cert({
    projectId: configService.get<string>('FIREBASE_PROJECT_ID'),
    clientEmail: configService.get<string>('FIREBASE_CLIENT_EMAIL'),
    privateKey,
  });

  fcmApp = initializeApp({ credential });

  // One-off, non-blocking connectivity check at startup. getAccessToken()
  // performs a real OAuth exchange with Google using the private key, so
  // this actually proves (or disproves) the credential works, instead of
  // staying silent until the first real push attempt.
  credential
    .getAccessToken()
    .then(() => startupLogger.log('Firebase connected successfully'))
    .catch((err: any) => startupLogger.error(`Firebase not connected: ${err.message}`));

  return fcmApp;
}

export class FcmPushProvider extends BasePushProvider {
  protected readonly logger = new Logger(FcmPushProvider.name);
  private readonly app: App;

  constructor(configService: ConfigService) {
    super();
    this.app = getFcmApp(configService);
  }

  protected async dispatch(message: PushMessage): Promise<void> {
    await getMessaging(this.app).send({
      token: message.deviceToken,
      notification: { title: message.title, body: message.body },
      data: message.data,
    });
  }

  protected isInvalidTokenError(error: any): boolean {
    return (
      error?.code === 'messaging/registration-token-not-registered' ||
      error?.code === 'messaging/invalid-registration-token'
    );
  }
}
