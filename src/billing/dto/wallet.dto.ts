import { IsNumber, IsPositive, IsString, IsOptional, IsMongoId } from 'class-validator';

export class FundWalletDto {
  @IsMongoId()
  userId: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  @IsOptional()
  description?: string;
}

export class TransactionQueryDto {
  @IsNumber()
  @IsOptional()
  page?: number = 1;

  @IsNumber()
  @IsOptional()
  limit?: number = 50;
}
