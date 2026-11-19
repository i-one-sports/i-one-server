import { IsDate, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { ROTATION_FORMAT, WINNING_DECIDER } from '@app/common';

export class createSessionRequest {
  @IsNotEmpty()
  @IsNumber()
  setNumber: number;

  @IsNotEmpty()
  @IsNumber()
  playersPerTeam: number;

  @IsNotEmpty()
  @IsNumber()
  timeDuration: number;

  @IsNotEmpty()
  @IsNumber()
  minsPerSet: number;

  @IsNotEmpty()
  @IsDateString()
  startTime: Date;

  @IsEnum(WINNING_DECIDER)
  winningDecider: WINNING_DECIDER;

  @IsOptional()
  @IsEnum(ROTATION_FORMAT)
  rotationFormat?: ROTATION_FORMAT;
}

export class BroadcastSessionMessageDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  body: string;
}
