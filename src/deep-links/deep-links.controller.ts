import { Controller, Get, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export function parseAndroidFingerprints(raw?: string): string[] {
  return (raw ?? '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
}

@Controller('.well-known')
export class DeepLinksController {
  constructor(private configService: ConfigService) {}

  @Get('apple-app-site-association')
  @Header('Content-Type', 'application/json')
  getAppleAppSiteAssociation() {
    const teamId = this.configService.get<string>('APPLE_TEAM_ID');
    const bundleId = this.configService.get<string>('APPLE_BUNDLE_ID');
    return {
      applinks: {
        apps: [],
        details: [
          {
            appID: `${teamId}.${bundleId}`,
            paths: ['/sessions/*'],
          },
        ],
      },
    };
  }

  @Get('assetlinks.json')
  @Header('Content-Type', 'application/json')
  getAndroidAssetLinks() {
    const packageName = this.configService.get<string>('ANDROID_PACKAGE_NAME');
    const fingerprints = parseAndroidFingerprints(
      this.configService.get<string>('ANDROID_SHA256_CERT_FINGERPRINTS'),
    );
    return [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: packageName,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ];
  }
}
