import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { BankAccountRepository } from '../repositories/bank-account.repository';
import { WalletService } from './wallet.service';
import { PaystackService } from '@app/common/providers/paystack.service';
import { Types } from 'mongoose';
import { TransactionSource } from '@app/common/schemas/transaction.schema';
import { randomUUID } from 'crypto';

@Injectable()
export class WithdrawalService {
  private readonly logger = new Logger(WithdrawalService.name);

  constructor(
    private readonly bankAccountRepository: BankAccountRepository,
    private readonly walletService: WalletService,
    private readonly paystackService: PaystackService,
  ) {}

  async addBankAccount(
    userId: string,
    accountNumber: string,
    bankCode: string,
    bankName: string,
  ) {
    this.logger.log(`Adding bank account for user: ${userId}`);

    const wallet = await this.walletService.getWalletByUserId(userId);

    const resolvedAccount = await this.paystackService.resolveAccount(
      accountNumber,
      bankCode,
    );

    if (!resolvedAccount || !resolvedAccount.data) {
      throw new BadRequestException('Unable to verify bank account');
    }

    const accountName = resolvedAccount.data.account_name;

    const recipientData = await this.paystackService.createTransferRecipient(
      'nuban',
      accountName,
      accountNumber,
      bankCode,
    );

    const existingAccounts = await this.bankAccountRepository.find({
      userId: new Types.ObjectId(userId),
    });

    const isFirstAccount = existingAccounts.length === 0;

    const bankAccount = await this.bankAccountRepository.create({
      userId: new Types.ObjectId(userId),
      accountNumber,
      bankCode,
      bankName,
      accountName,
      paystackRecipientCode: recipientData.recipient_code,
      isDefault: isFirstAccount,
      status: 'ACTIVE',
    });

    this.logger.log(`Bank account added successfully for user: ${userId}`);

    return bankAccount;
  }

  async getBankAccounts(userId: string) {
    return await this.bankAccountRepository.find({
      userId: new Types.ObjectId(userId),
      status: 'ACTIVE',
    });
  }

  async getDefaultBankAccount(userId: string) {
    const defaultAccount = await this.bankAccountRepository.findOne({
      userId: new Types.ObjectId(userId),
      isDefault: true,
      status: 'ACTIVE',
    });

    if (!defaultAccount) {
      throw new NotFoundException('No default bank account found. Please add a bank account first.');
    }

    return defaultAccount;
  }

  async activatePendingBankAccounts(userId: string) {
    const pendingAccounts = await this.bankAccountRepository.find({
      userId: new Types.ObjectId(userId),
      status: 'PENDING',
    });

    if (pendingAccounts.length === 0) {
      return [];
    }

    const activeAccounts = await this.bankAccountRepository.find({
      userId: new Types.ObjectId(userId),
      status: 'ACTIVE',
    });

    const activatedAccounts = [];
    for (let index = 0; index < pendingAccounts.length; index += 1) {
      const account = pendingAccounts[index];
      const recipientData = await this.paystackService.createTransferRecipient(
        'nuban',
        account.accountName,
        account.accountNumber,
        account.bankCode,
      );

      const activated = await this.bankAccountRepository.findOneAndUpdate(
        { _id: account._id },
        {
          paystackRecipientCode: recipientData.recipient_code,
          isDefault: activeAccounts.length === 0 && index === 0,
          status: 'ACTIVE',
        },
      );

      activatedAccounts.push(activated);
    }

    return activatedAccounts;
  }

  async setDefaultBankAccount(userId: string, bankAccountId: string) {
    await this.bankAccountRepository.findRaw().updateMany(
      { userId: new Types.ObjectId(userId) },
      { $set: { isDefault: false } },
    );

    const updatedAccount = await this.bankAccountRepository.findOneAndUpdate(
      {
        _id: new Types.ObjectId(bankAccountId),
        userId: new Types.ObjectId(userId),
      },
      { isDefault: true },
    );

    if (!updatedAccount) {
      throw new NotFoundException('Bank account not found');
    }

    return updatedAccount;
  }

  async withdrawFunds(
    userId: string,
    amount: number,
    bankAccountId?: string,
    reason?: string,
  ) {
    this.logger.log(`Processing withdrawal for user: ${userId}, amount: ${amount}`);

    const wallet = await this.walletService.getWalletByUserId(userId);

    if (wallet.balance < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    let bankAccount;
    if (bankAccountId) {
      bankAccount = await this.bankAccountRepository.findOne({
        _id: new Types.ObjectId(bankAccountId),
        userId: new Types.ObjectId(userId),
        status: 'ACTIVE',
      });

      if (!bankAccount) {
        throw new NotFoundException('Bank account not found');
      }
    } else {
      bankAccount = await this.getDefaultBankAccount(userId);
    }

    if (!bankAccount.paystackRecipientCode) {
      throw new BadRequestException('Bank account is not properly configured');
    }

    const reference = `WITHDRAWAL_${randomUUID()}`;

    try {
      await this.walletService.debitWallet(
        wallet._id,
        amount,
        TransactionSource.WITHDRAWAL,
        reference,
        {
          bankAccountId: bankAccount._id.toString(),
          accountNumber: bankAccount.accountNumber,
          bankName: bankAccount.bankName,
        },
        new Types.ObjectId(userId),
      );

      const transferData = await this.paystackService.initiateTransfer(
        amount,
        bankAccount.paystackRecipientCode,
        reference,
        reason || 'Withdrawal',
      );

      this.logger.log(`Withdrawal initiated successfully: ${reference}`);

      return {
        message: 'Withdrawal request submitted successfully',
        reference,
        amount,
        bankAccount: {
          accountNumber: bankAccount.accountNumber,
          bankName: bankAccount.bankName,
          accountName: bankAccount.accountName,
        },
        transferData,
      };
    } catch (error) {
      this.logger.error(`Withdrawal failed: ${error.message}`);
      throw new BadRequestException('Withdrawal request failed. Please try again later.');
    }
  }

  async deleteBankAccount(userId: string, bankAccountId: string) {
    const bankAccount = await this.bankAccountRepository.findOne({
      _id: new Types.ObjectId(bankAccountId),
      userId: new Types.ObjectId(userId),
    });

    if (!bankAccount) {
      throw new NotFoundException('Bank account not found');
    }

    if (bankAccount.isDefault) {
      const otherAccounts = await this.bankAccountRepository.find({
        userId: new Types.ObjectId(userId),
        _id: { $ne: new Types.ObjectId(bankAccountId) },
        status: 'ACTIVE',
      });

      if (otherAccounts.length > 0) {
        await this.bankAccountRepository.findOneAndUpdate(
          { _id: otherAccounts[0]._id },
          { isDefault: true },
        );
      }
    }

    await this.bankAccountRepository.findOneAndUpdate(
      { _id: new Types.ObjectId(bankAccountId) },
      { status: 'INACTIVE' },
    );

    return { message: 'Bank account deleted successfully' };
  }
}
