import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailProvider, MailVariables } from './mail-provider.interface';
import { MailgunProvider } from './mailgun.provider';
import { BrevoProvider } from './brevo.provider';

// Provider is picked once at startup from MAIL_PROVIDER; everything else talks to `this.provider`, never to a provider class directly.
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly provider: MailProvider;

  constructor(private readonly configService: ConfigService) {
    const providerName = (this.configService.get<string>('MAIL_PROVIDER') || 'mailgun').toLowerCase();

    switch (providerName) {
      case 'brevo':
        this.provider = new BrevoProvider(this.configService);
        break;
      case 'mailgun':
        this.provider = new MailgunProvider(this.configService);
        break;
      default:
        this.logger.warn(`Unknown MAIL_PROVIDER "${providerName}" — falling back to mailgun.`);
        this.provider = new MailgunProvider(this.configService);
    }

    this.logger.log(`Mail provider: ${providerName}`);
  }

  async sendMail(to: string, subject: string, text: string, html?: string): Promise<void> {
    this.logger.log(`Sending email to ${to} with subject: ${subject}`);
    await this.provider.send({ to, subject, text, html });
  }

  async sendTemplateMail(
    to: string,
    template: string,
    variables: MailVariables,
    subject?: string,
  ): Promise<void> {
    this.logger.log(`Sending template "${template}" to ${to}`);
    await this.provider.send({ to, subject, template, variables });
  }

  async sendEmailVerificationOtp(to: string, otp: number): Promise<void> {
    const template =
      this.configService.get<string>('MAILGUN_EMAIL_VERIFICATION_TEMPLATE') ||
      'email-verification';

    await this.sendTemplateMail(
      to,
      template,
      {
        otp,
        code: otp,
        expiresInMinutes: 10,
        email: to,
      },
      'Verify your email',
    );
  }
}
