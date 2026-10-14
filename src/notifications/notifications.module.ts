import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationService } from './notification.service';
import { NotificationsController } from './notifications.controller';
import {
  MailerService,
  NotificationOutbox,
  NotificationOutboxSchema,
  PushNotificationService,
  User,
  UserSchema,
} from '@app/common';
import { NotificationOutboxService } from './notification-outbox.service';
import { AdminNotificationsController } from './admin-notifications.controller';
import { UserRepository } from 'src/users/users.repository';
import { PushNotificationChannel } from './channels/push.channel';
import { EmailNotificationChannel } from './channels/email.channel';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: NotificationOutbox.name, schema: NotificationOutboxSchema },
    ]),
  ],
  controllers: [NotificationsController, AdminNotificationsController],
  providers: [
    NotificationService,
    PushNotificationService,
    UserRepository,
    MailerService,
    PushNotificationChannel,
    EmailNotificationChannel,
    NotificationOutboxService,
  ],
  exports: [NotificationService, NotificationOutboxService],
})
export class NotificationsModule {}
