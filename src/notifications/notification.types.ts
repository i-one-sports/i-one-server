export enum NOTIFICATION_CHANNEL {
  PUSH = 'PUSH',
  EMAIL = 'EMAIL',
}

export enum NOTIFICATION_TYPE {
  SESSION_CREATED = 'SESSION_CREATED',
  SESSION_CONFIGURED = 'SESSION_CONFIGURED',
  SESSION_RESCHEDULED = 'SESSION_RESCHEDULED',
  WELCOME = 'WELCOME',
  EMAIL_VERIFICATION_OTP = 'EMAIL_VERIFICATION_OTP',
  PASSWORD_RESET = 'PASSWORD_RESET',
  VERIFICATION_SUBMITTED = 'VERIFICATION_SUBMITTED',
  VERIFICATION_APPROVED = 'VERIFICATION_APPROVED',
  VERIFICATION_REJECTED = 'VERIFICATION_REJECTED',
  SESSION_BROADCAST = 'SESSION_BROADCAST',
  ADMIN_BROADCAST = 'ADMIN_BROADCAST',
  SESSION_REMINDER = 'SESSION_REMINDER',
  REFEREE_INVITE = 'REFEREE_INVITE',
  MATCH_RESULT_REVIEW = 'MATCH_RESULT_REVIEW',
  SESSION_VOTE_OPEN = 'SESSION_VOTE_OPEN',
  SESSION_VOTE_RESULT = 'SESSION_VOTE_RESULT',
  BADGE_UNLOCKED = 'BADGE_UNLOCKED',
  // A paid session that isn't ready will be cancelled in 3 minutes.
  SESSION_AT_RISK = 'SESSION_AT_RISK',
  // A paid session was cancelled automatically (not ready 10 min after kick-off).
  SESSION_AUTO_CANCELLED = 'SESSION_AUTO_CANCELLED',
  // Confirmation that the user's account was deleted (Apple 5.1.1(v)).
  ACCOUNT_DELETED = 'ACCOUNT_DELETED',
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

// Many emails of one type, sent in as few provider requests as possible.
// Each recipient's variables are substituted as text (same keys for all).
export interface EmailBatchParams {
  type: NOTIFICATION_TYPE;
  recipients: Array<{ to: string; variables: Record<string, string | number | boolean | null> }>;
}
