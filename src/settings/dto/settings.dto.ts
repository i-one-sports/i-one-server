import { IsInt, IsNumber, Max, Min } from 'class-validator';

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
