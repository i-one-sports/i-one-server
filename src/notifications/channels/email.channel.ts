import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@app/common';
import { BaseNotificationChannel } from './notification-channel';
import { EmailNotificationParams, NOTIFICATION_TYPE } from '../notification.types';

const EMAIL_TEMPLATE_BY_TYPE: Partial<Record<NOTIFICATION_TYPE, string>> = {
  [NOTIFICATION_TYPE.SESSION_CREATED]: 'session-created',
  [NOTIFICATION_TYPE.WELCOME]: 'welcome',
  [NOTIFICATION_TYPE.EMAIL_VERIFICATION_OTP]: 'email-verification',
  [NOTIFICATION_TYPE.PASSWORD_RESET]: 'password-reset',
  [NOTIFICATION_TYPE.VERIFICATION_SUBMITTED]: 'verification-submitted',
  [NOTIFICATION_TYPE.VERIFICATION_APPROVED]: 'verification-approved',
  [NOTIFICATION_TYPE.VERIFICATION_REJECTED]: 'verification-rejected',
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
}
