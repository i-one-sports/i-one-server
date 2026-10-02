import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationService } from './notification.service';
import { NotificationsController } from './notifications.controller';
import { MailerService, PushNotificationService, User, UserSchema } from '@app/common';
import { UserRepository } from 'src/users/users.repository';
import { PushNotificationChannel } from './channels/push.channel';
import { EmailNotificationChannel } from './channels/email.channel';

@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  controllers: [NotificationsController],
  providers: [
    NotificationService,
    PushNotificationService,
    UserRepository,
    MailerService,
    PushNotificationChannel,
    EmailNotificationChannel,
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
