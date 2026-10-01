import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationService } from './notification.service';
import { NotificationsController } from './notifications.controller';
import { PushNotificationService, User, UserSchema } from '@app/common';
import { UserRepository } from 'src/users/users.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  controllers: [NotificationsController],
  providers: [NotificationService, PushNotificationService, UserRepository],
  exports: [NotificationService],
})
export class NotificationsModule {}
