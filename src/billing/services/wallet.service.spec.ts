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
    startTransaction: jest.Mock;
  };
  let transactionRepository: { findOne: jest.Mock; create: jest.Mock; findRaw: jest.Mock };
  let ledgerRepository: { create: jest.Mock };
  let paystackService: { initializeTransaction: jest.Mock };

  const userId = new Types.ObjectId();
  const walletId = new Types.ObjectId();

  beforeEach(() => {
    walletRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      updateBalance: jest.fn(),
      // startTransaction returns undefined when no DB connection is injected (unit test env)
      startTransaction: jest.fn().mockResolvedValue(undefined),
    };
    transactionRepository = { findOne: jest.fn(), create: jest.fn(), findRaw: jest.fn() };
    ledgerRepository = { create: jest.fn() };
    paystackService = { initializeTransaction: jest.fn() };

    const configService = { get: jest.fn((key: string, fallback?: any) => fallback) };

    service = new WalletService(
      walletRepository as any,
      transactionRepository as any,
      ledgerRepository as any,
      paystackService as any,
      configService as any,
    );
  });

  describe('createWallet', () => {
    it('creates a wallet with zero balance for a new user', async () => {
      const wallet = { _id: walletId, userId, balance: 0, status: 'ACTIVE', currency: 'NGN' };
      walletRepository.findOne.mockResolvedValue(null);
      walletRepository.create.mockResolvedValue(wallet);

      await expect(service.createWallet(userId)).resolves.toEqual(wallet);
      expect(walletRepository.create).toHaveBeenCalledWith({
        userId,
        balance: 0,
        status: 'ACTIVE',
        currency: 'NGN',
      });
    });

    it('returns existing wallet without creating a new one (idempotent)', async () => {
      const wallet = { _id: walletId, userId };
      walletRepository.findOne.mockResolvedValue(wallet);

      await expect(service.createWallet(userId)).resolves.toBe(wallet);
      expect(walletRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('creditWallet', () => {
    it('returns existing transaction for a duplicate reference without touching balance (already SUCCESS)', async () => {
      const existingTx = { _id: new Types.ObjectId(), reference: 'REF_1', status: TransactionStatus.SUCCESS };
      transactionRepository.findOne.mockResolvedValue(existingTx);

      await expect(
        service.creditWallet(walletId, 5000, TransactionSource.SESSION_PAYMENT, 'REF_1'),
      ).resolves.toBe(existingTx);

      expect(walletRepository.findOne).not.toHaveBeenCalled();
      expect(walletRepository.updateBalance).not.toHaveBeenCalled();
      expect(transactionRepository.create).not.toHaveBeenCalled();
    });

    it('updates balance and records credit transaction + ledger entry', async () => {
      const wallet = { _id: walletId, userId, balance: 2000 };
      const tx = { _id: new Types.ObjectId(), reference: 'REF_2' };

      transactionRepository.findOne.mockResolvedValue(null);
      walletRepository.findOne.mockResolvedValue(wallet);
      walletRepository.updateBalance.mockResolvedValue({ ...wallet, balance: 7000 });
      transactionRepository.create.mockResolvedValue(tx);
      ledgerRepository.create.mockResolvedValue({});

      await expect(
        service.creditWallet(walletId, 5000, TransactionSource.SESSION_PAYMENT, 'REF_2'),
      ).resolves.toBe(tx);

      expect(walletRepository.updateBalance).toHaveBeenCalledWith(walletId.toString(), 5000, 2000, undefined);
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
        { session: undefined },
      );
      expect(ledgerRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ walletId, type: 'CREDIT', amount: 5000, balanceAfter: 7000 }),
        { session: undefined },
      );
    });

    // Regression test for the wallet-funding bug: initializeWalletFunding
    // creates a PENDING transaction row at checkout time, using the same
    // reference the webhook later credits with. That row must be completed
    // in place, not mistaken for an already-processed duplicate (which was
    // silently skipping the balance update and ledger entry entirely).
    it('completes a pre-existing PENDING transaction in place instead of skipping the credit', async () => {
      const pendingTxId = new Types.ObjectId();
      const existingTx = {
        _id: pendingTxId,
        reference: 'FUND_1',
        status: TransactionStatus.PENDING,
      };
      const wallet = { _id: walletId, userId, balance: 0 };
      const updatedTx = { _id: pendingTxId, status: TransactionStatus.SUCCESS };
      const findOneAndUpdate = jest.fn().mockResolvedValue(updatedTx);

      transactionRepository.findOne.mockResolvedValue(existingTx);
      transactionRepository.findRaw.mockReturnValue({ findOneAndUpdate });
      walletRepository.findOne.mockResolvedValue(wallet);
      walletRepository.updateBalance.mockResolvedValue({ ...wallet, balance: 100000 });
      ledgerRepository.create.mockResolvedValue({});

      const result = await service.creditWallet(
        walletId,
        100000,
        TransactionSource.WALLET_FUNDING,
        'FUND_1',
      );

      expect(walletRepository.updateBalance).toHaveBeenCalledWith(walletId.toString(), 100000, 0, undefined);
      expect(findOneAndUpdate).toHaveBeenCalledWith(
        { _id: pendingTxId },
        expect.objectContaining({
          status: TransactionStatus.SUCCESS,
          balanceBefore: 0,
          balanceAfter: 100000,
          reference: 'FUND_1',
        }),
        { session: undefined, new: true },
      );
      expect(transactionRepository.create).not.toHaveBeenCalled();
      expect(ledgerRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ walletId, type: 'CREDIT', amount: 100000, balanceAfter: 100000 }),
        { session: undefined },
      );
      expect(result).toBe(updatedTx);
    });

    it('throws when the OCC balance guard detects a concurrent modification', async () => {
      transactionRepository.findOne.mockResolvedValue(null);
      walletRepository.findOne.mockResolvedValue({ _id: walletId, userId, balance: 2000 });
      walletRepository.updateBalance.mockResolvedValue(null);

      await expect(
        service.creditWallet(walletId, 5000, TransactionSource.SESSION_PAYMENT, 'REF_3'),
      ).rejects.toThrow(InternalServerErrorException);

      expect(transactionRepository.create).not.toHaveBeenCalled();
      expect(ledgerRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('debitWallet', () => {
    it('rejects when balance is insufficient', async () => {
      transactionRepository.findOne.mockResolvedValue(null);
      walletRepository.findOne.mockResolvedValue({ _id: walletId, userId, balance: 1000 });

      await expect(
        service.debitWallet(walletId, 2500, TransactionSource.WITHDRAWAL, 'REF_4'),
      ).rejects.toThrow(BadRequestException);

      expect(walletRepository.updateBalance).not.toHaveBeenCalled();
    });

    it('updates balance and records debit transaction + ledger entry', async () => {
      const tx = { _id: new Types.ObjectId(), reference: 'REF_5' };

      transactionRepository.findOne.mockResolvedValue(null);
      walletRepository.findOne.mockResolvedValue({ _id: walletId, userId, balance: 8000 });
      walletRepository.updateBalance.mockResolvedValue({ _id: walletId, userId, balance: 5500 });
      transactionRepository.create.mockResolvedValue(tx);
      ledgerRepository.create.mockResolvedValue({});

      await expect(
        service.debitWallet(walletId, 2500, TransactionSource.WITHDRAWAL, 'REF_5'),
      ).resolves.toBe(tx);

      expect(walletRepository.updateBalance).toHaveBeenCalledWith(walletId.toString(), -2500, 8000, undefined);
      expect(ledgerRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ walletId, type: 'DEBIT', amount: 2500, balanceAfter: 5500 }),
        { session: undefined },
      );
    });

    it('throws NotFoundException when wallet does not exist', async () => {
      transactionRepository.findOne.mockResolvedValue(null);
      walletRepository.findOne.mockResolvedValue(null);

      await expect(
        service.debitWallet(walletId, 2500, TransactionSource.WITHDRAWAL, 'REF_6'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
