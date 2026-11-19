import { IsInt, IsOptional, Min } from 'class-validator';

export class SessionCheckoutDto {
  // Kobo, base amount (commission is added on top). Required for POOL
  // sessions — how much of the pot this player is covering. Ignored for
  // PER_PERSON sessions, where the amount is fixed.
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;
}
