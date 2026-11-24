import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import { MailBatch, MailBatchResult, MailMessage, MailProvider } from './mail-provider.interface';
import { escapeVariables, LOCAL_TEMPLATES, renderTemplate } from './templates';

// SMTP has no batch API: send this many at a time so the relay isn't flooded.
export const SMTP_BATCH_CONCURRENCY = 5;

// Brevo is used as a plain SMTP relay here, so `template` is rendered locally against templates.ts rather than server-side.
export class BrevoProvider implements MailProvider {
  private readonly logger = new Logger(BrevoProvider.name);
  private readonly transporter: Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST'),
      port: this.configService.get<number>('MAIL_PORT'),
      secure: this.configService.get<string>('MAIL_SECURE') === 'true',
      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASS'),
      },
    });
  }

  async send(message: MailMessage): Promise<void> {
    const from = this.configService.get<string>('MAIL_FROM');

    if (!from || !this.configService.get<string>('MAIL_HOST')) {
      this.logger.warn('Brevo (SMTP) is not configured. Email was not sent.');
      return;
    }

    let { subject, text, html } = message;

    if (message.template) {
      const render = LOCAL_TEMPLATES[message.template];
      if (!render) {
        this.logger.warn(
          `No local template registered for "${message.template}" — sending a plain fallback instead of the intended template.`,
        );
        text = text ?? JSON.stringify(message.variables ?? {});
      } else {
        const rendered = render(message.variables ?? {});
        subject = subject ?? rendered.subject;
        text = rendered.text;
        html = rendered.html;
      }
    }

    try {
      await this.transporter.sendMail({ from, to: message.to, subject, text, html });
      this.logger.log(`Email sent successfully to ${message.to}`);
    } catch (error: any) {
      this.logger.error(`Email failed to send to ${message.to}: ${error.message}`);
    }
  }

  // Renders each email locally (HTML from escaped values) and sends them
  // SMTP_BATCH_CONCURRENCY at a time.
  async sendBatch(batch: MailBatch): Promise<MailBatchResult> {
    const from = this.configService.get<string>('MAIL_FROM');
    if (!from || !this.configService.get<string>('MAIL_HOST')) {
      this.logger.warn('Brevo (SMTP) is not configured. Batch email was not sent.');
      return { sent: 0, failed: batch.recipients.length };
    }
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < batch.recipients.length; i += SMTP_BATCH_CONCURRENCY) {
      const results = await Promise.allSettled(
        batch.recipients.slice(i, i + SMTP_BATCH_CONCURRENCY).map(({ to, variables }) => {
          const rendered = renderTemplate(batch.template, variables, escapeVariables(variables));
          if (!rendered) return Promise.reject(new Error(`No local template "${batch.template}"`));
          return this.transporter.sendMail({ from, to, subject: rendered.subject, text: rendered.text, html: rendered.html });
        }),
      );
      for (const result of results) {
        if (result.status === 'fulfilled') sent++;
        else {
          failed++;
          this.logger.error(`Batch "${batch.template}" email failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
        }
      }
    }
    return { sent, failed };
  }
}
