import { LocationCoordinates } from '@app/common';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
  location: LocationCoordinates;

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
