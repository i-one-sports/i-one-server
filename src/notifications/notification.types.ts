export enum NOTIFICATION_CHANNEL {
  PUSH = 'PUSH',
  EMAIL = 'EMAIL',
}

export enum NOTIFICATION_TYPE {
  SESSION_CREATED = 'SESSION_CREATED',
  SESSION_CONFIGURED = 'SESSION_CONFIGURED',
  WELCOME = 'WELCOME',
  EMAIL_VERIFICATION_OTP = 'EMAIL_VERIFICATION_OTP',
  PASSWORD_RESET = 'PASSWORD_RESET',
  VERIFICATION_SUBMITTED = 'VERIFICATION_SUBMITTED',
  VERIFICATION_APPROVED = 'VERIFICATION_APPROVED',
  VERIFICATION_REJECTED = 'VERIFICATION_REJECTED',
  SESSION_BROADCAST = 'SESSION_BROADCAST',
  ADMIN_BROADCAST = 'ADMIN_BROADCAST',
  // future types added here as new notifications are built
}

export interface PushNotificationParams {
  type: NOTIFICATION_TYPE;
  targetUserId: string;
  title: string;
  body: string;
  payload?: Record<string, any>;
}

export interface EmailNotificationParams {
  type: NOTIFICATION_TYPE;
  to: string;
  variables: Record<string, string | number | boolean | null>;
}
