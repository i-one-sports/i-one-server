export type MailVariables = Record<string, string | number | boolean | null>;

export interface MailMessage {
  to: string;
  subject?: string;
  text?: string;
  html?: string;
  // Named template to render — Mailgun resolves it against its own dashboard, other providers render a local equivalent.
  template?: string;
  variables?: MailVariables;
}

// One email per recipient, all from the same local template (templates.ts).
// Each recipient's `variables` are substituted into the template as text, so
// a template used for batches must not branch on them (put the branch in the
// value itself, e.g. a ready-made sentence). Every recipient must have the
// same variable keys.
export interface MailBatch {
  template: string;
  recipients: Array<{ to: string; variables: MailVariables }>;
}

export interface MailBatchResult {
  sent: number;
  failed: number;
}

export interface MailProvider {
  send(message: MailMessage): Promise<void>;
  sendBatch(batch: MailBatch): Promise<MailBatchResult>;
}
