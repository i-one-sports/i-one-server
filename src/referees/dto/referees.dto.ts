import { IsMongoId, IsNotEmpty, IsPhoneNumber, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class InviteRefereeDto {
  @IsMongoId()
  @IsNotEmpty()
  userId: string;
}

export class CaptainDeviceRefereeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  guestName: string;

  // The app shows "+234 803 412 7788"; spaces are stripped before validation.
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s-]/g, '') : value))
  @IsPhoneNumber('NG')
  guestPhone: string;
}

export class AssignRefereeDto {
  @IsMongoId()
  @IsNotEmpty()
  refereeId: string;
}
