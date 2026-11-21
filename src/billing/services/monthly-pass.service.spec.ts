import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { LOCATION_PRICING_OPTION, LOCATION_STATUS, LOCATION_TIER, MONTHLY_PASS_STATUS } from '@app/common';
import { TransactionSource } from '@app/common/schemas/transaction.schema';
import { PaystackService } from '@app/common/providers/paystack.service';
import { LocationRepository } from 'src/locations/locations.repository';
import { MonthlyPassRepository, MonthlyPassRow } from '../repositories/monthly-pass.repository';
import { PaymentIdempotencyKeyRepository } from '../repositories/payment-idempotency-key.repository';
import { MonthlyPassService } from './monthly-pass.service';
import { PlatformPostingService } from './platform-posting.service';
import { WalletService } from './wallet.service';

const DAY = 24 * 60 * 60 * 1000;

describe('MonthlyPassService', () => {
  const userId = new Types.ObjectId();
  const ownerId = new Types.ObjectId();
  const pitchId = new Types.ObjectId();
  const ownerWalletId = new Types.ObjectId();

  // ₦20,000 pass, 15% commission, ₦100 processing fee → player pays ₦23,100.
  const monthlyPitch = () => ({
    _id: pitchId, owner: ownerId, status: LOCATION_STATUS.ACTIVE, tier: LOCATION_TIER.PAID,
    pricingOption: LOCATION_PRICING_OPTION.MONTHLY, paymentPerPersonMonthly: 2_000_000, monthlyPassSalesPaused: false,
  });
  const pendingPass = (over: Partial<MonthlyPassRow> = {}): MonthlyPassRow => ({
    _id: new Types.ObjectId(), userId, locationId: pitchId, ownerId,
    baseAmount: 2_000_000, commissionAmount: 300_000, commissionPercentage: 15, processingFee: 10_000, amount: 2_310_000,
    status: MONTHLY_PASS_STATUS.PENDING, paymentReference: 'REF_1', previousReferences: [], expiresAt: new Date(Date.now() + 60_000),
    ...over,
  });

  let passes: Record<string, jest.Mock>;
  let locations: { findOne: jest.Mock };
  let paystack: Record<string, jest.Mock>;
  let keys: Record<string, jest.Mock>;
  let posting: Record<string, jest.Mock>;
  let wallets: Record<string, jest.Mock>;
  let service: MonthlyPassService;

  beforeEach(() => {
    passes = {
      findByReference: jest.fn(),
      findOpenCheckout: jest.fn().mockResolvedValue(null),
      latestEndsAt: jest.fn().mockResolvedValue(null),
      transition: jest.fn(),
      create: jest.fn(),
      findOneAndUpdate: jest.fn().mockImplementation((_q, u) => Promise.resolve(u)),
      findRefundByPaidReference: jest.fn(),
      findLapsedCheckouts: jest.fn().mockResolvedValue([]),
    };
    locations = { findOne: jest.fn().mockResolvedValue(monthlyPitch()) };
    paystack = {
      initializeTransaction: jest.fn().mockResolvedValue({ authorization_url: 'https://pay/x', access_code: 'ac', reference: 'NEW' }),
      verifyTransaction: jest.fn().mockRejectedValue({ response: { status: 400 } }),
      refundTransaction: jest.fn().mockResolvedValue({ id: 77 }),
    };
    keys = {
      findOpen: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
      complete: jest.fn(), close: jest.fn(), closeByReference: jest.fn(),
    };
    posting = {
      priceShare: jest.fn().mockResolvedValue({ commissionPercentage: 15, commissionAmount: 300_000, processingFee: 10_000, amount: 2_310_000 }),
      postPlatformEntries: jest.fn(), postPaystackFee: jest.fn(),
    };
    wallets = {
      getWalletByUserId: jest.fn().mockResolvedValue({ _id: ownerWalletId }),
      creditWallet: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    };
    service = new MonthlyPassService(
      passes as unknown as MonthlyPassRepository,
      locations as unknown as LocationRepository,
      paystack as unknown as PaystackService,
      keys as unknown as PaymentIdempotencyKeyRepository,
      posting as unknown as PlatformPostingService,
      wallets as unknown as WalletService,
    );
  });

  const errorCode = async (promise: Promise<unknown>) =>
    promise.then(() => null, (e: { getResponse: () => { details?: { code?: string } } }) => e.getResponse().details?.code);

  describe('checkout', () => {
    const user = { _id: userId, email: 'p@x.com' };

    it('creates a pending pass at the pitch price and opens Paystack with MONTHLY_PASS metadata', async () => {
      passes.create.mockImplementation((doc) => Promise.resolve({ _id: new Types.ObjectId(), ...doc }));
      const result = await service.checkout(pitchId.toString(), user);

      const created = passes.create.mock.calls[0][0];
      expect(created).toMatchObject({ baseAmount: 2_000_000, amount: 2_310_000, status: MONTHLY_PASS_STATUS.PENDING, ownerId });
      expect(created.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 60_000);
      expect(paystack.initializeTransaction).toHaveBeenCalledWith('p@x.com', 2_310_000, created.paymentReference,
        expect.objectContaining({ type: 'MONTHLY_PASS', passId: expect.any(String) }));
      expect(result).toMatchObject({ authorizationUrl: 'https://pay/x', amount: 2_310_000, baseAmount: 2_000_000 });
      expect(keys.complete).toHaveBeenCalled();
    });

    it('refuses a pitch that is not monthly, and one with sales paused', async () => {
      locations.findOne.mockResolvedValue({ ...monthlyPitch(), pricingOption: LOCATION_PRICING_OPTION.HOURLY });
      expect(await errorCode(service.checkout(pitchId.toString(), user))).toBe('NOT_A_MONTHLY_PITCH');
      locations.findOne.mockResolvedValue({ ...monthlyPitch(), monthlyPassSalesPaused: true });
      expect(await errorCode(service.checkout(pitchId.toString(), user))).toBe('PASS_SALES_PAUSED');
      expect(passes.create).not.toHaveBeenCalled();
    });

    it('a repeat tap gets the same checkout back', async () => {
      const pass = pendingPass({ paymentReference: 'REF_OPEN' });
      keys.findOpen.mockResolvedValue({ _id: new Types.ObjectId(), updatedAt: new Date(), response: { authorizationUrl: 'https://pay/open', reference: 'REF_OPEN' } });
      passes.findByReference.mockResolvedValue(pass);
      await expect(service.checkout(pitchId.toString(), user)).resolves.toMatchObject({ authorizationUrl: 'https://pay/open', reference: 'REF_OPEN' });
      expect(paystack.initializeTransaction).not.toHaveBeenCalled();
    });

    it('if an earlier page was paid (webhook missed), confirms it instead of charging again', async () => {
      const pass = pendingPass();
      passes.findOpenCheckout.mockResolvedValue(pass);
      paystack.verifyTransaction.mockResolvedValue({ status: 'success', amount: 2_310_000, fees: 44_650 });
      passes.findByReference.mockResolvedValue(pass);
      passes.transition.mockResolvedValue({ ...pass, status: MONTHLY_PASS_STATUS.ACTIVE, paidReference: 'REF_1', startsAt: new Date(), endsAt: new Date(Date.now() + 30 * DAY) });

      await expect(service.checkout(pitchId.toString(), user)).resolves.toMatchObject({ alreadyPaid: true });
      expect(paystack.initializeTransaction).not.toHaveBeenCalled();
    });

    it('an abandoned checkout at an old price is cancelled and a new one made at the new price', async () => {
      passes.findOpenCheckout.mockResolvedValue(pendingPass({ baseAmount: 1_500_000 }));
      passes.create.mockImplementation((doc) => Promise.resolve({ _id: new Types.ObjectId(), ...doc }));
      await service.checkout(pitchId.toString(), user);
      expect(passes.transition).toHaveBeenCalledWith(expect.any(Types.ObjectId), MONTHLY_PASS_STATUS.PENDING, { status: MONTHLY_PASS_STATUS.CANCELLED });
      expect(passes.create.mock.calls[0][0]).toMatchObject({ baseAmount: 2_000_000 });
    });
  });

  describe('confirmPass (webhook)', () => {
    it('activates for 30 days from now and posts the owner credit + platform entries', async () => {
      const pass = pendingPass();
      passes.findByReference.mockResolvedValue(pass);
      passes.transition.mockImplementation((_id, _from, update) => Promise.resolve({ ...pass, ...update }));

      const active = await service.confirmPass('REF_1', 2_310_000, 44_650);

      const update = passes.transition.mock.calls[0][2];
      expect(update.status).toBe(MONTHLY_PASS_STATUS.ACTIVE);
      expect(update.endsAt.getTime() - update.startsAt.getTime()).toBe(30 * DAY);
      expect(Math.abs(update.startsAt.getTime() - Date.now())).toBeLessThan(5_000);
      expect(wallets.creditWallet).toHaveBeenCalledWith(ownerWalletId, 2_000_000, TransactionSource.MONTHLY_PASS, 'REF_1', expect.any(Object));
      expect(posting.postPlatformEntries).toHaveBeenCalledWith(expect.objectContaining({ reference: 'REF_1', commissionAmount: 300_000, processingFee: 10_000, paystackFee: 44_650 }));
      expect(keys.closeByReference).toHaveBeenCalledWith('REF_1', 'PAID');
      expect(active?.status).toBe(MONTHLY_PASS_STATUS.ACTIVE);
    });

    it('renewing early queues the new pass after the current one (no lost days)', async () => {
      const currentEnds = new Date(Date.now() + 10 * DAY);
      passes.latestEndsAt.mockResolvedValue(currentEnds);
      const pass = pendingPass();
      passes.findByReference.mockResolvedValue(pass);
      passes.transition.mockImplementation((_id, _from, update) => Promise.resolve({ ...pass, ...update }));

      await service.confirmPass('REF_1', 2_310_000);
      const update = passes.transition.mock.calls[0][2];
      expect(update.startsAt).toEqual(currentEnds);
      expect(update.endsAt.getTime()).toBe(currentEnds.getTime() + 30 * DAY);
    });

    it('a redelivered webhook re-runs the (idempotent) postings and changes nothing else', async () => {
      passes.findByReference.mockResolvedValue(pendingPass({ status: MONTHLY_PASS_STATUS.ACTIVE, paidReference: 'REF_1' }));
      await service.confirmPass('REF_1', 2_310_000);
      expect(passes.transition).not.toHaveBeenCalled();
      expect(wallets.creditWallet).toHaveBeenCalledTimes(1);
      expect(paystack.refundTransaction).not.toHaveBeenCalled();
    });

    it('a second charge for a paid pass is recorded and refunded in full, never credited', async () => {
      const paid = pendingPass({ status: MONTHLY_PASS_STATUS.ACTIVE, paidReference: 'REF_OLD', paymentReference: 'REF_1' });
      passes.findByReference.mockResolvedValue(paid);
      passes.create.mockImplementation((doc) => Promise.resolve({ _id: new Types.ObjectId(), ...doc }));

      await service.confirmPass('REF_1', 2_310_000, 44_650);

      expect(passes.create.mock.calls[0][0]).toMatchObject({ duplicateOf: paid._id, paidReference: 'REF_1', paymentReference: 'EXTRA_REF_1', status: MONTHLY_PASS_STATUS.REFUND_PENDING });
      expect(paystack.refundTransaction).toHaveBeenCalledWith('REF_1', 2_310_000, expect.any(String));
      expect(posting.postPaystackFee).toHaveBeenCalledWith('REF_1', 44_650, expect.any(Object));
      expect(wallets.creditWallet).not.toHaveBeenCalled();
    });

    it('a payment landing after the checkout lapsed is refunded in full', async () => {
      const cancelled = pendingPass({ status: MONTHLY_PASS_STATUS.CANCELLED });
      passes.findByReference.mockResolvedValue(cancelled);
      passes.transition.mockImplementation((_id, _from, update) => Promise.resolve({ ...cancelled, ...update }));

      await service.confirmPass('REF_1', 2_310_000);
      expect(passes.transition).toHaveBeenCalledWith(cancelled._id, MONTHLY_PASS_STATUS.CANCELLED, expect.objectContaining({ status: MONTHLY_PASS_STATUS.REFUND_PENDING, paidReference: 'REF_1' }));
      expect(paystack.refundTransaction).toHaveBeenCalledWith('REF_1', 2_310_000, expect.any(String));
      expect(wallets.creditWallet).not.toHaveBeenCalled();
    });

    it('if the pitch stopped selling passes before the payment arrived, it is refunded', async () => {
      const pass = pendingPass();
      passes.findByReference.mockResolvedValue(pass);
      locations.findOne.mockResolvedValue({ ...monthlyPitch(), tier: LOCATION_TIER.FREE });
      passes.transition.mockImplementation((_id, _from, update) => Promise.resolve({ ...pass, ...update }));

      await service.confirmPass('REF_1', 2_310_000);
      expect(passes.transition.mock.calls[0][2].status).toBe(MONTHLY_PASS_STATUS.REFUND_PENDING);
      expect(paystack.refundTransaction).toHaveBeenCalled();
      expect(wallets.creditWallet).not.toHaveBeenCalled();
    });

    it('an amount that does not match is not activated (webhook fails, for a person to look at)', async () => {
      passes.findByReference.mockResolvedValue(pendingPass());
      await expect(service.confirmPass('REF_1', 100)).rejects.toBeInstanceOf(BadRequestException);
      expect(passes.transition).not.toHaveBeenCalled();
      expect(wallets.creditWallet).not.toHaveBeenCalled();
    });

    it('a refund request Paystack rejects is marked REFUND_FAILED', async () => {
      const cancelled = pendingPass({ status: MONTHLY_PASS_STATUS.CANCELLED });
      passes.findByReference.mockResolvedValue(cancelled);
      passes.transition.mockImplementation((_id, _from, update) => Promise.resolve({ ...cancelled, ...update }));
      paystack.refundTransaction.mockRejectedValue(new Error('nope'));
      await service.confirmPass('REF_1', 2_310_000);
      expect(passes.findOneAndUpdate).toHaveBeenCalledWith({ _id: cancelled._id }, { status: MONTHLY_PASS_STATUS.REFUND_FAILED });
    });
  });

  describe('refund webhooks', () => {
    it('refund.processed marks the row REFUNDED; unknown references are ignored', async () => {
      const row = pendingPass({ status: MONTHLY_PASS_STATUS.REFUND_PENDING, paidReference: 'REF_1' });
      passes.findRefundByPaidReference.mockResolvedValueOnce(row).mockResolvedValueOnce(null);
      await service.handleRefundWebhookEvent('refund.processed', 'REF_1');
      expect(passes.findOneAndUpdate).toHaveBeenCalledWith({ _id: row._id }, { status: MONTHLY_PASS_STATUS.REFUNDED, refundedAt: expect.any(Date) });
      await service.handleRefundWebhookEvent('refund.processed', 'SESSION_REF');
      expect(passes.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('expiry job', () => {
    it('cancels a lapsed checkout Paystack has no payment for', async () => {
      const lapsed = pendingPass();
      passes.findLapsedCheckouts.mockResolvedValue([lapsed]);
      passes.transition.mockResolvedValue({ ...lapsed, status: MONTHLY_PASS_STATUS.CANCELLED });
      await service.expireLapsedCheckouts();
      expect(passes.transition).toHaveBeenCalledWith(lapsed._id, MONTHLY_PASS_STATUS.PENDING, { status: MONTHLY_PASS_STATUS.CANCELLED });
      expect(keys.closeByReference).toHaveBeenCalledWith('REF_1', 'EXPIRED');
    });

    it('leaves it for next minute when Paystack is unreachable', async () => {
      passes.findLapsedCheckouts.mockResolvedValue([pendingPass()]);
      paystack.verifyTransaction.mockRejectedValue(new Error('ETIMEDOUT'));
      await service.expireLapsedCheckouts();
      expect(passes.transition).not.toHaveBeenCalled();
    });
  });
});
