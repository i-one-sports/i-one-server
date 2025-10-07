import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  IsEnum,
  IsDate,
  IsMongoId,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  TournamentStatus,
  TournamentFormat,
  LocationCoordinates,
} from '@app/common';
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
  location: LocationCoordinates;
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

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsNumber()
  prizeMoney: number;

  @ApiProperty({ enum: TournamentFormat, default: TournamentFormat.KNOCKOUT })
  @IsOptional()
  @IsEnum(TournamentFormat)
  format?: TournamentFormat;

  @ApiProperty({ required: false, default: 16 })
  @IsOptional()
  @IsNumber()
  maxTeams?: number;


  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  registrationDeadline: Date;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  startDate: Date;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsNumber()
  durationDays: number;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsNotEmpty()
  registrationFee: number;

  // System generated fields:
  // - code
  // - status
  // - organizer
  // - location
  // - registeredTeams (starts empty)
  // - endDate (calculated from startDate + durationDays)

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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  prizeMoney?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  registrationFee?: number;

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
  @IsNumber()
  durationDays?: number;
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
