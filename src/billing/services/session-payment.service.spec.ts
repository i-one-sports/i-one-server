import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { LOCATION_PRICING_OPTION, SESSION_STATUS } from '@app/common';
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
    verifyTransaction: jest.Mock;
  };
  let settingsService: {
    getCommissionPercentage: jest.Mock;
  };
  let platformCommissionRepository: {
    create: jest.Mock;
    findRaw: jest.Mock;
  };
  let sessionModel: {
    findOneAndUpdate: jest.Mock;
  };
  let setsService: {
    createSet: jest.Mock;
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
      verifyTransaction: jest.fn().mockRejectedValue(new Error('Transaction reference not found')),
    };
    settingsService = {
      // Default to 0% so existing amount-based assertions below don't need
      // to account for commission unless a test explicitly sets otherwise.
      getCommissionPercentage: jest.fn().mockResolvedValue(0),
    };
    platformCommissionRepository = {
      create: jest.fn(),
      findRaw: jest.fn(),
    };
    sessionModel = {
      findOneAndUpdate: jest.fn(),
    };
    setsService = {
      createSet: jest.fn().mockResolvedValue(undefined),
    };

    service = new SessionPaymentService(
      sessionPaymentRepository as any,
      walletService as any,
      paystackService as any,
      settingsService as any,
      platformCommissionRepository as any,
      sessionModel as any,
      setsService as any,
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
          baseAmount: 3000,
          commissionAmount: 0,
          commissionPercentage: 0,
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

    it('adds commission on top of the base price when a rate is configured', async () => {
      settingsService.getCommissionPercentage.mockResolvedValue(5);
      sessionPaymentRepository.find.mockResolvedValue([]);

      await service.initializeSessionPayments(
        sessionId,
        locationId,
        ownerId,
        [userOne],
        2000,
      );

      const insertedPayments =
        sessionPaymentRepository.insertMany.mock.calls[0][0];
      expect(insertedPayments[0]).toEqual(
        expect.objectContaining({
          baseAmount: 2000,
          commissionAmount: 100,
          commissionPercentage: 5,
          amount: 2100,
        }),
      );
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
        reference: 'SESSION_REF_NEW',
      });

      await expect(
        service.initializeCheckout(
          sessionId.toString(),
          userOne.toString(),
          'player@example.com',
        ),
      ).resolves.toEqual({
        authorizationUrl: 'https://paystack.test/checkout',
        reference: 'SESSION_REF_NEW',
        amount: 3000,
      });

      // No reference known to us has succeeded yet, so a fresh one is
      // generated rather than reusing the (unverified) stored reference.
      expect(paystackService.initializeTransaction).toHaveBeenCalledWith(
        'player@example.com',
        3000,
        expect.stringContaining(`SESSION_${sessionId}_USER_${userOne}_`),
        { sessionId: sessionId.toString(), userId: userOne.toString() },
      );

      // The abandoned reference is preserved so a later retry can still
      // catch a payment that completes on that old checkout tab.
      expect(sessionPaymentRepository.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $addToSet: { previousReferences: { $each: ['SESSION_REF'] } },
        }),
      );
    });

    it('confirms inline instead of charging again when an older superseded reference already succeeded on Paystack', async () => {
      const paymentId = new Types.ObjectId();
      sessionPaymentRepository.findOne.mockResolvedValue({
        _id: paymentId,
        amount: 3000,
        paymentReference: 'SESSION_REF_LATEST',
        previousReferences: ['SESSION_REF_OLD'],
      });
      // Latest reference is still unpaid, but an older, superseded one
      // (from an earlier retry) actually went through on Paystack.
      paystackService.verifyTransaction.mockImplementation((ref: string) =>
        ref === 'SESSION_REF_OLD'
          ? Promise.resolve({ status: 'success', amount: 3000 })
          : Promise.reject(new Error('Transaction reference not found')),
      );
      const confirmSpy = jest
        .spyOn(service, 'confirmSessionPayment')
        .mockResolvedValue({} as any);

      await expect(
        service.initializeCheckout(
          sessionId.toString(),
          userOne.toString(),
          'player@example.com',
        ),
      ).resolves.toEqual({ alreadyPaid: true, status: 'confirmed' });

      expect(confirmSpy).toHaveBeenCalledWith(
        sessionId,
        userOne,
        'SESSION_REF_OLD',
        3000,
      );
      expect(paystackService.initializeTransaction).not.toHaveBeenCalled();
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

    it('credits only baseAmount and records the commission when the payment has one', async () => {
      const paymentId = new Types.ObjectId();
      const walletId = new Types.ObjectId();
      const transactionId = new Types.ObjectId();

      sessionPaymentRepository.findOne.mockResolvedValue({
        _id: paymentId,
        sessionId,
        userId: userOne,
        ownerId,
        amount: 2100,
        baseAmount: 2000,
        commissionAmount: 100,
        commissionPercentage: 5,
      });
      walletService.getWalletByUserId.mockResolvedValue({ _id: walletId });
      walletService.creditWallet.mockResolvedValue({ _id: transactionId });
      sessionPaymentRepository.findOneAndUpdate.mockResolvedValue({
        _id: paymentId,
        status: PaymentStatus.PAID,
      });

      await service.confirmSessionPayment(sessionId, userOne, 'PAYSTACK_REF', 2100);

      expect(walletService.creditWallet).toHaveBeenCalledWith(
        walletId,
        2000,
        TransactionSource.SESSION_PAYMENT,
        'PAYSTACK_REF',
        expect.objectContaining({ chargedAmount: 2100, commissionAmount: 100 }),
        sessionId,
      );
      expect(platformCommissionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionPaymentId: paymentId,
          baseAmount: 2000,
          commissionAmount: 100,
          commissionPercentage: 5,
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

    it('marks the session paymentStatus COMPLETED once every member has paid', async () => {
      const paymentId = new Types.ObjectId();
      const walletId = new Types.ObjectId();
      const transactionId = new Types.ObjectId();

      sessionPaymentRepository.findOneAndUpdate
        // atomic PENDING -> PAID claim
        .mockResolvedValueOnce({ _id: paymentId, sessionId, userId: userOne, ownerId, amount: 3000 })
        // transactionId backfill at the end
        .mockResolvedValueOnce({ _id: paymentId, status: PaymentStatus.PAID, transactionId });
      walletService.getWalletByUserId.mockResolvedValue({ _id: walletId });
      walletService.creditWallet.mockResolvedValue({ _id: transactionId });
      const countDocuments = jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(0);
      sessionPaymentRepository.findRaw.mockReturnValue({ countDocuments });
      sessionModel.findOneAndUpdate.mockResolvedValue({ _id: sessionId });

      await service.confirmSessionPayment(sessionId, userOne, 'PAYSTACK_REF', 3000);
      // maybeCompleteSessionPayments's set-allocation call is fire-and-forget
      await new Promise(process.nextTick);

      expect(sessionModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: sessionId, status: SESSION_STATUS.OPEN },
        { $set: { paymentStatus: 'COMPLETED', allPaymentsCompleted: true } },
      );
      expect(setsService.createSet).toHaveBeenCalledWith(sessionId.toString());
    });

    it('does not allocate sets when the session was not actually OPEN (already cancelled, or a duplicate race)', async () => {
      const paymentId = new Types.ObjectId();
      const walletId = new Types.ObjectId();
      const transactionId = new Types.ObjectId();

      sessionPaymentRepository.findOneAndUpdate
        .mockResolvedValueOnce({ _id: paymentId, sessionId, userId: userOne, ownerId, amount: 3000 })
        .mockResolvedValueOnce({ _id: paymentId, status: PaymentStatus.PAID, transactionId });
      walletService.getWalletByUserId.mockResolvedValue({ _id: walletId });
      walletService.creditWallet.mockResolvedValue({ _id: transactionId });
      const countDocuments = jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(0);
      sessionPaymentRepository.findRaw.mockReturnValue({ countDocuments });
      sessionModel.findOneAndUpdate.mockResolvedValue(null); // no session matched the OPEN filter

      await service.confirmSessionPayment(sessionId, userOne, 'PAYSTACK_REF', 3000);
      await new Promise(process.nextTick);

      expect(setsService.createSet).not.toHaveBeenCalled();
    });

    it('does not let a set-allocation failure propagate out of payment confirmation', async () => {
      const paymentId = new Types.ObjectId();
      const walletId = new Types.ObjectId();
      const transactionId = new Types.ObjectId();

      sessionPaymentRepository.findOneAndUpdate
        .mockResolvedValueOnce({ _id: paymentId, sessionId, userId: userOne, ownerId, amount: 3000 })
        .mockResolvedValueOnce({ _id: paymentId, status: PaymentStatus.PAID, transactionId });
      walletService.getWalletByUserId.mockResolvedValue({ _id: walletId });
      walletService.creditWallet.mockResolvedValue({ _id: transactionId });
      const countDocuments = jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(0);
      sessionPaymentRepository.findRaw.mockReturnValue({ countDocuments });
      sessionModel.findOneAndUpdate.mockResolvedValue({ _id: sessionId });
      setsService.createSet.mockRejectedValue(new Error('Set already created'));

      await expect(
        service.confirmSessionPayment(sessionId, userOne, 'PAYSTACK_REF', 3000),
      ).resolves.toEqual({ _id: paymentId, status: PaymentStatus.PAID, transactionId });
    });

    it('leaves the session paymentStatus alone while other members are still unpaid', async () => {
      const paymentId = new Types.ObjectId();
      const walletId = new Types.ObjectId();
      const transactionId = new Types.ObjectId();

      sessionPaymentRepository.findOneAndUpdate
        .mockResolvedValueOnce({ _id: paymentId, sessionId, userId: userOne, ownerId, amount: 3000 })
        .mockResolvedValueOnce({ _id: paymentId, status: PaymentStatus.PAID, transactionId });
      walletService.getWalletByUserId.mockResolvedValue({ _id: walletId });
      walletService.creditWallet.mockResolvedValue({ _id: transactionId });
      const countDocuments = jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(1);
      sessionPaymentRepository.findRaw.mockReturnValue({ countDocuments });

      await service.confirmSessionPayment(sessionId, userOne, 'PAYSTACK_REF', 3000);

      expect(sessionModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(setsService.createSet).not.toHaveBeenCalled();
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
