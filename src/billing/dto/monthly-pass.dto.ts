import { IsMongoId, IsOptional } from 'class-validator';

export class MonthlyPassCheckoutDto {
  // Buy-to-join: the session at this pitch to hold a spot in while paying.
  @IsOptional()
  @IsMongoId()
  holdSessionId?: string;
}
