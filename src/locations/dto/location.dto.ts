import {
  LOCATION_PRICING_OPTION,
  LOCATION_TIER,
  LocationCoordinates,
  PITCH_CONDITION,
} from '@app/common';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
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
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'openingHour must be in HH:mm format',
  })
  @IsNotEmpty()
  openingHour: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'closingHour must be in HH:mm format',
  })
  @IsNotEmpty()
  closingHour: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  address: string;

  @IsEnum(LOCATION_TIER)
  @IsNotEmpty()
  tier: LOCATION_TIER;

  @ValidateIf((dto: CreateLocationDto) => dto.tier === LOCATION_TIER.PAID)
  @IsEnum(LOCATION_PRICING_OPTION)
  @IsNotEmpty()
  pricingOption?: LOCATION_PRICING_OPTION;

  @ValidateIf(
    (dto: CreateLocationDto) =>
      dto.tier === LOCATION_TIER.PAID &&
      dto.pricingOption === LOCATION_PRICING_OPTION.HOURLY,
  )
  @IsNumber()
  @Min(0)
  paymentPerPersonHourly?: number;

  @ValidateIf(
    (dto: CreateLocationDto) =>
      dto.tier === LOCATION_TIER.PAID &&
      dto.pricingOption === LOCATION_PRICING_OPTION.MONTHLY,
  )
  @IsNumber()
  @Min(0)
  paymentPerPersonMonthly?: number;

  @IsString()
  pitchPhoto?: string;

  @IsString()
  @IsOptional()
  pitchMax?: string;

  @IsString()
  @IsOptional()
  pitchSize?: string;

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

export class UpdatePitchConditionDto {
  @IsEnum(PITCH_CONDITION, {
    message: `pitchCondition must be one of: ${Object.values(PITCH_CONDITION).join(', ')}`,
  })
  @IsNotEmpty()
  pitchCondition: PITCH_CONDITION;
}

export class UpdateLocationPricingDto {
  @IsEnum(LOCATION_TIER)
  @IsNotEmpty()
  tier: LOCATION_TIER;

  @ValidateIf((dto: UpdateLocationPricingDto) => dto.tier === LOCATION_TIER.PAID)
  @IsEnum(LOCATION_PRICING_OPTION)
  @IsNotEmpty()
  pricingOption?: LOCATION_PRICING_OPTION;

  @ValidateIf(
    (dto: UpdateLocationPricingDto) =>
      dto.tier === LOCATION_TIER.PAID &&
      dto.pricingOption === LOCATION_PRICING_OPTION.HOURLY,
  )
  @IsNumber()
  @Min(1)
  paymentPerPersonHourly?: number;

  @ValidateIf(
    (dto: UpdateLocationPricingDto) =>
      dto.tier === LOCATION_TIER.PAID &&
      dto.pricingOption === LOCATION_PRICING_OPTION.MONTHLY,
  )
  @IsNumber()
  @Min(1)
  paymentPerPersonMonthly?: number;
}

export class UpdateOpeningHoursDto {
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'openingHour must be in HH:mm format',
  })
  @IsNotEmpty()
  openingHour: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'closingHour must be in HH:mm format',
  })
  @IsNotEmpty()
  closingHour: string;
}

export class ViewNearbyLocationsDto {
  longitude: string;
  latitude: string;
  maxDistance?: number;
}
