import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { MailMessage, MailProvider } from './mail-provider.interface';

export class MailgunProvider implements MailProvider {
  private readonly logger = new Logger(MailgunProvider.name);
  private readonly client: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('MAILGUN_API_KEY');
    const baseUrl =
      this.configService.get<string>('MAILGUN_BASE_URL') ||
      'https://api.mailgun.net';

    this.client = axios.create({
      baseURL: baseUrl,
      auth: {
        username: 'api',
        password: apiKey || '',
      },
      timeout: 10000,
    });
  }

  async send(message: MailMessage): Promise<void> {
    const domain = this.configService.get<string>('MAILGUN_DOMAIN');
    const from =
      this.configService.get<string>('MAILGUN_FROM') ||
      this.configService.get<string>('MAIL_FROM');

    if (!domain || !from) {
      this.logger.warn('Mailgun is not configured. Email was not sent.');
      return;
    }

    const body = new URLSearchParams({ from, to: message.to });

    if (message.subject) body.append('subject', message.subject);
    if (message.text) body.append('text', message.text);
    if (message.html) body.append('html', message.html);
    if (message.template) body.append('template', message.template);
    if (message.variables) {
      body.append('h:X-Mailgun-Variables', JSON.stringify(message.variables));
    }

    try {
      await this.client.post(`/v3/${domain}/messages`, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      this.logger.log(`Email sent successfully to ${message.to}`);
    } catch (error: any) {
      this.logger.error(
        `Email failed to send to ${message.to}: ${error?.response?.data?.message || error.message}`,
      );
    }
  }
}
