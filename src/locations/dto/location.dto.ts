import { LocationCoordinates } from '@app/common';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, ValidateNested, IsArray, IsNumber, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class LocationCoordinatesDto {
  @IsIn(['Point'])
  @IsOptional()
  type?: 'Point';

  @IsArray()
  @IsNumber({}, { each: true })
  coordinates: [number, number];
}

export class CreateLocationDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  address: string;

  @IsString()
  pitchPhoto?: string;

  @IsNotEmpty()
  @ValidateNested()
  @Type(() => LocationCoordinatesDto)
  location: LocationCoordinatesDto;

  @IsBoolean()
  @IsOptional()
  friendly?: boolean;

  @IsBoolean()
  @IsOptional()
  tournament?: boolean;
}

export class ViewNearbyLocationsDto {
  longitude: string;
  latitude: string;
  maxDistance?: number;
}
