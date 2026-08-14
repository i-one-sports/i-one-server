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

export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}
