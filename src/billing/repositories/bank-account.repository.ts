import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BankAccount } from '@app/common/schemas/bank-account.schema';

@Injectable()
export class BankAccountRepository extends AbstractRepository<BankAccount> {
  protected readonly logger = new Logger(BankAccountRepository.name);

  constructor(@InjectModel(BankAccount.name) bankAccountModel: Model<BankAccount>) {
    super(bankAccountModel);
  }
}
