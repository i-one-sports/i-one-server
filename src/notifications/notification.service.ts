import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';
import { RedisPubSubService } from 'src/redis/redis-pubsub.service';
import { PushNotificationService } from '@app/common';
import { UserRepository } from 'src/users/users.repository';

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

  async emit(notification: AppNotification): Promise<void> {
    await this.redisPubSub.publish(CHANNEL, JSON.stringify(notification));

    // Fire-and-forget — a push failure must never fail the action that
    // triggered this notification (matches the mail fire-and-forget
    // convention used across the app).
    this.sendPush(notification).catch((err) =>
      this.logger.error(`Failed to send push for ${notification.type}`, err),
    );
  }

  private async sendPush(notification: AppNotification): Promise<void> {
    const user = await this.userRepository.findOne({ _id: notification.targetUserId });
    if (!user?.fcmToken) return; // no device registered — skip silently

    await this.pushNotificationService.send(
      user.fcmToken,
      notification.title,
      notification.body,
      notification.payload ? { payload: JSON.stringify(notification.payload) } : undefined,
    );
  }

  getStream(userId: string): Observable<AppNotification> {
    return this.notification$.pipe(
      filter((n) => n.targetUserId === userId),
    );
  }
}
