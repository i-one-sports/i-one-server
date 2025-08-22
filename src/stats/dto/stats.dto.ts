import { STATS } from '@app/common';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsBoolean,
  IsEnum,
} from 'class-validator';

export class StatsDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsNumber()
  @IsNotEmpty()
  seasonStart: number;

  @IsNumber()
  @IsNotEmpty()
  seasonEnd: number;

  @IsNumber()
  @IsNotEmpty()
  totalMatches: number;

  @IsNumber()
  @IsNotEmpty()
  goals: number;

  @IsNumber()
  @IsNotEmpty()
  assists: number;
}

export class statsQueryDto {

  @IsNumber()
  @IsNotEmpty()
  seasonStart: number;

  @IsNumber()
  @IsNotEmpty()
  seasonEnd: number;
}

export class updateStatsDto {

  @IsEnum(STATS, { message: 'Invalid stats type' })
  statsType: STATS;

  @IsNumber()
  @IsNotEmpty()
  value: number;
}
