import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';
import { RedisPubSubService } from 'src/redis/redis-pubsub.service';
import { PushNotificationService, User } from '@app/common';
import { UserRepository } from 'src/users/users.repository';
import { PushNotificationChannel } from './channels/push.channel';
import { EmailNotificationChannel } from './channels/email.channel';
import {
  EmailNotificationParams,
  NOTIFICATION_CHANNEL,
  NOTIFICATION_TYPE,
  PushNotificationParams,
} from './notification.types';

export interface AppNotification {
  targetUserId: string;
  type: string;
  title: string;
  body: string;
  payload?: Record<string, any>;
  timestamp: number;
}

const CHANNEL = 'app:notifications';

@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationService.name);
  private notification$ = new Subject<AppNotification>();

  // Keep reference so we can unsubscribe the exact same function on destroy
  private readonly messageHandler = (message: string) => {
    try {
      const notification: AppNotification = JSON.parse(message);
      this.notification$.next(notification);
    } catch (err) {
      this.logger.error('Failed to parse notification from Redis', err);
    }
  };

  constructor(
    private readonly redisPubSub: RedisPubSubService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly userRepository: UserRepository,
    private readonly pushChannel: PushNotificationChannel,
    private readonly emailChannel: EmailNotificationChannel,
  ) {
    // A dead device token must never keep failing silently forever —
    // clear it from the User doc the first time FCM reports it invalid.
    this.pushNotificationService.onInvalidToken((deviceToken) => {
      this.userRepository
        .update({ fcmToken: deviceToken }, { fcmToken: null })
        .catch((err) => this.logger.error('Failed to clear stale fcmToken', err));
    });
  }

  async onModuleInit() {
    await this.redisPubSub.subscribe(CHANNEL, this.messageHandler);
  }

  async onModuleDestroy() {
    this.notification$.complete();
    await this.redisPubSub.unsubscribe(CHANNEL, this.messageHandler);
  }

  async send(channel: NOTIFICATION_CHANNEL.PUSH, params: PushNotificationParams): Promise<void>;
  async send(channel: NOTIFICATION_CHANNEL.EMAIL, params: EmailNotificationParams): Promise<void>;
  async send(
    channel: NOTIFICATION_CHANNEL,
    params: PushNotificationParams | EmailNotificationParams,
  ): Promise<void> {
    switch (channel) {
      case NOTIFICATION_CHANNEL.PUSH:
        return this.pushChannel.send(params as PushNotificationParams);
      case NOTIFICATION_CHANNEL.EMAIL:
        return this.emailChannel.send(params as EmailNotificationParams);
      default:
        this.logger.warn(`Unknown notification channel: ${channel}`);
    }
  }

  getStream(userId: string): Observable<AppNotification> {
    return this.notification$.pipe(filter((n) => n.targetUserId === userId));
  }

  private static readonly BROADCAST_BATCH_SIZE = 25;

  async broadcastToAllUsers(title: string, body: string): Promise<{ totalUsers: number; sent: number }> {
    const users: User[] = await this.userRepository.find({ fcmToken: { $ne: null } });
    let sent = 0;

    for (let i = 0; i < users.length; i += NotificationService.BROADCAST_BATCH_SIZE) {
      const batch = users.slice(i, i + NotificationService.BROADCAST_BATCH_SIZE);
      await Promise.all(
        batch.map((user) =>
          this.send(NOTIFICATION_CHANNEL.PUSH, {
            type: NOTIFICATION_TYPE.ADMIN_BROADCAST,
            targetUserId: user._id.toString(),
            title,
            body,
          })
            .then(() => {
              sent++;
            })
            .catch((err) => this.logger.error(`Broadcast failed for user ${user._id}`, err)),
        ),
      );
    }

    return { totalUsers: users.length, sent };
  }
}
