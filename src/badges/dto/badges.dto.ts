import { IsBoolean } from 'class-validator';

export class ShareBadgeDto {
  @IsBoolean()
  shared: boolean;
}
