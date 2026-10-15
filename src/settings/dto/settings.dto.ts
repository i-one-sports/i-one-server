import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateCommissionDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage: number;
}

export class UpdateMinContributionDto {
  // Kobo
  @IsInt()
  @Min(0)
  amount: number;
}

export class UpdateProcessingFeeDto {
  // Percent of the charged total, e.g. 1.9
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99)
  percent?: number;

  // Kobo
  @IsOptional()
  @IsInt()
  @Min(0)
  flat?: number;

  // Kobo — the flat fee only applies when the charged total reaches this
  @IsOptional()
  @IsInt()
  @Min(0)
  flatWaivedBelow?: number;

  // Kobo — the fee never exceeds this
  @IsOptional()
  @IsInt()
  @Min(0)
  cap?: number;
}
