import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Transaction } from '@app/common/schemas/transaction.schema';

@Injectable()
export class TransactionRepository extends AbstractRepository<Transaction> {
  protected readonly logger = new Logger(TransactionRepository.name);

  constructor(@InjectModel(Transaction.name) transactionModel: Model<Transaction>) {
    super(transactionModel);
  }
}
