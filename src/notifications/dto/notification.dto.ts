import { IsNotEmpty, IsString } from 'class-validator';

export class BroadcastNotificationDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  body: string;
}
