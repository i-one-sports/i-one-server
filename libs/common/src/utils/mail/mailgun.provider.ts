import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { MailBatch, MailBatchResult, MailMessage, MailProvider, MailVariables } from './mail-provider.interface';
import { renderTemplate } from './templates';

// Mailgun takes up to 1,000 recipients per batch request.
export const MAILGUN_BATCH_LIMIT = 1000;

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

  // One request per 1,000 recipients. The template is rendered once with
  // %recipient.x% placeholders and Mailgun fills in each person's values
  // (recipient-variables), sending everyone their own copy — nobody sees
  // anyone else's address. HTML gets the escaped copy of each value.
  async sendBatch(batch: MailBatch): Promise<MailBatchResult> {
    const domain = this.configService.get<string>('MAILGUN_DOMAIN');
    const from = this.configService.get<string>('MAILGUN_FROM') || this.configService.get<string>('MAIL_FROM');
    if (!domain || !from) {
      this.logger.warn('Mailgun is not configured. Batch email was not sent.');
      return { sent: 0, failed: batch.recipients.length };
    }
    if (batch.recipients.length === 0) return { sent: 0, failed: 0 };

    const keys = Object.keys(batch.recipients[0].variables);
    const placeholders = (suffix: string): MailVariables =>
      Object.fromEntries(keys.map((key) => [key, `%recipient.${key}${suffix}%`]));
    const rendered = renderTemplate(batch.template, placeholders(''), placeholders('_html'));
    if (!rendered) {
      this.logger.error(`No local template "${batch.template}" — batch not sent`);
      return { sent: 0, failed: batch.recipients.length };
    }

    let sent = 0;
    let failed = 0;
    for (let i = 0; i < batch.recipients.length; i += MAILGUN_BATCH_LIMIT) {
      const chunk = batch.recipients.slice(i, i + MAILGUN_BATCH_LIMIT);
      const recipientVariables = Object.fromEntries(
        chunk.map(({ to, variables }) => [
          to,
          Object.fromEntries(
            keys.flatMap((key) => [
              [key, String(variables[key] ?? '')],
              [`${key}_html`, escapeForHtml(variables[key])],
            ]),
          ),
        ]),
      );
      const body = new URLSearchParams({
        from,
        to: chunk.map((r) => r.to).join(','),
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        'recipient-variables': JSON.stringify(recipientVariables),
      });
      try {
        await this.client.post(`/v3/${domain}/messages`, body, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        sent += chunk.length;
      } catch (error: unknown) {
        failed += chunk.length;
        const reason = (error as { response?: { data?: { message?: string } }; message?: string });
        this.logger.error(`Batch "${batch.template}" to ${chunk.length} recipient(s) failed: ${reason.response?.data?.message || reason.message}`);
      }
    }
    this.logger.log(`Batch "${batch.template}": ${sent} sent, ${failed} failed`);
    return { sent, failed };
  }
}

const escapeForHtml = (value: unknown): string =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
