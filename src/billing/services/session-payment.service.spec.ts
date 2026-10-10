import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { LOCATION_PRICING_OPTION, SESSION_PAYMENT_MODE, SESSION_STATUS, USER_ROLE } from '@app/common';
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
    create: jest.Mock;
  };
  let walletService: {
    getWalletByUserId: jest.Mock;
    creditWallet: jest.Mock;
  };
  let paystackService: {
    initializeTransaction: jest.Mock;
    verifyTransaction: jest.Mock;
    refundTransaction: jest.Mock;
  };
  let settingsService: {
    getCommissionPercentage: jest.Mock;
    getMinContributionAmount: jest.Mock;
  };
  let platformCommissionRepository: {
    create: jest.Mock;
    findRaw: jest.Mock;
  };
  let sessionModel: {
    findOneAndUpdate: jest.Mock;
    findById: jest.Mock;
    updateOne: jest.Mock;
  };
  let locationModel: { findById: jest.Mock };
  let eventService: { emitPoolUpdate: jest.Mock };
  let setsService: {
    createSet: jest.Mock;
  };

  const sessionId = new Types.ObjectId();
  const locationId = new Types.ObjectId();
  const ownerId = new Types.ObjectId();
  const userOne = new Types.ObjectId();
  const userTwo = new Types.ObjectId();

  // Mongoose query stand-in supporting `.lean()` / `.select().lean()` / await.
  const query = (value: any) => {
    const q: any = Promise.resolve(value);
    q.lean = () => Promise.resolve(value);
    q.select = () => q;
    return q;
  };

  beforeEach(() => {
    sessionPaymentRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      insertMany: jest.fn(),
      findRaw: jest.fn(),
      create: jest.fn(),
    };
    walletService = {
      getWalletByUserId: jest.fn(),
      creditWallet: jest.fn(),
    };
    paystackService = {
      initializeTransaction: jest.fn(),
      verifyTransaction: jest.fn().mockRejectedValue(new Error('Transaction reference not found')),
      refundTransaction: jest.fn().mockResolvedValue({ id: 999 }),
    };
    settingsService = {
      // Default to 0% so existing amount-based assertions below don't need
      // to account for commission unless a test explicitly sets otherwise.
      getCommissionPercentage: jest.fn().mockResolvedValue(0),
      getMinContributionAmount: jest.fn().mockResolvedValue(50000),
    };
    platformCommissionRepository = {
      create: jest.fn(),
      findRaw: jest.fn(),
    };
    sessionModel = {
      findOneAndUpdate: jest.fn(),
      // Legacy (PER_PERSON) session by default — no paymentMode.
      findById: jest.fn().mockReturnValue(query({ _id: sessionId })),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    locationModel = { findById: jest.fn().mockReturnValue(query({ owner: ownerId })) };
    eventService = { emitPoolUpdate: jest.fn().mockResolvedValue(undefined) };
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
      locationModel as any,
      eventService as any,
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

      sessionPaymentRepository.findOneAndUpdate
        .mockResolvedValueOnce({ _id: paymentId, sessionId, userId: userOne, ownerId, amount: 3000 })
        .mockResolvedValueOnce({ _id: paymentId, status: PaymentStatus.PAID, transactionId });
      walletService.getWalletByUserId.mockResolvedValue({ _id: walletId });
      walletService.creditWallet.mockResolvedValue({ _id: transactionId });
      sessionPaymentRepository.findRaw.mockReturnValue({
        countDocuments: jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1),
      });

      await expect(
        service.confirmSessionPayment(sessionId, userOne, 'PAYSTACK_REF', 3000),
      ).resolves.toEqual({ _id: paymentId, status: PaymentStatus.PAID, transactionId });

      expect(sessionPaymentRepository.findOneAndUpdate).toHaveBeenNthCalledWith(
        1,
        { sessionId, userId: userOne, status: PaymentStatus.PENDING },
        expect.objectContaining({ status: PaymentStatus.PAID, paidAt: expect.any(Date) }),
      );
      expect(walletService.creditWallet).toHaveBeenCalledWith(
        walletId,
        3000,
        TransactionSource.SESSION_PAYMENT,
        'PAYSTACK_REF',
        expect.objectContaining({ sessionId: sessionId.toString(), userId: userOne.toString() }),
        sessionId,
      );
      expect(sessionPaymentRepository.findOneAndUpdate).toHaveBeenNthCalledWith(
        2,
        { _id: paymentId },
        { transactionId },
      );
    });

    it('credits only baseAmount and records the commission when the payment has one', async () => {
      const paymentId = new Types.ObjectId();
      const walletId = new Types.ObjectId();
      const transactionId = new Types.ObjectId();

      sessionPaymentRepository.findOneAndUpdate.mockResolvedValueOnce({
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
      sessionPaymentRepository.findRaw.mockReturnValue({
        countDocuments: jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1),
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
      const paymentId = new Types.ObjectId();
      sessionPaymentRepository.findOneAndUpdate.mockResolvedValue({
        _id: paymentId,
        ownerId,
        amount: 3000,
      });

      await expect(
        service.confirmSessionPayment(sessionId, userOne, 'PAYSTACK_REF', 2500),
      ).rejects.toThrow(BadRequestException);

      expect(walletService.creditWallet).not.toHaveBeenCalled();
      // claim is reverted back to PENDING
      expect(sessionPaymentRepository.findOneAndUpdate).toHaveBeenLastCalledWith(
        { _id: paymentId },
        { status: PaymentStatus.PENDING, paidAt: null },
      );
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

  describe('POOL payments', () => {
    const TARGET = 2000000; // ₦20,000 for the pitch
    const poolSession = (overrides: any = {}) => ({
      _id: sessionId,
      location: locationId,
      members: [userOne, userTwo],
      status: SESSION_STATUS.OPEN,
      paymentRequired: true,
      paymentMode: SESSION_PAYMENT_MODE.POOL,
      paymentStatus: 'PENDING',
      paymentTarget: TARGET,
      amountPaid: 0,
      amountReserved: 0,
      ...overrides,
    });
    const poolRow = (overrides: any = {}) => ({
      _id: new Types.ObjectId(),
      sessionId,
      userId: userOne,
      ownerId,
      amount: 1050000,
      baseAmount: 1000000,
      commissionAmount: 50000,
      commissionPercentage: 5,
      status: PaymentStatus.PENDING,
      paymentReference: 'POOL_REF',
      metadata: { paymentMode: SESSION_PAYMENT_MODE.POOL },
      ...overrides,
    });
    // getPoolSnapshot's aggregate (PAID contributions grouped by user)
    const contributions = (rows: Array<{ userId: Types.ObjectId; amount: number }>) =>
      sessionPaymentRepository.findRaw.mockReturnValue({
        aggregate: jest.fn().mockResolvedValue(
          rows.map((r) => ({ _id: r.userId, amount: r.amount, user: { firstName: 'Ada' } })),
        ),
      });

    beforeEach(() => {
      sessionModel.findById.mockReturnValue(query(poolSession()));
      sessionPaymentRepository.find.mockResolvedValue([]);
      contributions([]);
    });

    describe('checkout', () => {
      it('reserves the amount atomically, records the contribution, and charges base + commission', async () => {
        settingsService.getCommissionPercentage.mockResolvedValue(5);
        sessionModel.findOneAndUpdate.mockResolvedValue(poolSession({ amountReserved: 1000000 }));
        sessionPaymentRepository.create.mockImplementation(async (doc: any) => ({ _id: new Types.ObjectId(), ...doc }));
        paystackService.initializeTransaction.mockResolvedValue({ authorization_url: 'https://pay', reference: 'R' });

        const result = await service.initializeCheckout(sessionId.toString(), userOne.toString(), 'a@b.c', 1000000);

        // atomic guard: paid + reserved + amount <= target, then reserve
        const [filter, update] = sessionModel.findOneAndUpdate.mock.calls[0];
        expect(filter).toMatchObject({ _id: sessionId, paymentMode: SESSION_PAYMENT_MODE.POOL, paymentStatus: 'PENDING' });
        expect(filter.$expr).toEqual({
          $lte: [
            { $add: [{ $ifNull: ['$amountPaid', 0] }, { $ifNull: ['$amountReserved', 0] }, 1000000] },
            '$paymentTarget',
          ],
        });
        expect(update).toEqual({ $inc: { amountReserved: 1000000 } });

        expect(sessionPaymentRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionId,
            userId: userOne,
            ownerId,
            baseAmount: 1000000,
            commissionAmount: 50000,
            amount: 1050000,
            status: PaymentStatus.PENDING,
            expiresAt: expect.any(Date),
            metadata: { paymentMode: SESSION_PAYMENT_MODE.POOL },
          }),
        );
        expect(paystackService.initializeTransaction).toHaveBeenCalledWith(
          'a@b.c',
          1050000,
          expect.stringContaining(`SESSION_${sessionId}_USER_${userOne}_`),
          expect.objectContaining({ sessionId: sessionId.toString(), userId: userOne.toString() }),
        );
        expect(result).toMatchObject({ authorizationUrl: 'https://pay', amount: 1050000, baseAmount: 1000000 });
        expect(eventService.emitPoolUpdate).toHaveBeenCalledWith(expect.anything(), 'reserved');
      });

      it('lets one player cover the whole pot', async () => {
        sessionModel.findOneAndUpdate.mockResolvedValue(poolSession({ amountReserved: TARGET }));
        sessionPaymentRepository.create.mockImplementation(async (doc: any) => ({ _id: new Types.ObjectId(), ...doc }));
        paystackService.initializeTransaction.mockResolvedValue({ authorization_url: 'u', reference: 'r' });

        await expect(
          service.initializeCheckout(sessionId.toString(), userOne.toString(), 'a@b.c', TARGET),
        ).resolves.toMatchObject({ baseAmount: TARGET });
      });

      it('rejects with 409 and the live pool when the amount no longer fits', async () => {
        sessionModel.findOneAndUpdate.mockResolvedValue(null); // guard didn't match
        contributions([{ userId: userTwo, amount: 1500000 }]); // only ₦5,000 left

        const err = await service
          .initializeCheckout(sessionId.toString(), userOne.toString(), 'a@b.c', 1000000)
          .catch((e) => e);

        expect(err).toBeInstanceOf(ConflictException);
        expect(err.getResponse().pool).toMatchObject({ remaining: 500000, available: 500000 });
        expect(sessionPaymentRepository.create).not.toHaveBeenCalled();
        expect(paystackService.initializeTransaction).not.toHaveBeenCalled();
      });

      it('only allows less than the minimum when it exactly clears the pot', async () => {
        sessionModel.findOneAndUpdate.mockResolvedValue(null);
        contributions([{ userId: userTwo, amount: 1900000 }]); // ₦1,000 left, min is ₦500

        await expect(
          service.initializeCheckout(sessionId.toString(), userOne.toString(), 'a@b.c', 10000),
        ).rejects.toThrow(BadRequestException);

        const [filter] = sessionModel.findOneAndUpdate.mock.calls[0];
        expect(filter.$expr.$eq).toBeDefined(); // below min → must equal target exactly
      });

      it('refuses non-members', async () => {
        await expect(
          service.initializeCheckout(sessionId.toString(), new Types.ObjectId().toString(), 'a@b.c', 100000),
        ).rejects.toThrow(ForbiddenException);
        expect(sessionModel.findOneAndUpdate).not.toHaveBeenCalled();
      });

      it('releases the reservation if Paystack fails to start the checkout', async () => {
        sessionModel.findOneAndUpdate.mockResolvedValue(poolSession());
        const created = poolRow({ baseAmount: 1000000 });
        sessionPaymentRepository.create.mockResolvedValue(created);
        sessionPaymentRepository.findOneAndUpdate.mockResolvedValue({ ...created, status: PaymentStatus.EXPIRED });
        paystackService.initializeTransaction.mockRejectedValue(new Error('Paystack down'));

        await expect(
          service.initializeCheckout(sessionId.toString(), userOne.toString(), 'a@b.c', 1000000),
        ).rejects.toThrow(BadRequestException);

        expect(sessionPaymentRepository.findOneAndUpdate).toHaveBeenCalledWith(
          { _id: created._id, status: PaymentStatus.PENDING },
          { status: PaymentStatus.EXPIRED },
        );
        expect(sessionModel.updateOne).toHaveBeenCalledWith(
          { _id: sessionId },
          { $inc: { amountReserved: -1000000 } },
        );
      });
    });

    describe('confirmation', () => {
      const walletId = new Types.ObjectId();
      const transactionId = new Types.ObjectId();

      beforeEach(() => {
        walletService.getWalletByUserId.mockResolvedValue({ _id: walletId });
        walletService.creditWallet.mockResolvedValue({ _id: transactionId });
      });

      it('credits the owner the base, moves reserved → paid, and completes the pot when full', async () => {
        const row = poolRow({ amount: TARGET, baseAmount: TARGET, commissionAmount: 0 });
        sessionPaymentRepository.findOne.mockResolvedValue(row);
        sessionPaymentRepository.findOneAndUpdate
          .mockResolvedValueOnce({ ...row, status: PaymentStatus.PAID }) // PENDING → PAID
          .mockResolvedValueOnce({ ...row, status: PaymentStatus.PAID, transactionId });
        sessionModel.findOneAndUpdate
          .mockReturnValueOnce(query(poolSession({ amountPaid: TARGET, amountReserved: 0 }))) // $inc
          .mockResolvedValueOnce({ _id: sessionId }); // funded flip

        await service.confirmSessionPayment(sessionId, userOne, 'POOL_REF', TARGET);
        await new Promise(process.nextTick);

        expect(walletService.creditWallet).toHaveBeenCalledWith(
          walletId, TARGET, TransactionSource.SESSION_PAYMENT, 'POOL_REF', expect.anything(), sessionId,
        );
        expect(sessionModel.findOneAndUpdate).toHaveBeenNthCalledWith(
          1,
          { _id: sessionId },
          { $inc: { amountPaid: TARGET, amountReserved: -TARGET } },
          { new: true },
        );
        expect(sessionModel.findOneAndUpdate).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ _id: sessionId, paymentStatus: { $ne: 'COMPLETED' } }),
          { $set: { paymentStatus: 'COMPLETED', allPaymentsCompleted: true } },
        );
        expect(setsService.createSet).toHaveBeenCalledWith(sessionId.toString());
        expect(paystackService.refundTransaction).not.toHaveBeenCalled();
      });

      it('is idempotent: a repeat confirmation returns the existing record and credits nothing', async () => {
        const row = poolRow({ status: PaymentStatus.PAID });
        sessionPaymentRepository.findOne.mockResolvedValue(row);
        sessionPaymentRepository.findOneAndUpdate.mockResolvedValue(null); // neither claim matches

        await expect(
          service.confirmSessionPayment(sessionId, userOne, 'POOL_REF', row.amount),
        ).resolves.toEqual(row);
        expect(walletService.creditWallet).not.toHaveBeenCalled();
        expect(sessionModel.findOneAndUpdate).not.toHaveBeenCalled();
      });

      it('refunds a late payment that would overfund the pot', async () => {
        const row = poolRow({ status: PaymentStatus.EXPIRED });
        sessionPaymentRepository.findOne
          .mockResolvedValueOnce(row) // lookup by reference
          .mockResolvedValueOnce({ ...row, status: PaymentStatus.PAID }); // refundPayment's read
        sessionPaymentRepository.findOneAndUpdate
          .mockResolvedValueOnce(null) // not PENDING
          .mockResolvedValueOnce({ ...row, status: PaymentStatus.PAID }) // EXPIRED → PAID
          .mockResolvedValueOnce({ ...row, status: PaymentStatus.PAID, transactionId })
          .mockResolvedValueOnce({ ...row, status: PaymentStatus.REFUND_PENDING }); // refund requested
        sessionModel.findOneAndUpdate.mockReturnValueOnce(
          query(poolSession({ amountPaid: TARGET + 1000000, paymentStatus: 'COMPLETED' })),
        );

        await service.confirmSessionPayment(sessionId, userOne, 'POOL_REF', row.amount);

        // late payment: only amountPaid moves (its reservation was already released)
        expect(sessionModel.findOneAndUpdate).toHaveBeenCalledWith(
          { _id: sessionId },
          { $inc: { amountPaid: 1000000 } },
          { new: true },
        );
        // owner credited, then full refund requested and pulled back out of the pot
        expect(walletService.creditWallet).toHaveBeenCalled();
        expect(paystackService.refundTransaction).toHaveBeenCalledWith('POOL_REF', row.amount, 'Session was already fully paid');
        expect(sessionModel.updateOne).toHaveBeenCalledWith({ _id: sessionId }, { $inc: { amountPaid: -1000000 } });
        expect(setsService.createSet).not.toHaveBeenCalled();
      });

      it('refunds a payment from someone who is no longer in the session', async () => {
        const row = poolRow();
        sessionPaymentRepository.findOne
          .mockResolvedValueOnce(row)
          .mockResolvedValueOnce({ ...row, status: PaymentStatus.PAID });
        sessionPaymentRepository.findOneAndUpdate
          .mockResolvedValueOnce({ ...row, status: PaymentStatus.PAID })
          .mockResolvedValueOnce({ ...row, status: PaymentStatus.PAID, transactionId })
          .mockResolvedValueOnce({ ...row, status: PaymentStatus.REFUND_PENDING });
        sessionModel.findOneAndUpdate.mockReturnValueOnce(
          query(poolSession({ members: [userTwo], amountPaid: 1000000 })),
        );

        await service.confirmSessionPayment(sessionId, userOne, 'POOL_REF', row.amount);

        expect(paystackService.refundTransaction).toHaveBeenCalledWith(
          'POOL_REF', row.amount, 'Player is no longer in this session',
        );
      });
    });

    describe('reservation expiry', () => {
      it('confirms instead of releasing when Paystack shows the payment succeeded', async () => {
        const row = poolRow();
        sessionPaymentRepository.find.mockResolvedValue([row]);
        paystackService.verifyTransaction.mockResolvedValue({ status: 'success', amount: row.amount });
        const confirm = jest.spyOn(service as any, 'confirmPoolContribution').mockResolvedValue(row);

        await service.expireStaleReservations();

        expect(confirm).toHaveBeenCalledWith(row, 'POOL_REF', row.amount);
        expect(sessionModel.updateOne).not.toHaveBeenCalled();
      });

      it('releases the reservation when Paystack has no successful charge', async () => {
        const row = poolRow();
        sessionPaymentRepository.find.mockResolvedValue([row]);
        paystackService.verifyTransaction.mockRejectedValue({ response: { status: 400 } });
        sessionPaymentRepository.findOneAndUpdate.mockResolvedValue({ ...row, status: PaymentStatus.EXPIRED });

        await service.expireStaleReservations();

        expect(sessionPaymentRepository.findOneAndUpdate).toHaveBeenCalledWith(
          { _id: row._id, status: PaymentStatus.PENDING },
          { status: PaymentStatus.EXPIRED },
        );
        expect(sessionModel.updateOne).toHaveBeenCalledWith({ _id: sessionId }, { $inc: { amountReserved: -1000000 } });
      });

      it('keeps the reservation when Paystack cannot be reached', async () => {
        sessionPaymentRepository.find.mockResolvedValue([poolRow()]);
        paystackService.verifyTransaction.mockRejectedValue(new Error('ECONNRESET'));

        await service.expireStaleReservations();

        expect(sessionPaymentRepository.findOneAndUpdate).not.toHaveBeenCalled();
        expect(sessionModel.updateOne).not.toHaveBeenCalled();
      });
    });

    describe('member leaving', () => {
      it('refunds their contributions while the pot is not yet full', async () => {
        const paidRow = poolRow({ status: PaymentStatus.PAID });
        sessionPaymentRepository.find
          .mockResolvedValueOnce([]) // no open reservations
          .mockResolvedValueOnce([paidRow]);
        sessionPaymentRepository.findOne.mockResolvedValue(paidRow);
        sessionPaymentRepository.findOneAndUpdate.mockResolvedValue({ ...paidRow, status: PaymentStatus.REFUND_PENDING });

        await expect(
          service.handlePoolMemberLeave(sessionId.toString(), userOne.toString()),
        ).resolves.toEqual({ refunded: 1 });
        expect(paystackService.refundTransaction).toHaveBeenCalledWith('POOL_REF', paidRow.amount, 'Player left session');
        expect(sessionModel.updateOne).toHaveBeenCalledWith({ _id: sessionId }, { $inc: { amountPaid: -1000000 } });
      });

      it('gives no refund once the pot is full', async () => {
        sessionModel.findById.mockReturnValue(query(poolSession({ paymentStatus: 'COMPLETED' })));

        await expect(
          service.handlePoolMemberLeave(sessionId.toString(), userOne.toString()),
        ).resolves.toEqual({ refunded: 0 });
        expect(paystackService.refundTransaction).not.toHaveBeenCalled();
      });
    });

    describe('snapshot', () => {
      it('derives paid from the rows and suggests a fair share for whoever has not paid', async () => {
        sessionModel.findById.mockReturnValue(
          query(poolSession({ members: [userOne, userTwo, new Types.ObjectId()], amountPaid: 1000000, amountReserved: 200000 })),
        );
        contributions([{ userId: userOne, amount: 1000000 }]);

        await expect(service.getPoolSnapshot(sessionId.toString())).resolves.toMatchObject({
          target: TARGET,
          paid: 1000000,
          reserved: 200000,
          remaining: 1000000,
          available: 800000,
          fairShare: 500000, // ₦10,000 left across the 2 who haven't paid
          fullyFunded: false,
          contributors: [{ userId: userOne.toString(), amount: 1000000 }],
        });
      });

      it('treats a POOL session as paid for match start only once the pot is full', async () => {
        sessionModel.findById.mockReturnValue(query(poolSession({ paymentStatus: 'PENDING' })));
        await expect(service.areAllPaymentsCompleted(sessionId)).resolves.toBe(false);

        sessionModel.findById.mockReturnValue(query(poolSession({ paymentStatus: 'COMPLETED' })));
        await expect(service.areAllPaymentsCompleted(sessionId)).resolves.toBe(true);
      });
    });
  });

  describe('assertCanViewSessionPayments', () => {
    const memberSession = { _id: sessionId, location: locationId, members: [userOne] };

    beforeEach(() => {
      sessionModel.findById.mockReturnValue(query(memberSession));
    });

    it('lets members, the pitch owner, and super-admin through', async () => {
      await expect(service.assertCanViewSessionPayments(sessionId.toString(), { _id: userOne })).resolves.toBeDefined();
      await expect(service.assertCanViewSessionPayments(sessionId.toString(), { _id: ownerId })).resolves.toBeDefined();
      await expect(
        service.assertCanViewSessionPayments(sessionId.toString(), { _id: new Types.ObjectId(), role: USER_ROLE.SUPER_ADMIN }),
      ).resolves.toBeDefined();
    });

    it('refuses anyone else', async () => {
      await expect(
        service.assertCanViewSessionPayments(sessionId.toString(), { _id: userTwo }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('404s on an unknown or malformed session id', async () => {
      sessionModel.findById.mockReturnValue(query(null));
      await expect(
        service.assertCanViewSessionPayments(sessionId.toString(), { _id: userOne }),
      ).rejects.toThrow(NotFoundException);
      await expect(service.assertCanViewSessionPayments('not-an-id', { _id: userOne })).rejects.toThrow(NotFoundException);
    });
  });
});
