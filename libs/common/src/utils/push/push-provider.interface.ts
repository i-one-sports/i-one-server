export type PushData = Record<string, string>; // FCM data payloads must be string→string

export interface PushMessage {
  deviceToken: string;
  title: string;
  body: string;
  data?: PushData;
}

// What actually happened to one push — so callers that need to track
// delivery (the notification outbox) can tell success from each kind of
// failure. `send()` still swallows this for fire-and-forget callers.
export type PushResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: 'INVALID_TOKEN' | 'NO_DEVICE' | 'PUSH_DISABLED'; code?: string; message?: string }
  | { ok: false; reason: 'RETRYABLE' | 'PERMANENT'; code?: string; message: string };

export interface PushProvider {
  send(message: PushMessage): Promise<void>;
}
