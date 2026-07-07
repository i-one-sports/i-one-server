import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository } from '@app/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { Wallet } from '@app/common/schemas/wallet.schema';

@Injectable()
export class WalletRepository extends AbstractRepository<Wallet> {
  protected readonly logger = new Logger(WalletRepository.name);

  constructor(
    @InjectModel(Wallet.name) walletModel: Model<Wallet>,
    @InjectConnection() connection: Connection,
  ) {
    super(walletModel, connection);
  }

  async updateBalance(
    walletId: string,
    amount: number,
    currentBalance: number,
  ): Promise<Wallet | null> {
    return await this.model.findOneAndUpdate(
      {
        _id: walletId,
        balance: currentBalance,
      },
      {
        $inc: { balance: amount },
      },
      { new: true, lean: true },
    ).exec();
  }
}
