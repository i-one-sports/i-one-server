import { IsNotEmpty, IsString, IsNumber, IsInt, IsOptional, IsDate, IsMongoId, IsIn, IsEnum, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { TournamentType } from '@app/common';

export class CreateTournamentDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Determines whether /:id/start generates a knockout bracket or a
  // round-robin league (fixtures + standings table)
  @IsNotEmpty()
  @IsEnum(TournamentType, { message: 'type must be "knockout" or "league"' })
  type: TournamentType;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  prizeMoney: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  registrationFee: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  minutesPerMatch: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  playersPerTeam: number;

  // Knockout requires 8/16/32 (validated in the service); league accepts any
  // value >= 2. Bounded here at the DTO level just to reject nonsense input.
  @IsNotEmpty()
  @IsInt()
  @Min(2)
  @Max(32)
  maxTeams: number;

  @IsOptional()
  @IsString({ each: true })
  pitches?: string[];

  @IsOptional()
  @IsString({ each: true })
  teamPrizes?: string[];

  @IsOptional()
  @IsString({ each: true })
  playerPrizes?: string[];

  @IsOptional()
  @IsString({ each: true })
  rules?: string[];

  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  registrationDeadline: Date;

  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  startDate: Date;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  durationDays: number;
}

export class CreateTeamAndRegisterDto {
  @IsNotEmpty()
  @IsString()
  teamName: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsNotEmpty()
  @IsMongoId()
  captainId: string;

  @IsOptional()
  @IsMongoId({ each: true })
  playerIds?: string[];
}

export class RecordMatchResultDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  homeScore: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  awayScore: number;
}

export class ManualAdvanceDto {
  @IsNotEmpty()
  @IsString()
  @IsIn(['home', 'away'], { message: 'winner must be "home" or "away"' })
  winner: 'home' | 'away';
}

export class ScheduleMatchDto {
  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  scheduledTime: Date;
}
