import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { WalletRepository } from '../repositories/wallet.repository';
import { TransactionRepository } from '../repositories/transaction.repository';
import { LedgerRepository } from '../repositories/ledger.repository';
import { PaystackService } from '@app/common/providers/paystack.service';
import {
  TransactionType,
  TransactionStatus,
  TransactionSource,
} from '@app/common/schemas/transaction.schema';
import { Wallet } from '@app/common/schemas/wallet.schema';
import { randomUUID } from 'crypto';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly transactionRepository: TransactionRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly paystackService: PaystackService,
    private readonly configService: ConfigService,
  ) {}

  // Called when a location owner's verification is approved.
  // Creates a wallet with zero balance — no Paystack calls needed.
  async createWallet(userId: Types.ObjectId): Promise<Wallet> {
    const existing = await this.walletRepository.findOne({ userId });
    if (existing) {
      this.logger.warn(`Wallet already exists for user: ${userId}`);
      return existing;
    }

    const wallet = await this.walletRepository.create({
      userId,
      balance: 0,
      status: 'ACTIVE',
      currency: 'NGN',
    });

    this.logger.log(`Created wallet: ${wallet._id} for user: ${userId}`);
    return wallet;
  }

  async getWalletByUserId(userId: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      userId: new Types.ObjectId(userId),
    });

    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  // Initializes a Paystack payment so an owner can fund their own wallet.
  // Returns a Paystack checkout URL. When the user pays, the charge.success
  // webhook fires and creditWallet is called to complete the funding.
  async initializeWalletFunding(userId: string, amount: number) {
    const wallet = await this.getWalletByUserId(userId);
    const user = await this.walletRepository
      .findRaw()
      .db.collection('users')
      .findOne({ _id: wallet.userId });

    if (!user) throw new NotFoundException('User not found');

    const reference = `FUND_${randomUUID()}`;

    // Create a PENDING transaction so we can track this funding attempt
    await this.transactionRepository.create({
      walletId: wallet._id,
      userId: wallet.userId,
      type: TransactionType.CREDIT,
      amount,
      balanceBefore: wallet.balance,
      balanceAfter: wallet.balance, // updated to actual value on completion
      status: TransactionStatus.PENDING,
      source: TransactionSource.WALLET_FUNDING,
      reference,
      description: 'Wallet funding via Paystack',
    });

    const paymentData = await this.paystackService.initializeTransaction(
      user.email,
      amount,
      reference,
      { walletId: wallet._id.toString(), type: 'WALLET_FUNDING' },
    );

    return {
      authorizationUrl: paymentData.authorization_url,
      reference,
      amount,
    };
  }

  // Credits a wallet atomically: balance update + transaction record + ledger entry
  // all happen in one MongoDB transaction — if any step fails, nothing commits.
  //
  // The idempotency guard (reference uniqueness) prevents double-credits from
  // duplicate webhook deliveries. If the same reference arrives twice, the
  // WebhookEventRepository's unique index blocks it before we ever get here.
  async creditWallet(
    walletId: Types.ObjectId,
    amount: number,
    source: TransactionSource,
    reference: string,
    metadata?: Record<string, any>,
    sessionId?: Types.ObjectId,
    initiatedBy?: Types.ObjectId,
  ) {
    this.logger.log(`Crediting wallet: ${walletId}, amount: ${amount}, ref: ${reference}`);

    const existingTx = await this.transactionRepository.findOne({ reference });
    if (existingTx?.status === TransactionStatus.SUCCESS) {
      this.logger.warn(`Duplicate credit detected for reference: ${reference}`);
      return existingTx;
    }
    // existingTx may still be a PENDING placeholder created at checkout time
    // (e.g. initializeWalletFunding) — that's not a duplicate, it's the row
    // this credit is meant to complete. Fall through and credit normally,
    // updating that row in place below instead of inserting a second one
    // (reference has a unique index, so inserting would fail anyway).

    const wallet = await this.walletRepository.findOne({ _id: walletId });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const session = await this.walletRepository.startTransaction();
    try {
      const balanceBefore = wallet.balance;
      const balanceAfter = balanceBefore + amount;

      const updatedWallet = await this.walletRepository.updateBalance(
        walletId.toString(),
        amount,
        balanceBefore,
        session,
      );

      if (!updatedWallet) {
        throw new InternalServerErrorException(
          'Balance update failed — concurrent modification detected',
        );
      }

      const transactionData = {
        walletId,
        userId: wallet.userId,
        type: TransactionType.CREDIT,
        amount,
        balanceBefore,
        balanceAfter,
        status: TransactionStatus.SUCCESS,
        source,
        reference,
        description: `Credit: ${source}`,
        sessionId,
        initiatedBy,
        metadata,
      };

      const transaction = existingTx
        ? await this.transactionRepository
            .findRaw()
            .findOneAndUpdate({ _id: existingTx._id }, transactionData, { session, new: true })
        : await this.transactionRepository.create(transactionData, { session });

      await this.ledgerRepository.create(
        {
          walletId,
          transactionId: transaction._id,
          type: 'CREDIT',
          amount,
          balanceAfter,
          reason: `${source}${sessionId ? ` — session ${sessionId}` : ''}`,
        },
        { session },
      );

      await session?.commitTransaction();
      this.logger.log(`Wallet credited: ${walletId}, new balance: ${balanceAfter}`);
      return transaction;
    } catch (error) {
      await session?.abortTransaction();
      throw error;
    } finally {
      await session?.endSession();
    }
  }

  // Debits a wallet atomically — same three-write transaction as credit.
  async debitWallet(
    walletId: Types.ObjectId,
    amount: number,
    source: TransactionSource,
    reference: string,
    metadata?: Record<string, any>,
    initiatedBy?: Types.ObjectId,
  ) {
    this.logger.log(`Debiting wallet: ${walletId}, amount: ${amount}, ref: ${reference}`);

    const existingTx = await this.transactionRepository.findOne({ reference });
    if (existingTx) {
      this.logger.warn(`Duplicate debit detected for reference: ${reference}`);
      return existingTx;
    }

    const wallet = await this.walletRepository.findOne({ _id: walletId });
    if (!wallet) throw new NotFoundException('Wallet not found');

    if (wallet.balance < amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const session = await this.walletRepository.startTransaction();
    try {
      const balanceBefore = wallet.balance;
      const balanceAfter = balanceBefore - amount;

      const updatedWallet = await this.walletRepository.updateBalance(
        walletId.toString(),
        -amount,
        balanceBefore,
        session,
      );

      if (!updatedWallet) {
        throw new InternalServerErrorException(
          'Balance update failed — concurrent modification detected',
        );
      }

      const transaction = await this.transactionRepository.create(
        {
          walletId,
          userId: wallet.userId,
          type: TransactionType.DEBIT,
          amount,
          balanceBefore,
          balanceAfter,
          status: TransactionStatus.SUCCESS,
          source,
          reference,
          description: `Debit: ${source}`,
          initiatedBy,
          metadata,
        },
        { session },
      );

      await this.ledgerRepository.create(
        {
          walletId,
          transactionId: transaction._id,
          type: 'DEBIT',
          amount,
          balanceAfter,
          reason: source,
        },
        { session },
      );

      await session?.commitTransaction();
      this.logger.log(`Wallet debited: ${walletId}, new balance: ${balanceAfter}`);
      return transaction;
    } catch (error) {
      await session?.abortTransaction();
      throw error;
    } finally {
      await session?.endSession();
    }
  }

  async getTransactionHistory(walletId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      this.transactionRepository
        .findRaw()
        .find({ walletId: new Types.ObjectId(walletId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.transactionRepository
        .findRaw()
        .countDocuments({ walletId: new Types.ObjectId(walletId) }),
    ]);

    return { transactions, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getLedger(walletId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const [entries, total] = await Promise.all([
      this.ledgerRepository
        .findRaw()
        .find({ walletId: new Types.ObjectId(walletId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.ledgerRepository
        .findRaw()
        .countDocuments({ walletId: new Types.ObjectId(walletId) }),
    ]);

    return { entries, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getBalance(userId: string) {
    const wallet = await this.getWalletByUserId(userId);
    return { balance: wallet.balance, currency: wallet.currency };
  }
}
