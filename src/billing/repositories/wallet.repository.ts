import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository } from '@app/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { Wallet, WALLET_KIND } from '@app/common/schemas/wallet.schema';

@Injectable()
export class WalletRepository extends AbstractRepository<Wallet> {
  protected readonly logger = new Logger(WalletRepository.name);

  constructor(
    @InjectModel(Wallet.name) walletModel: Model<Wallet>,
    @InjectConnection() connection: Connection,
  ) {
    super(walletModel, connection);
  }

  async findOwnerWallet(userId: Types.ObjectId): Promise<{ _id: Types.ObjectId; balance: number } | null> {
    return this.model
      .findOne({ userId, kind: { $ne: WALLET_KIND.PLATFORM } })
      .select('balance')
      .lean<{ _id: Types.ObjectId; balance: number }>()
      .exec();
  }

  // Closes the wallet only if it is still empty — checked in the same write,
  // so money landing after the caller's balance check stops the close.
  async closeIfEmpty(walletId: Types.ObjectId, session: ClientSession): Promise<boolean> {
    const closed = await this.model.findOneAndUpdate(
      { _id: walletId, balance: 0 },
      { $set: { status: 'CLOSED' } },
      { new: true, session },
    );
    return closed !== null;
  }

  async updateBalance(
    walletId: string,
    amount: number,
    currentBalance: number,
    session?: ClientSession,
  ): Promise<Wallet | null> {
    return await this.model.findOneAndUpdate(
      {
        _id: walletId,
        balance: currentBalance,
      },
      {
        $inc: { balance: amount },
      },
      { new: true, lean: true, session },
    ).exec();
  }
}
