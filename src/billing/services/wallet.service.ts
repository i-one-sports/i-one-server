import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { WalletRepository } from '../repositories/wallet.repository';
import { TransactionRepository } from '../repositories/transaction.repository';
import { DvaRepository } from '../repositories/dva.repository';
import { PaystackService } from '@app/common/providers/paystack.service';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { TransactionType, TransactionStatus, TransactionSource } from '@app/common/schemas/transaction.schema';
import { Wallet } from '@app/common/schemas/wallet.schema';
import { DedicatedVirtualAccount } from '@app/common/schemas/dva.schema';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly transactionRepository: TransactionRepository,
    private readonly dvaRepository: DvaRepository,
    private readonly paystackService: PaystackService,
    private readonly configService: ConfigService,
  ) {}

  async createWalletWithDVA(
    userId: Types.ObjectId,
    email: string,
    firstName: string,
    lastName: string,
    phone?: string,
  ): Promise<{ wallet: Wallet; dva: DedicatedVirtualAccount }> {
    this.logger.log(`Creating wallet and DVA for user: ${userId}`);

    // Idempotent: a prior call may have already created the wallet and/or DVA
    // (e.g. a previous approval attempt that failed after this step). Reuse
    // whatever already exists instead of throwing, so retries can succeed.
    let wallet: Wallet | null = await this.walletRepository.findOne({ userId });
    let dva: DedicatedVirtualAccount | null = wallet
      ? await this.dvaRepository.findOne({ userId })
      : null;

    if (wallet && dva) {
      this.logger.warn(`Wallet and DVA already exist for user: ${userId}, reusing existing records`);
      return { wallet, dva };
    }

    try {
      if (!wallet) {
        wallet = await this.walletRepository.create({
          userId,
          balance: 0,
          ledgerBalance: 0,
          status: 'ACTIVE',
          currency: 'NGN',
        });

        this.logger.log(`Created wallet: ${wallet._id} for user: ${userId}`);
      }

      if (!dva) {
        const customer = await this.paystackService.createCustomer(
          email,
          firstName,
          lastName,
          phone,
        );

        const bvn = this.configService.get<string>('PAYSTACK_TEST_BVN', '22123456789');
        await this.paystackService.validateCustomer(customer.customer_code, bvn, firstName, lastName);

        const preferredBank = this.configService.get<string>('PAYSTACK_PREFERRED_BANK', 'wema-bank');
        const dvaDetails = await this.paystackService.createDedicatedVirtualAccount(
          customer.customer_code,
          preferredBank,
        );

        dva = await this.dvaRepository.create({
          userId,
          walletId: wallet._id,
          accountNumber: dvaDetails.account_number,
          bankName: dvaDetails.bank.name,
          bankCode: dvaDetails.bank.code,
          accountName: dvaDetails.account_name,
          paystackCustomerCode: customer.customer_code,
          paystackAccountReference: dvaDetails.id,
          status: 'ACTIVE',
          currency: 'NGN',
        });

        this.logger.log(`Created DVA: ${dva.accountNumber} for user: ${userId}`);
      }

      return { wallet, dva };
    } catch (error) {
      this.logger.error(`Failed to create wallet and DVA for user: ${userId}`, error);
      throw new InternalServerErrorException('Failed to create wallet and DVA');
    }
  }

  async getWalletByUserId(userId: string) {
    const wallet = await this.walletRepository.findOne({
      userId: new Types.ObjectId(userId),
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return wallet;
  }

  async getDVAByUserId(userId: string) {
    const dva = await this.dvaRepository.findOne({
      userId: new Types.ObjectId(userId),
    });

    if (!dva) {
      throw new NotFoundException('DVA not found');
    }

    return dva;
  }

  async creditWallet(
    walletId: Types.ObjectId,
    amount: number,
    source: TransactionSource,
    reference: string,
    metadata?: Record<string, any>,
    sessionId?: Types.ObjectId,
    initiatedBy?: Types.ObjectId,
  ) {
    this.logger.log(`Crediting wallet: ${walletId}, amount: ${amount}, reference: ${reference}`);

    const existingTx = await this.transactionRepository.findOne({ reference });
    if (existingTx) {
      this.logger.warn(`Duplicate transaction detected: ${reference}`);
      return existingTx;
    }

    const wallet = await this.walletRepository.findOne({ _id: walletId });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore + amount;

    const updatedWallet = await this.walletRepository.updateBalance(
      walletId.toString(),
      amount,
      balanceBefore,
    );

    if (!updatedWallet) {
      throw new InternalServerErrorException('Failed to update wallet balance (concurrent modification)');
    }

    const transaction = await this.transactionRepository.create({
      walletId,
      userId: wallet.userId,
      type: TransactionType.CREDIT,
      amount,
      balanceBefore,
      balanceAfter,
      status: TransactionStatus.SUCCESS,
      source,
      reference,
      description: `Credit from ${source}`,
      sessionId,
      initiatedBy,
      metadata,
    });

    this.logger.log(`Wallet credited successfully: ${walletId}, new balance: ${balanceAfter}`);

    return transaction;
  }

  async debitWallet(
    walletId: Types.ObjectId,
    amount: number,
    source: TransactionSource,
    reference: string,
    metadata?: Record<string, any>,
    initiatedBy?: Types.ObjectId,
  ) {
    this.logger.log(`Debiting wallet: ${walletId}, amount: ${amount}, reference: ${reference}`);

    const existingTx = await this.transactionRepository.findOne({ reference });
    if (existingTx) {
      this.logger.warn(`Duplicate transaction detected: ${reference}`);
      return existingTx;
    }

    const wallet = await this.walletRepository.findOne({ _id: walletId });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    if (wallet.balance < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore - amount;

    const updatedWallet = await this.walletRepository.updateBalance(
      walletId.toString(),
      -amount,
      balanceBefore,
    );

    if (!updatedWallet) {
      throw new InternalServerErrorException('Failed to update wallet balance (concurrent modification)');
    }

    const transaction = await this.transactionRepository.create({
      walletId,
      userId: wallet.userId,
      type: TransactionType.DEBIT,
      amount,
      balanceBefore,
      balanceAfter,
      status: TransactionStatus.SUCCESS,
      source,
      reference,
      description: `Debit for ${source}`,
      initiatedBy,
      metadata,
    });

    this.logger.log(`Wallet debited successfully: ${walletId}, new balance: ${balanceAfter}`);

    return transaction;
  }

  async getTransactionHistory(
    walletId: string,
    page: number = 1,
    limit: number = 50,
  ) {
    const skip = (page - 1) * limit;

    const transactions = await this.transactionRepository.findRaw()
      .find({ walletId: new Types.ObjectId(walletId) })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    const total = await this.transactionRepository.findRaw()
      .countDocuments({ walletId: new Types.ObjectId(walletId) });

    return {
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getBalance(userId: string) {
    const wallet = await this.getWalletByUserId(userId);
    return {
      balance: wallet.balance,
      ledgerBalance: wallet.ledgerBalance,
      currency: wallet.currency,
    };
  }
}
