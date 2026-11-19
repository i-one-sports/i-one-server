import { IsInt, IsPositive, IsString, IsMongoId, IsOptional } from 'class-validator';

export class AddBankAccountDto {
  @IsString()
  accountNumber: string;

  @IsString()
  bankCode: string;

  @IsString()
  bankName: string;
}

export class WithdrawFundsDto {
  // Whole kobo (₦1 = 100)
  @IsInt()
  @IsPositive()
  amount: number;

  @IsMongoId()
  @IsOptional()
  bankAccountId?: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
