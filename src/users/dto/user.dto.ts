import { LocationCoordinates, PLAYER_POSITION } from '@app/common';
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
} from 'class-validator';

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
  @IsNotEmpty()
  isOwner: boolean

  @IsNumber()
  @IsNotEmpty()
  height: number;

  @IsDateString()
  @IsNotEmpty()
  dateOfBirth: Date;
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
