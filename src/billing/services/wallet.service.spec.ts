import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import {
  TransactionSource,
  TransactionStatus,
  TransactionType,
} from '@app/common';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  let service: WalletService;
  let walletRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    updateBalance: jest.Mock;
  };
  let transactionRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
  };
  let dvaRepository: {
    create: jest.Mock;
    findOne: jest.Mock;
  };
  let paystackService: {
    createCustomer: jest.Mock;
    createDedicatedVirtualAccount: jest.Mock;
  };

  const userId = new Types.ObjectId();
  const walletId = new Types.ObjectId();

  beforeEach(() => {
    walletRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      updateBalance: jest.fn(),
    };
    transactionRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
    };
    dvaRepository = {
      create: jest.fn(),
      findOne: jest.fn(),
    };
    paystackService = {
      createCustomer: jest.fn(),
      createDedicatedVirtualAccount: jest.fn(),
    };

    const configService = { get: jest.fn((key: string, fallback?: any) => fallback) };

    service = new WalletService(
      walletRepository as any,
      transactionRepository as any,
      dvaRepository as any,
      paystackService as any,
      configService as any,
    );
  });

  describe('createWalletWithDVA', () => {
    it('creates a wallet, Paystack customer, and dedicated virtual account', async () => {
      const wallet = {
        _id: walletId,
        userId,
        balance: 0,
        ledgerBalance: 0,
        status: 'ACTIVE',
        currency: 'NGN',
      };
      const dva = {
        _id: new Types.ObjectId(),
        userId,
        walletId,
        accountNumber: '1234567890',
      };

      walletRepository.findOne.mockResolvedValue(null);
      walletRepository.create.mockResolvedValue(wallet);
      paystackService.createCustomer.mockResolvedValue({
        customer_code: 'CUS_123',
      });
      paystackService.createDedicatedVirtualAccount.mockResolvedValue({
        id: 99,
        account_number: '1234567890',
        account_name: 'Jane Doe',
        bank: { name: 'Titan', code: '999' },
      });
      dvaRepository.create.mockResolvedValue(dva);

      await expect(
        service.createWalletWithDVA(
          userId,
          'jane@example.com',
          'Jane',
          'Doe',
          '08012345678',
        ),
      ).resolves.toEqual({ wallet, dva });

      expect(walletRepository.create).toHaveBeenCalledWith({
        userId,
        balance: 0,
        ledgerBalance: 0,
        status: 'ACTIVE',
        currency: 'NGN',
      });
      expect(paystackService.createCustomer).toHaveBeenCalledWith(
        'jane@example.com',
        'Jane',
        'Doe',
        '08012345678',
      );
      expect(dvaRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          walletId,
          accountNumber: '1234567890',
          accountName: 'Jane Doe',
          paystackCustomerCode: 'CUS_123',
          paystackAccountReference: 99,
        }),
      );
    });

    it('reuses an existing wallet and DVA without calling Paystack (retry-safe)', async () => {
      const wallet = { _id: walletId, userId };
      const dva = { _id: new Types.ObjectId(), userId, walletId };

      walletRepository.findOne.mockResolvedValue(wallet);
      dvaRepository.findOne.mockResolvedValue(dva);

      await expect(
        service.createWalletWithDVA(userId, 'jane@example.com', 'Jane', 'Doe'),
      ).resolves.toEqual({ wallet, dva });

      expect(paystackService.createCustomer).not.toHaveBeenCalled();
      expect(walletRepository.create).not.toHaveBeenCalled();
      expect(dvaRepository.create).not.toHaveBeenCalled();
    });

    it('creates only the missing DVA when a wallet already exists (partial-failure retry)', async () => {
      const wallet = { _id: walletId, userId };
      const dva = {
        _id: new Types.ObjectId(),
        userId,
        walletId,
        accountNumber: '1234567890',
      };

      walletRepository.findOne.mockResolvedValue(wallet);
      dvaRepository.findOne.mockResolvedValue(null);
      paystackService.createCustomer.mockResolvedValue({
        customer_code: 'CUS_123',
      });
      paystackService.createDedicatedVirtualAccount.mockResolvedValue({
        id: 99,
        account_number: '1234567890',
        account_name: 'Jane Doe',
        bank: { name: 'Titan', code: '999' },
      });
      dvaRepository.create.mockResolvedValue(dva);

      await expect(
        service.createWalletWithDVA(userId, 'jane@example.com', 'Jane', 'Doe'),
      ).resolves.toEqual({ wallet, dva });

      expect(walletRepository.create).not.toHaveBeenCalled();
      expect(paystackService.createCustomer).toHaveBeenCalled();
      expect(dvaRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId, walletId: wallet._id }),
      );
    });
  });

  describe('creditWallet', () => {
    it('returns existing transaction for duplicate references without changing balance', async () => {
      const existingTransaction = {
        _id: new Types.ObjectId(),
        reference: 'REF_1',
      };
      transactionRepository.findOne.mockResolvedValue(existingTransaction);

      await expect(
        service.creditWallet(
          walletId,
          5000,
          TransactionSource.SESSION_PAYMENT,
          'REF_1',
        ),
      ).resolves.toBe(existingTransaction);

      expect(walletRepository.findOne).not.toHaveBeenCalled();
      expect(walletRepository.updateBalance).not.toHaveBeenCalled();
      expect(transactionRepository.create).not.toHaveBeenCalled();
    });

    it('updates balance atomically and records a successful credit transaction', async () => {
      const wallet = { _id: walletId, userId, balance: 2000 };
      const transaction = { _id: new Types.ObjectId(), reference: 'REF_2' };

      transactionRepository.findOne.mockResolvedValue(null);
      walletRepository.findOne.mockResolvedValue(wallet);
      walletRepository.updateBalance.mockResolvedValue({
        ...wallet,
        balance: 7000,
      });
      transactionRepository.create.mockResolvedValue(transaction);

      await expect(
        service.creditWallet(
          walletId,
          5000,
          TransactionSource.SESSION_PAYMENT,
          'REF_2',
        ),
      ).resolves.toBe(transaction);

      expect(walletRepository.updateBalance).toHaveBeenCalledWith(
        walletId.toString(),
        5000,
        2000,
      );
      expect(transactionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          walletId,
          userId,
          type: TransactionType.CREDIT,
          amount: 5000,
          balanceBefore: 2000,
          balanceAfter: 7000,
          status: TransactionStatus.SUCCESS,
          source: TransactionSource.SESSION_PAYMENT,
          reference: 'REF_2',
        }),
      );
    });

    it('fails when the wallet balance changed before the atomic update', async () => {
      transactionRepository.findOne.mockResolvedValue(null);
      walletRepository.findOne.mockResolvedValue({
        _id: walletId,
        userId,
        balance: 2000,
      });
      walletRepository.updateBalance.mockResolvedValue(null);

      await expect(
        service.creditWallet(
          walletId,
          5000,
          TransactionSource.SESSION_PAYMENT,
          'REF_3',
        ),
      ).rejects.toThrow(InternalServerErrorException);

      expect(transactionRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('debitWallet', () => {
    it('rejects debits when balance is insufficient', async () => {
      transactionRepository.findOne.mockResolvedValue(null);
      walletRepository.findOne.mockResolvedValue({
        _id: walletId,
        userId,
        balance: 1000,
      });

      await expect(
        service.debitWallet(
          walletId,
          2500,
          TransactionSource.WITHDRAWAL,
          'REF_4',
        ),
      ).rejects.toThrow(BadRequestException);

      expect(walletRepository.updateBalance).not.toHaveBeenCalled();
      expect(transactionRepository.create).not.toHaveBeenCalled();
    });

    it('updates balance atomically and records a successful debit transaction', async () => {
      const transaction = { _id: new Types.ObjectId(), reference: 'REF_5' };

      transactionRepository.findOne.mockResolvedValue(null);
      walletRepository.findOne.mockResolvedValue({
        _id: walletId,
        userId,
        balance: 8000,
      });
      walletRepository.updateBalance.mockResolvedValue({
        _id: walletId,
        userId,
        balance: 5500,
      });
      transactionRepository.create.mockResolvedValue(transaction);

      await expect(
        service.debitWallet(
          walletId,
          2500,
          TransactionSource.WITHDRAWAL,
          'REF_5',
        ),
      ).resolves.toBe(transaction);

      expect(walletRepository.updateBalance).toHaveBeenCalledWith(
        walletId.toString(),
        -2500,
        8000,
      );
      expect(transactionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: TransactionType.DEBIT,
          amount: 2500,
          balanceBefore: 8000,
          balanceAfter: 5500,
          status: TransactionStatus.SUCCESS,
          source: TransactionSource.WITHDRAWAL,
          reference: 'REF_5',
        }),
      );
    });

    it('throws when the target wallet does not exist', async () => {
      transactionRepository.findOne.mockResolvedValue(null);
      walletRepository.findOne.mockResolvedValue(null);

      await expect(
        service.debitWallet(
          walletId,
          2500,
          TransactionSource.WITHDRAWAL,
          'REF_6',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
