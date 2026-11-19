import { STATS } from '@app/common';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

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
  // Lagos calendar year. Leave out for all-time totals. Query values arrive
  // as strings, hence the @Type.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  season?: number;
}

export class updateStatsDto {

  @IsEnum(STATS, { message: 'Invalid stats type' })
  statsType: STATS;

  @IsNumber()
  @IsNotEmpty()
  value: number;
}
