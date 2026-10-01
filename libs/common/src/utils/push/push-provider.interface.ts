export type PushData = Record<string, string>; // FCM data payloads must be string→string

export interface PushMessage {
  deviceToken: string;
  title: string;
  body: string;
  data?: PushData;
}

export interface PushProvider {
  send(message: PushMessage): Promise<void>;
}
