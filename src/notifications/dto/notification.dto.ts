import { IsNotEmpty, IsString } from 'class-validator';

export class BroadcastNotificationDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  body: string;
}

export class SendTestPushDto {
  @IsNotEmpty()
  @IsString()
  fcmToken: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  body: string;
}
