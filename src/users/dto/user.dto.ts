import {
  LOCATION_PRICING_OPTION,
  LOCATION_TIER,
  LocationCoordinates,
  PLAYER_POSITION,
  USER_ROLE,
} from '@app/common';
import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsPhoneNumber,
  IsNumber,
  MinLength,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsEnum,
  Equals,
  IsArray,
  IsIn,
  Min,
  ValidateIf,
  ValidateNested,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  nickname?: string;

  @IsString()
  @IsOptional()
  avatar?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsPhoneNumber('NG')
  @IsOptional()
  phoneNumber?: string;

  @IsEnum(PLAYER_POSITION)
  @IsOptional()
  position?: PLAYER_POSITION;

  @IsOptional()
  location?: LocationCoordinates;

  @IsNumber()
  @IsOptional()
  height?: number;

  @IsDateString()
  @IsOptional()
  dateOfBirth?: Date;
}

export class registerUserRequest {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  nickname: string;

  @IsString()
  @IsOptional()
  avatar?: string

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  @IsPhoneNumber('NG')
  phoneNumber: string;

  @IsEnum(PLAYER_POSITION)
  @IsNotEmpty()
  position: PLAYER_POSITION; // MF, ST, DF

  @IsNotEmpty()
  location: LocationCoordinates;

  @IsBoolean()
  @IsOptional()
  isOwner?: boolean

  @IsNumber()
  @IsNotEmpty()
  height: number;

  @IsDateString()
  @IsNotEmpty()
  dateOfBirth: Date;
}

export class RegisterOwnerUserDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  nickname?: string;

  @IsString()
  @IsOptional()
  role?: string;

  @IsString()
  @MinLength(6)
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsPhoneNumber('NG')
  @IsNotEmpty()
  phoneNumber: string;
}

export class RegisterOwnerLocationCoordinatesDto {
  @IsIn(['Point'])
  @IsOptional()
  type?: 'Point';

  @IsArray()
  @IsNumber({}, { each: true })
  coordinates: [number, number];
}

export class RegisterOwnerLocationDto {
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'openingHour must be in HH:mm format',
  })
  @IsNotEmpty()
  openingHour: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'closingHour must be in HH:mm format',
  })
  @IsNotEmpty()
  closingHour: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsOptional()
  pitchMax?: string;

  @IsString()
  @IsOptional()
  pitchSize?: string;

  @IsEnum(LOCATION_TIER)
  @IsNotEmpty()
  tier: LOCATION_TIER;

  @ValidateIf((dto: RegisterOwnerLocationDto) => dto.tier === LOCATION_TIER.PAID)
  @IsEnum(LOCATION_PRICING_OPTION)
  @IsNotEmpty()
  pricingOption?: LOCATION_PRICING_OPTION;

  @ValidateIf(
    (dto: RegisterOwnerLocationDto) =>
      dto.tier === LOCATION_TIER.PAID &&
      dto.pricingOption === LOCATION_PRICING_OPTION.HOURLY,
  )
  @IsNumber()
  @Min(1)
  paymentPerPersonHourly?: number;

  @ValidateIf(
    (dto: RegisterOwnerLocationDto) =>
      dto.tier === LOCATION_TIER.PAID &&
      dto.pricingOption === LOCATION_PRICING_OPTION.MONTHLY,
  )
  @IsNumber()
  @Min(1)
  paymentPerPersonMonthly?: number;

  @IsOptional()
  @IsString()
  pitchPhoto?: string;

  @IsNotEmpty()
  @ValidateNested()
  @Type(() => RegisterOwnerLocationCoordinatesDto)
  location: RegisterOwnerLocationCoordinatesDto;
}

export class RegisterOwnerPayoutDto {
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @IsString()
  @IsNotEmpty()
  bankName: string;

  @IsString()
  @IsNotEmpty()
  accountNumber: string;
}

export class RegisterOwnerRequest {
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => RegisterOwnerUserDto)
  user: RegisterOwnerUserDto;

  @IsNotEmpty()
  @ValidateNested()
  @Type(() => RegisterOwnerLocationDto)
  location: RegisterOwnerLocationDto;

  @IsNotEmpty()
  @ValidateNested()
  @Type(() => RegisterOwnerPayoutDto)
  payout: RegisterOwnerPayoutDto;

  @Equals(true, { message: 'termsAccepted must be true' })
  termsAccepted: boolean;

  @IsBoolean()
  @IsOptional()
  newsletterOptIn?: boolean;
}

export class ForgotPasswordDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class VerifyOtpDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsNumber()
  @IsNotEmpty()
  otp: number;
}

export class SendEmailVerifyDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class VerifyEmailOtpDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsNumber()
  @IsNotEmpty()
  otp: number;
}

export class PromoteUserDto {
  @IsEnum([USER_ROLE.ADMIN, USER_ROLE.SUPER_ADMIN], {
    message: 'role must be admin or super_admin',
  })
  @IsNotEmpty()
  role: USER_ROLE.ADMIN | USER_ROLE.SUPER_ADMIN;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  oldPassword: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  newPassword: string;

  @IsString()
  @IsNotEmpty()
  confirmNewPassword: string;
}

export class ResetPasswordDto {
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty()
  email: string;

  @IsNotEmpty()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  newPassword: string;

  @IsNotEmpty()
  confirmPassword: string;
}
