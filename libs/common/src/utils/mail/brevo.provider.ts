import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import { MailMessage, MailProvider } from './mail-provider.interface';
import { LOCAL_TEMPLATES } from './templates';

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
}
