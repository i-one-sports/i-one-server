import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';
import { RedisPubSubService } from 'src/redis/redis-pubsub.service';

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

  constructor(private readonly redisPubSub: RedisPubSubService) {}

  async onModuleInit() {
    await this.redisPubSub.subscribe(CHANNEL, this.messageHandler);
  }

  async onModuleDestroy() {
    this.notification$.complete();
    await this.redisPubSub.unsubscribe(CHANNEL, this.messageHandler);
  }

  async emit(notification: AppNotification): Promise<void> {
    await this.redisPubSub.publish(CHANNEL, JSON.stringify(notification));
  }

  getStream(userId: string): Observable<AppNotification> {
    return this.notification$.pipe(
      filter((n) => n.targetUserId === userId),
    );
  }
}
