import { IsNotEmpty, IsString, IsNumber, IsArray, IsOptional, IsEnum, IsDate, IsMongoId, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TournamentStatus, TournamentFormat, LocationCoordinates } from '@app/common';
import { Type } from 'class-transformer';

export class TournamentLocationDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  address: string;

  @ApiProperty({ required: false })
  @IsNotEmpty()
  @IsString()
  city: string;

  @ApiProperty({ required: false })
  @IsNotEmpty()
  @IsString()
  country: string;

  @ApiProperty({ required: false })
  location: LocationCoordinates
}

export class CreateTournamentDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [TournamentLocationDto], required: false })
  @IsOptional()
  @IsArray()
  @Type(() => TournamentLocationDto)
  locations?: TournamentLocationDto[];

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  prizeMoney?: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]+$/)
  tag: string;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  registrationFee?: number;

  @ApiProperty({ enum: TournamentFormat, default: TournamentFormat.UCL_CLASSIC })
  @IsOptional()
  @IsEnum(TournamentFormat)
  format?: TournamentFormat;

  @ApiProperty({ required: false, default: 32 })
  @IsOptional()
  @IsNumber()
  maxTeams?: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsMongoId()
  organizer: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  registrationDeadline?: Date;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;
}

export class UpdateTournamentDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [TournamentLocationDto], required: false })
  @IsOptional()
  @IsArray()
  @Type(() => TournamentLocationDto)
  locations?: TournamentLocationDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  prizeMoney?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]+$/)
  tag?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  registrationFee?: number;

  @ApiProperty({ enum: TournamentStatus, required: false })
  @IsOptional()
  @IsEnum(TournamentStatus)
  status?: TournamentStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  registrationDeadline?: Date;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;
}

export class RegisterTeamDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsMongoId()
  teamId: string;
}

export class CreateMatchDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsMongoId()
  homeTeamId: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsMongoId()
  awayTeamId: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  scheduledDate: Date;

  @ApiProperty()
  @IsNotEmpty()
  locationIndex: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  stage: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  group?: string;
}

export class UpdateMatchResultDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  homeScore: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  awayScore: number;
}