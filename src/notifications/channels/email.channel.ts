import { Injectable, Logger } from '@nestjs/common';
import { MailBatchResult, MailerService } from '@app/common';
import { BaseNotificationChannel } from './notification-channel';
import { EmailBatchParams, EmailNotificationParams, NOTIFICATION_TYPE } from '../notification.types';

const EMAIL_TEMPLATE_BY_TYPE: Partial<Record<NOTIFICATION_TYPE, string>> = {
  [NOTIFICATION_TYPE.SESSION_CREATED]: 'session-created',
  [NOTIFICATION_TYPE.SESSION_RESCHEDULED]: 'session-rescheduled',
  [NOTIFICATION_TYPE.WELCOME]: 'welcome',
  [NOTIFICATION_TYPE.EMAIL_VERIFICATION_OTP]: 'email-verification',
  [NOTIFICATION_TYPE.PASSWORD_RESET]: 'password-reset',
  [NOTIFICATION_TYPE.VERIFICATION_SUBMITTED]: 'verification-submitted',
  [NOTIFICATION_TYPE.VERIFICATION_APPROVED]: 'verification-approved',
  [NOTIFICATION_TYPE.VERIFICATION_REJECTED]: 'verification-rejected',
};

// Sent with MailProvider.sendBatch, rendered from the local templates
// (templates.ts) — no Mailgun dashboard template needed.
const BATCH_TEMPLATE_BY_TYPE: Partial<Record<NOTIFICATION_TYPE, string>> = {
  [NOTIFICATION_TYPE.SESSION_AT_RISK]: 'session-at-risk',
  [NOTIFICATION_TYPE.SESSION_AUTO_CANCELLED]: 'session-auto-cancelled',
  [NOTIFICATION_TYPE.ACCOUNT_DELETED]: 'account-deleted',
};

@Injectable()
export class EmailNotificationChannel extends BaseNotificationChannel<EmailNotificationParams> {
  protected readonly logger = new Logger(EmailNotificationChannel.name);

  constructor(private readonly mailerService: MailerService) {
    super();
  }

  protected async dispatch(p: EmailNotificationParams): Promise<void> {
    const template = EMAIL_TEMPLATE_BY_TYPE[p.type];
    if (!template) {
      this.logger.warn(`No email template mapped for notification type ${p.type}`);
      return;
    }

    await this.mailerService.sendTemplateMail(p.to, template, p.variables);
  }

  // Never throws: a mail failure is logged and counted.
  async sendBatch(p: EmailBatchParams): Promise<MailBatchResult> {
    const template = BATCH_TEMPLATE_BY_TYPE[p.type];
    if (!template) {
      this.logger.warn(`No batch email template mapped for notification type ${p.type}`);
      return { sent: 0, failed: p.recipients.length };
    }
    try {
      return await this.mailerService.sendTemplateBatch({ template, recipients: p.recipients });
    } catch (error: unknown) {
      this.logger.error(`Batch email ${p.type} failed: ${error instanceof Error ? error.message : String(error)}`);
      return { sent: 0, failed: p.recipients.length };
    }
  }
}
