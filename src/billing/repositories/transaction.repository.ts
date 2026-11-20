import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Transaction, TransactionSource } from '@app/common/schemas/transaction.schema';

@Injectable()
export class TransactionRepository extends AbstractRepository<Transaction> {
  protected readonly logger = new Logger(TransactionRepository.name);

  constructor(@InjectModel(Transaction.name) transactionModel: Model<Transaction>) {
    super(transactionModel);
  }

  // Withdrawals from this wallet started on or after `since`.
  async findWithdrawalsSince(walletId: Types.ObjectId, since: Date): Promise<Array<{ reference: string; amount: number }>> {
    return this.model
      .find({ walletId, source: TransactionSource.WITHDRAWAL, createdAt: { $gte: since } })
      .select('reference amount')
      .lean<Array<{ reference: string; amount: number }>>();
  }
}
