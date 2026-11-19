import { Injectable, Logger } from '@nestjs/common';
import { PushNotificationService } from '@app/common';
import { RedisPubSubService } from 'src/redis/redis-pubsub.service';
import { UserRepository } from 'src/users/users.repository';
import { BaseNotificationChannel } from './notification-channel';
import { PushNotificationParams } from '../notification.types';

const CHANNEL = 'app:notifications';

@Injectable()
export class PushNotificationChannel extends BaseNotificationChannel<PushNotificationParams> {
  protected readonly logger = new Logger(PushNotificationChannel.name);

  constructor(
    private readonly redisPubSub: RedisPubSubService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly userRepository: UserRepository,
  ) {
    super();
  }

  protected async dispatch(p: PushNotificationParams): Promise<void> {
    await this.redisPubSub.publish(
      CHANNEL,
      JSON.stringify({
        targetUserId: p.targetUserId,
        type: p.type,
        title: p.title,
        body: p.body,
        payload: p.payload,
        timestamp: Date.now(),
      }),
    );

    const user = await this.userRepository.findOne({ _id: p.targetUserId });
    if (!user?.fcmToken) return; // no device registered — skip silently

    await this.pushNotificationService.send(
      user.fcmToken,
      p.title,
      p.body,
      p.payload ? { payload: JSON.stringify(p.payload) } : undefined,
    );
  }
}
