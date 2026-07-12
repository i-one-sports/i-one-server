import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { LOCATION_PRICING_OPTION } from '@app/common';
import { PaymentStatus } from '@app/common/schemas/session-payment.schema';
import { TransactionSource } from '@app/common/schemas/transaction.schema';
import { SessionPaymentService } from './session-payment.service';

describe('SessionPaymentService', () => {
  let service: SessionPaymentService;
  let sessionPaymentRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    insertMany: jest.Mock;
    findRaw: jest.Mock;
  };
  let walletService: {
    getWalletByUserId: jest.Mock;
    creditWallet: jest.Mock;
  };
  let paystackService: {
    initializeTransaction: jest.Mock;
  };
  let sessionModel: {
    findOneAndUpdate: jest.Mock;
  };

  const sessionId = new Types.ObjectId();
  const locationId = new Types.ObjectId();
  const ownerId = new Types.ObjectId();
  const userOne = new Types.ObjectId();
  const userTwo = new Types.ObjectId();

  beforeEach(() => {
    sessionPaymentRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      insertMany: jest.fn(),
      findRaw: jest.fn(),
    };
    walletService = {
      getWalletByUserId: jest.fn(),
      creditWallet: jest.fn(),
    };
    paystackService = {
      initializeTransaction: jest.fn(),
    };
    sessionModel = {
      findOneAndUpdate: jest.fn(),
    };

    service = new SessionPaymentService(
      sessionPaymentRepository as any,
      walletService as any,
      paystackService as any,
      sessionModel as any,
    );
  });

  describe('initializeSessionPayments', () => {
    it('creates pending payments only for members without an existing record', async () => {
      sessionPaymentRepository.find.mockResolvedValue([{ userId: userOne }]);

      await service.initializeSessionPayments(
        sessionId,
        locationId,
        ownerId,
        [userOne, userTwo],
        3000,
        undefined,
        LOCATION_PRICING_OPTION.MONTHLY,
      );

      expect(sessionPaymentRepository.insertMany).toHaveBeenCalledTimes(1);
      const insertedPayments =
        sessionPaymentRepository.insertMany.mock.calls[0][0];
      expect(insertedPayments).toHaveLength(1);
      expect(insertedPayments[0]).toEqual(
        expect.objectContaining({
          sessionId,
          locationId,
          ownerId,
          userId: userTwo,
          amount: 3000,
          status: PaymentStatus.PENDING,
          metadata: { pricingOption: LOCATION_PRICING_OPTION.MONTHLY },
        }),
      );
      expect(insertedPayments[0].paymentReference).toContain(
        `SESSION_${sessionId}_USER_${userTwo}_`,
      );
    });

    it('does nothing when every member already has a payment record', async () => {
      sessionPaymentRepository.find.mockResolvedValue([
        { userId: userOne },
        { userId: userTwo },
      ]);

      await service.initializeSessionPayments(
        sessionId,
        locationId,
        ownerId,
        [userOne, userTwo],
        3000,
      );

      expect(sessionPaymentRepository.insertMany).not.toHaveBeenCalled();
    });
  });

  describe('initializeCheckout', () => {
    it('initializes Paystack checkout from the pending payment record', async () => {
      sessionPaymentRepository.findOne.mockResolvedValue({
        amount: 3000,
        paymentReference: 'SESSION_REF',
      });
      paystackService.initializeTransaction.mockResolvedValue({
        authorization_url: 'https://paystack.test/checkout',
        reference: 'SESSION_REF',
      });

      await expect(
        service.initializeCheckout(
          sessionId.toString(),
          userOne.toString(),
          'player@example.com',
        ),
      ).resolves.toEqual({
        authorizationUrl: 'https://paystack.test/checkout',
        reference: 'SESSION_REF',
        amount: 3000,
      });

      expect(paystackService.initializeTransaction).toHaveBeenCalledWith(
        'player@example.com',
        3000,
        'SESSION_REF',
        { sessionId: sessionId.toString(), userId: userOne.toString() },
      );
    });

    it('throws when there is no pending payment for the user', async () => {
      sessionPaymentRepository.findOne.mockResolvedValue(null);

      await expect(
        service.initializeCheckout(
          sessionId.toString(),
          userOne.toString(),
          'player@example.com',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('confirmSessionPayment', () => {
    it('credits the owner wallet and marks the payment as paid', async () => {
      const paymentId = new Types.ObjectId();
      const walletId = new Types.ObjectId();
      const transactionId = new Types.ObjectId();

      sessionPaymentRepository.findOne.mockResolvedValue({
        _id: paymentId,
        sessionId,
        userId: userOne,
        ownerId,
        amount: 3000,
      });
      walletService.getWalletByUserId.mockResolvedValue({ _id: walletId });
      walletService.creditWallet.mockResolvedValue({ _id: transactionId });
      sessionPaymentRepository.findOneAndUpdate.mockResolvedValue({
        _id: paymentId,
        status: PaymentStatus.PAID,
      });

      await expect(
        service.confirmSessionPayment(sessionId, userOne, 'PAYSTACK_REF', 3000),
      ).resolves.toEqual({ _id: paymentId, status: PaymentStatus.PAID });

      expect(walletService.creditWallet).toHaveBeenCalledWith(
        walletId,
        3000,
        TransactionSource.SESSION_PAYMENT,
        'PAYSTACK_REF',
        { sessionId: sessionId.toString(), userId: userOne.toString() },
        sessionId,
      );
      expect(sessionPaymentRepository.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: paymentId },
        expect.objectContaining({
          status: PaymentStatus.PAID,
          transactionId,
          paidAt: expect.any(Date),
        }),
      );
    });

    it('rejects amount mismatches before crediting the owner wallet', async () => {
      sessionPaymentRepository.findOne.mockResolvedValue({
        _id: new Types.ObjectId(),
        ownerId,
        amount: 3000,
      });

      await expect(
        service.confirmSessionPayment(sessionId, userOne, 'PAYSTACK_REF', 2500),
      ).rejects.toThrow(BadRequestException);

      expect(walletService.creditWallet).not.toHaveBeenCalled();
      expect(sessionPaymentRepository.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('areAllPaymentsCompleted', () => {
    it('treats sessions with no payment records as complete', async () => {
      const countDocuments = jest
        .fn()
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      sessionPaymentRepository.findRaw.mockReturnValue({ countDocuments });

      await expect(service.areAllPaymentsCompleted(sessionId)).resolves.toBe(
        true,
      );
    });

    it('returns false when any payment is still unpaid', async () => {
      const countDocuments = jest
        .fn()
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(1);
      sessionPaymentRepository.findRaw.mockReturnValue({ countDocuments });

      await expect(service.areAllPaymentsCompleted(sessionId)).resolves.toBe(
        false,
      );
    });
  });

  describe('getUsersWithActiveRecurringPayment', () => {
    it('ignores hourly pricing because each session requires a fresh payment', async () => {
      await expect(
        service.getUsersWithActiveRecurringPayment(
          locationId,
          [userOne],
          LOCATION_PRICING_OPTION.HOURLY,
        ),
      ).resolves.toEqual(new Set());

      expect(sessionPaymentRepository.find).not.toHaveBeenCalled();
    });

    it('returns only users with a recent paid recurring payment', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-03T12:00:00.000Z'));
      sessionPaymentRepository.find.mockResolvedValue([
        {
          userId: userOne,
          paidAt: new Date('2026-04-25T12:00:00.000Z'),
        },
        {
          userId: userTwo,
          paidAt: new Date('2026-03-01T12:00:00.000Z'),
        },
      ]);

      await expect(
        service.getUsersWithActiveRecurringPayment(
          locationId,
          [userOne, userTwo],
          LOCATION_PRICING_OPTION.MONTHLY,
        ),
      ).resolves.toEqual(new Set([userOne.toString()]));

      jest.useRealTimers();
    });
  });
});
