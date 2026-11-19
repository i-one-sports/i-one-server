import { IsInt, IsNumber, IsPositive, IsString, IsOptional, IsMongoId } from 'class-validator';

// Admin funding of an owner's wallet. Amount in whole kobo (₦1 = 100).
export class FundWalletDto {
  @IsMongoId()
  userId: string;

  @IsInt()
  @IsPositive()
  amount: number;

  @IsString()
  @IsOptional()
  description?: string;
}

// Owner tops up their own wallet via Paystack. Amount in whole kobo.
export class FundMyWalletDto {
  @IsInt()
  @IsPositive()
  amount: number;
}

export class TransactionQueryDto {
  @IsNumber()
  @IsOptional()
  page?: number = 1;

  @IsNumber()
  @IsOptional()
  limit?: number = 50;
}
