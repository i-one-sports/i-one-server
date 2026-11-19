import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeepLinksController, parseAndroidFingerprints } from './deep-links.controller';

@Module({
  controllers: [DeepLinksController],
})
export class DeepLinksModule implements OnModuleInit {
  private readonly logger = new Logger(DeepLinksModule.name);

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    if (!this.configService.get<string>('APPLE_TEAM_ID')) {
      this.logger.warn(
        'APPLE_TEAM_ID is not set — /.well-known/apple-app-site-association will serve an invalid appID and iOS universal links will not verify',
      );
    }
    if (!this.configService.get<string>('APPLE_BUNDLE_ID')) {
      this.logger.warn(
        'APPLE_BUNDLE_ID is not set — /.well-known/apple-app-site-association will serve an invalid appID and iOS universal links will not verify',
      );
    }
    if (!this.configService.get<string>('ANDROID_PACKAGE_NAME')) {
      this.logger.warn(
        'ANDROID_PACKAGE_NAME is not set — /.well-known/assetlinks.json will serve an invalid package_name and Android app links will not verify',
      );
    }
    if (!parseAndroidFingerprints(this.configService.get<string>('ANDROID_SHA256_CERT_FINGERPRINTS')).length) {
      this.logger.warn(
        'ANDROID_SHA256_CERT_FINGERPRINTS is not set — /.well-known/assetlinks.json will serve no fingerprints and Android app links will not verify',
      );
    }
  }
}
