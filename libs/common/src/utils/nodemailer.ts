import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

type MailgunVariables = Record<string, string | number | boolean | null>;

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly mailgun: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('MAILGUN_API_KEY');
    const baseUrl =
      this.configService.get<string>('MAILGUN_BASE_URL') ||
      'https://api.mailgun.net';

    this.mailgun = axios.create({
      baseURL: baseUrl,
      auth: {
        username: 'api',
        password: apiKey || '',
      },
      timeout: 10000,
    });

    /*
     * Previous SMTP/Brevo sender intentionally disabled.
     *
     * this.transporter = nodemailer.createTransport({
     *   host: this.configService.get<string>('MAIL_HOST'),
     *   port: this.configService.get<number>('MAIL_PORT'),
     *   secure: this.configService.get<string>('MAIL_SECURE') === 'true',
     *   auth: {
     *     user: this.configService.get<string>('MAIL_USER'),
     *     pass: this.configService.get<string>('MAIL_PASS'),
     *   },
     * });
     */
  }

  async sendMail(
    to: string,
    subject: string,
    text: string,
    html?: string,
  ): Promise<void> {
    this.logger.log(`Sending email to ${to} with subject: ${subject}`);
    await this.postMailgunMessage(to, {
      subject,
      text,
      html,
    });
  }

  async sendTemplateMail(
    to: string,
    template: string,
    variables: MailgunVariables,
    subject?: string,
  ): Promise<void> {
    this.logger.log(`Sending Mailgun template "${template}" to ${to}`);
    await this.postMailgunMessage(to, {
      subject,
      template,
      variables,
    });
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

  private async postMailgunMessage(
    to: string,
    data: {
      subject?: string;
      text?: string;
      html?: string;
      template?: string;
      variables?: MailgunVariables;
    },
  ) {
    const domain = this.configService.get<string>('MAILGUN_DOMAIN');
    const from =
      this.configService.get<string>('MAILGUN_FROM') ||
      this.configService.get<string>('MAIL_FROM');

    if (!domain || !from) {
      this.logger.warn('Mailgun is not configured. Email was not sent.');
      return;
    }

    const body = new URLSearchParams({
      from,
      to,
    });

    if (data.subject) body.append('subject', data.subject);
    if (data.text) body.append('text', data.text);
    if (data.html) body.append('html', data.html);
    if (data.template) body.append('template', data.template);
    if (data.variables) {
      body.append('h:X-Mailgun-Variables', JSON.stringify(data.variables));
    }

    try {
      await this.mailgun.post(`/v3/${domain}/messages`, body, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      this.logger.log(`Email sent successfully to ${to}`);
    } catch (error) {
      this.logger.error(
        `Email failed to send to ${to}: ${error?.response?.data?.message || error.message}`,
      );
    }
  }
}
