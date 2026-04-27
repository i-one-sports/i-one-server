import { IsNotEmpty, IsString, IsNumber, IsOptional, IsDate, IsMongoId, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTournamentDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  prizeMoney: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  registrationFee: number;

  // Must be 8, 16, or 32
  @IsNotEmpty()
  @IsIn([8, 16, 32], { message: 'maxTeams must be 8, 16, or 32' })
  maxTeams: number;

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
