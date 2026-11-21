import { BadRequestException, ConflictException, ForbiddenException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Types } from 'mongoose';
import { randomUUID } from 'crypto';
import {
  CustomHttpException,
  IDEMPOTENCY_STATUS,
  IdempotencyResponse,
  Location,
  LOCATION_PRICING_OPTION,
  LOCATION_STATUS,
  LOCATION_TIER,
  MONTHLY_PASS_DAYS,
  MONTHLY_PASS_STATUS,
  PaymentIdempotencyKey,
} from '@app/common';
import { PaystackService } from '@app/common/providers/paystack.service';
import { TransactionSource } from '@app/common/schemas/transaction.schema';
import { LocationRepository } from 'src/locations/locations.repository';
import { MonthlyPassRepository, MonthlyPassRow } from '../repositories/monthly-pass.repository';
import { PaymentIdempotencyKeyRepository } from '../repositories/payment-idempotency-key.repository';
import { isDuplicateKeyError } from '../utils/mongo-errors';
import { PlatformPostingService } from './platform-posting.service';
import { WalletService } from './wallet.service';

const DAY_MS = 24 * 60 * 60 * 1000;
// An unpaid checkout lapses after this (MP-5: a spot is held this long).
const CHECKOUT_TTL_MS = 30 * 60 * 1000;
// A checkout stuck in STARTED this long means the request died mid-way.
const CHECKOUT_STUCK_MS = 60 * 1000;

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const httpStatusOf = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } } | null)?.response?.status;

export type PassState = 'PENDING' | 'QUEUED' | 'ACTIVE' | 'EXPIRED' | 'REFUND_PENDING' | 'REFUNDED' | 'REFUND_FAILED' | 'CANCELLED';

export interface PassCheckout {
  passId: string;
  authorizationUrl: string;
  accessCode?: string;
  reference: string;
  amount: number;
  baseAmount: number;
  commissionAmount: number;
  processingFee: number;
  expiresAt: Date;
}

export interface PassAlreadyPaid {
  alreadyPaid: true;
  status: 'confirmed';
  pass: PassView;
}

export interface PassView {
  _id: string;
  locationId: string;
  pitch: { _id: string; name?: string; address?: string; pitchPhoto?: string } | null;
  state: PassState;
  startsAt: Date | null;
  endsAt: Date | null;
  daysLeft: number | null;
  amount: number;
  baseAmount: number;
  commissionAmount: number;
  processingFee: number;
  paidAt: Date | null;
}

type CheckoutUser = { _id: Types.ObjectId; email: string };
type PaidCharge = { reference: string; amount: number; fees?: number };
type PitchRow = Location & { _id: Types.ObjectId };

// Monthly passes (one player, one monthly pitch, 30 days). A paid pass lets
// the player join sessions at that pitch whose start time it covers.
//
// Money: same split as a session payment. The player pays price + commission
// + processing fee; on the verified webhook the owner is credited the price
// and i-One the rest, as ledger rows. A payment that can't become a pass
// (late, duplicate, or the pitch stopped being monthly) is refunded in full
// and never credited to anyone.
@Injectable()
export class MonthlyPassService {
  private readonly logger = new Logger(MonthlyPassService.name);

  constructor(
    private readonly passes: MonthlyPassRepository,
    private readonly locations: LocationRepository,
    private readonly paystack: PaystackService,
    private readonly idempotencyKeys: PaymentIdempotencyKeyRepository,
    private readonly platformPosting: PlatformPostingService,
    private readonly walletService: WalletService,
  ) {}

  // ─── Buying ────────────────────────────────────────────────────────────

  // One open checkout per player per pitch: double taps, retries and second
  // devices get the same checkout back (payment_idempotency_keys).
  async checkout(locationId: string, user: CheckoutUser): Promise<PassCheckout | PassAlreadyPaid> {
    const pitch = await this.sellingPitch(locationId);
    const key = `monthly-pass-checkout:${pitch._id}:${user._id}`;

    const open: PaymentIdempotencyKey | null = await this.idempotencyKeys.findOpen(key);
    if (open) {
      const age = Date.now() - new Date(open.updatedAt).getTime();
      const abandoned = open.response ? age > CHECKOUT_TTL_MS : age > CHECKOUT_STUCK_MS;
      if (!abandoned) {
        if (!open.response) throw this.checkoutInProgress();
        const same = await this.sameCheckout(open.response);
        if (same) return same;
      }
      await this.idempotencyKeys.close(open._id, IDEMPOTENCY_STATUS.EXPIRED);
    }

    let record: PaymentIdempotencyKey;
    try {
      record = await this.idempotencyKeys.create({ key, status: IDEMPOTENCY_STATUS.STARTED });
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) throw this.checkoutInProgress();
      throw error;
    }

    try {
      const result = await this.openCheckout(pitch, user);
      if ('authorizationUrl' in result) {
        await this.idempotencyKeys.complete(record._id, {
          authorizationUrl: result.authorizationUrl,
          accessCode: result.accessCode,
          reference: result.reference,
        });
      } else {
        await this.idempotencyKeys.close(record._id, IDEMPOTENCY_STATUS.PAID);
      }
      return result;
    } catch (error) {
      await this.idempotencyKeys.close(record._id, IDEMPOTENCY_STATUS.FAILED); // let them try again
      throw error;
    }
  }

  private async openCheckout(pitch: PitchRow, user: CheckoutUser): Promise<PassCheckout | PassAlreadyPaid> {
    const price = pitch.paymentPerPersonMonthly ?? 0;
    let pass = await this.passes.findOpenCheckout(user._id, pitch._id);

    if (pass) {
      // The player may have paid an earlier page without the webhook landing
      // yet: confirm that instead of charging again.
      // ('unknown' = Paystack unreachable: carry on; a late payment on the old
      // page is still caught by the webhook and refunded, never charged twice.)
      const paid = await this.findPaidReference(pass);
      if (paid && paid !== 'unknown') {
        const confirmed = await this.confirmPass(paid.reference, paid.amount, paid.fees);
        return { alreadyPaid: true, status: 'confirmed', pass: this.toView(confirmed ?? pass) };
      }
      if (pass.baseAmount !== price) {
        // The owner changed the price since: start again at the new price. A
        // late payment on the old page is refunded (it's a cancelled pass).
        await this.passes.transition(pass._id, MONTHLY_PASS_STATUS.PENDING, { status: MONTHLY_PASS_STATUS.CANCELLED });
        pass = null;
      }
    }

    const reference = `MONTHLY_PASS_${pitch._id}_${user._id}_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + CHECKOUT_TTL_MS);

    if (pass) {
      pass = await this.passes.transition(pass._id, MONTHLY_PASS_STATUS.PENDING, {
        $set: { paymentReference: reference, expiresAt },
        $addToSet: { previousReferences: pass.paymentReference },
      });
      if (!pass) throw this.checkoutInProgress(); // settled by the webhook/expiry job just now
    } else {
      const share = await this.platformPosting.priceShare(price);
      try {
        pass = (await this.passes.create({
          userId: user._id,
          locationId: pitch._id,
          ownerId: pitch.owner as Types.ObjectId,
          baseAmount: price,
          commissionAmount: share.commissionAmount,
          commissionPercentage: share.commissionPercentage,
          processingFee: share.processingFee,
          amount: share.amount,
          status: MONTHLY_PASS_STATUS.PENDING,
          paymentReference: reference,
          previousReferences: [],
          expiresAt,
        })) as MonthlyPassRow;
      } catch (error: unknown) {
        if (isDuplicateKeyError(error)) throw this.checkoutInProgress(); // one open checkout per player per pitch
        throw error;
      }
    }

    let result: { authorization_url: string; access_code?: string; reference: string };
    try {
      result = await this.paystack.initializeTransaction(user.email, pass.amount, reference, {
        type: 'MONTHLY_PASS',
        passId: pass._id.toString(),
        userId: user._id.toString(),
        locationId: pitch._id.toString(),
      });
    } catch (error: unknown) {
      throw new BadRequestException(errorMessage(error) || 'Payment initialization failed');
    }

    this.logger.log(`Monthly pass checkout ${reference} (pass ${pass._id}, ${pass.amount} kobo)`);
    return this.checkoutView(pass, result.authorization_url, result.reference, result.access_code);
  }

  private async sameCheckout(response: IdempotencyResponse): Promise<PassCheckout | null> {
    const pass = await this.passes.findByReference(response.reference);
    if (!pass || pass.status !== MONTHLY_PASS_STATUS.PENDING || pass.paymentReference !== response.reference) return null;
    return this.checkoutView(pass, response.authorizationUrl, response.reference, response.accessCode);
  }

  private checkoutView(pass: MonthlyPassRow, authorizationUrl: string, reference: string, accessCode?: string): PassCheckout {
    return {
      passId: pass._id.toString(),
      authorizationUrl,
      accessCode,
      reference,
      amount: pass.amount,
      baseAmount: pass.baseAmount,
      commissionAmount: pass.commissionAmount,
      processingFee: pass.processingFee,
      expiresAt: pass.expiresAt,
    };
  }

  // A pitch that is selling passes right now, or a clear error.
  private async sellingPitch(locationId: string): Promise<PitchRow> {
    const pitch = Types.ObjectId.isValid(locationId)
      ? ((await this.locations.findOne({ _id: new Types.ObjectId(locationId) })) as PitchRow | null)
      : null;
    if (!pitch || (pitch.status && pitch.status !== LOCATION_STATUS.ACTIVE)) {
      throw new NotFoundException('Pitch not found');
    }
    if (!this.isMonthlyPitch(pitch)) {
      throw new CustomHttpException('This pitch does not sell monthly passes', HttpStatus.BAD_REQUEST, { code: 'NOT_A_MONTHLY_PITCH' });
    }
    if (pitch.monthlyPassSalesPaused) {
      throw new CustomHttpException(
        "This pitch isn't selling monthly passes right now",
        HttpStatus.CONFLICT,
        { code: 'PASS_SALES_PAUSED' },
      );
    }
    return pitch;
  }

  private isMonthlyPitch(pitch: Location | null): pitch is Location {
    return (
      !!pitch &&
      !!pitch.owner &&
      pitch.tier === LOCATION_TIER.PAID &&
      pitch.pricingOption === LOCATION_PRICING_OPTION.MONTHLY &&
      (pitch.paymentPerPersonMonthly ?? 0) > 0
    );
  }

  private checkoutInProgress() {
    return new ConflictException({ message: 'Checkout is being prepared — try again', code: 'CHECKOUT_IN_PROGRESS' });
  }

  // ─── Confirming (webhook, checkout retry, expiry job) ──────────────────

  // Idempotent: safe to call again for the same reference.
  async confirmPass(reference: string, amount: number, paystackFee?: number): Promise<MonthlyPassRow | null> {
    const pass = await this.passes.findByReference(reference);
    if (!pass) {
      this.logger.warn(`charge.success for unknown monthly pass reference ${reference}`);
      return null;
    }
    if (pass.duplicateOf) return pass; // an extra charge, already being refunded

    switch (pass.status) {
      case MONTHLY_PASS_STATUS.PENDING:
        return this.activate(pass, reference, amount, paystackFee);
      case MONTHLY_PASS_STATUS.ACTIVE:
        if (pass.paidReference === reference) {
          await this.postLedger(pass, paystackFee); // redelivery: finish anything that didn't land
          return pass;
        }
        return this.refundExtraCharge(pass, reference, amount, paystackFee);
      case MONTHLY_PASS_STATUS.CANCELLED:
        return this.refundUnusedPayment(pass, MONTHLY_PASS_STATUS.CANCELLED, reference, amount, paystackFee,
          'Refund: your monthly pass checkout had expired before the payment arrived');
      default: // already being refunded
        return pass.paidReference === reference ? pass : this.refundExtraCharge(pass, reference, amount, paystackFee);
    }
  }

  private async activate(pass: MonthlyPassRow, reference: string, amount: number, paystackFee?: number) {
    if (amount !== pass.amount) {
      // Left PENDING and the webhook fails, so it's retried and visible:
      // the charge doesn't match what we priced. Needs a person to look.
      throw new BadRequestException(`Amount mismatch on monthly pass ${pass._id}: expected ${pass.amount}, got ${amount}`);
    }

    const pitch = (await this.locations.findOne({ _id: pass.locationId })) as Location | null;
    if (!this.isMonthlyPitch(pitch)) {
      return this.refundUnusedPayment(pass, MONTHLY_PASS_STATUS.PENDING, reference, amount, paystackFee,
        'Refund: this pitch stopped selling monthly passes before your payment arrived');
    }

    // Starts now, or when the player's current pass ends (MP-3). Only one
    // checkout per player per pitch can be open (unique index), so no other
    // pass of theirs can be activating at the same time.
    const now = new Date();
    const latest = await this.passes.latestEndsAt(pass.userId, pass.locationId);
    const startsAt = latest && latest > now ? latest : now;
    const endsAt = new Date(startsAt.getTime() + MONTHLY_PASS_DAYS * DAY_MS);

    const activated = await this.passes.transition(pass._id, MONTHLY_PASS_STATUS.PENDING, {
      status: MONTHLY_PASS_STATUS.ACTIVE,
      startsAt,
      endsAt,
      paidReference: reference,
      paidAt: now,
      ...(paystackFee !== undefined && Number.isFinite(paystackFee) && { paystackFee }),
    });
    if (!activated) return this.confirmPass(reference, amount, paystackFee); // settled by another caller just now

    await this.postLedger(activated, paystackFee);
    await this.idempotencyKeys.closeByReference(activated.paymentReference, IDEMPOTENCY_STATUS.PAID);
    if (reference !== activated.paymentReference) await this.idempotencyKeys.closeByReference(reference, IDEMPOTENCY_STATUS.PAID);

    this.logger.log(`Monthly pass ${activated._id} active ${startsAt.toISOString()} → ${endsAt.toISOString()}`);
    return activated;
  }

  // Owner + platform ledger rows for a paid pass. Every posting is keyed on
  // the paid reference, so re-running posts nothing twice. Throws on failure
  // so the webhook is redelivered.
  private async postLedger(pass: MonthlyPassRow, paystackFee?: number) {
    const reference = pass.paidReference as string;
    const meta = { passId: pass._id.toString(), userId: pass.userId.toString(), locationId: pass.locationId.toString() };

    const ownerWallet = await this.walletService.getWalletByUserId(pass.ownerId.toString());
    const credit = await this.walletService.creditWallet(
      ownerWallet._id,
      pass.baseAmount,
      TransactionSource.MONTHLY_PASS,
      reference,
      { ...meta, chargedAmount: pass.amount, commissionAmount: pass.commissionAmount },
    );

    await this.platformPosting.postPlatformEntries({
      reference,
      commissionAmount: pass.commissionAmount,
      processingFee: pass.processingFee,
      paystackFee: paystackFee ?? pass.paystackFee,
      meta,
    });

    if (!pass.transactionId && credit?._id) {
      await this.passes.findOneAndUpdate({ _id: pass._id }, { transactionId: credit._id });
    }
  }

  // ─── Refunds (charges that can't become a pass) ────────────────────────

  // A pass that was never activated (checkout lapsed, or the pitch stopped
  // selling) was paid after all: refund it in full. Nothing was credited.
  private async refundUnusedPayment(
    pass: MonthlyPassRow,
    from: MONTHLY_PASS_STATUS,
    reference: string,
    amount: number,
    paystackFee: number | undefined,
    reason: string,
  ) {
    const claimed = await this.passes.transition(pass._id, from, {
      status: MONTHLY_PASS_STATUS.REFUND_PENDING,
      paidReference: reference,
      paidAt: new Date(),
      refundReason: reason,
    });
    if (!claimed) return this.confirmPass(reference, amount, paystackFee); // settled by another caller just now
    await this.platformPosting.postPaystackFee(reference, paystackFee, { passId: claimed._id.toString(), refund: 'true' });
    return this.requestRefund(claimed, reference, amount, reason);
  }

  // A second charge for a pass that's already paid: recorded on its own row
  // and refunded in full. Never credited to anyone.
  private async refundExtraCharge(original: MonthlyPassRow, reference: string, amount: number, paystackFee?: number) {
    const reason = 'Refund: this monthly pass was already paid';
    let extra: MonthlyPassRow;
    try {
      extra = (await this.passes.create({
        userId: original.userId,
        locationId: original.locationId,
        ownerId: original.ownerId,
        baseAmount: 0,
        commissionAmount: 0,
        commissionPercentage: 0,
        processingFee: 0,
        amount,
        status: MONTHLY_PASS_STATUS.REFUND_PENDING,
        paymentReference: `EXTRA_${reference}`,
        previousReferences: [],
        paidReference: reference,
        paidAt: new Date(),
        expiresAt: new Date(),
        duplicateOf: original._id,
        refundReason: reason,
      })) as MonthlyPassRow;
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) return this.passes.findByReference(`EXTRA_${reference}`); // redelivery
      throw error;
    }
    this.logger.warn(`Extra charge ${reference} (${amount} kobo) on monthly pass ${original._id} — refunding in full`);
    await this.platformPosting.postPaystackFee(reference, paystackFee, { passId: extra._id.toString(), duplicateOf: original._id.toString() });
    return this.requestRefund(extra, reference, amount, reason);
  }

  private async requestRefund(row: MonthlyPassRow, reference: string, amount: number, reason: string) {
    try {
      const refund = await this.paystack.refundTransaction(reference, amount, reason);
      return this.passes.findOneAndUpdate({ _id: row._id }, { refundReference: refund?.id?.toString() }) as Promise<MonthlyPassRow | null>;
    } catch (error: unknown) {
      this.logger.error(`CRITICAL: refund request for monthly pass payment ${reference} failed (${errorMessage(error)}) — needs manual follow-up`);
      return this.passes.findOneAndUpdate({ _id: row._id }, { status: MONTHLY_PASS_STATUS.REFUND_FAILED }) as Promise<MonthlyPassRow | null>;
    }
  }

  // refund.* webhooks. A no-op for references that aren't monthly passes.
  async handleRefundWebhookEvent(event: string, transactionReference: string | undefined): Promise<void> {
    if (!transactionReference) return;
    const row = await this.passes.findRefundByPaidReference(transactionReference);
    if (!row) return;

    if (event === 'refund.processed') {
      await this.passes.findOneAndUpdate({ _id: row._id }, { status: MONTHLY_PASS_STATUS.REFUNDED, refundedAt: new Date() });
      this.logger.log(`Monthly pass payment ${transactionReference} refunded`);
    } else if (event === 'refund.failed' || event === 'refund.needs-attention') {
      await this.passes.findOneAndUpdate({ _id: row._id }, { status: MONTHLY_PASS_STATUS.REFUND_FAILED });
      this.logger.error(`Refund ${event} for monthly pass payment ${transactionReference} (row ${row._id}) — needs manual follow-up`);
    }
  }

  // ─── Lapsed checkouts ──────────────────────────────────────────────────

  // Every minute: a checkout unpaid after 30 minutes is checked with Paystack
  // (confirmed if it was paid after all) and otherwise cancelled.
  @Cron(CronExpression.EVERY_MINUTE, { name: 'expire-monthly-pass-checkouts' })
  async expireLapsedCheckouts(): Promise<void> {
    const lapsed = await this.passes.findLapsedCheckouts(new Date());
    for (const pass of lapsed) {
      try {
        const paid = await this.findPaidReference(pass);
        if (paid === 'unknown') continue; // Paystack unreachable: try next minute
        if (paid) {
          await this.confirmPass(paid.reference, paid.amount, paid.fees);
          continue;
        }
        const cancelled = await this.passes.transition(pass._id, MONTHLY_PASS_STATUS.PENDING, { status: MONTHLY_PASS_STATUS.CANCELLED });
        if (cancelled) await this.idempotencyKeys.closeByReference(cancelled.paymentReference, IDEMPOTENCY_STATUS.EXPIRED);
      } catch (error: unknown) {
        this.logger.error(`Failed to settle lapsed monthly pass checkout ${pass._id}: ${errorMessage(error)}`);
      }
    }
  }

  // Asks Paystack about every reference this checkout used: the paid one,
  // null if none was paid, or 'unknown' if Paystack couldn't be reached.
  private async findPaidReference(pass: MonthlyPassRow): Promise<PaidCharge | null | 'unknown'> {
    let unknown = false;
    for (const reference of [pass.paymentReference, ...(pass.previousReferences ?? [])]) {
      try {
        const tx = await this.paystack.verifyTransaction(reference);
        if (tx?.status === 'success') return { reference, amount: tx.amount, fees: tx.fees };
      } catch (error: unknown) {
        const status = httpStatusOf(error);
        // 4xx = Paystack has no successful record of it. Else we don't know.
        if (!status || status >= 500) unknown = true;
      }
    }
    return unknown ? 'unknown' : null;
  }

  // ─── Reading ───────────────────────────────────────────────────────────

  async myPasses(userId: Types.ObjectId): Promise<PassView[]> {
    const rows = await this.passes.findForUser(userId);
    return rows.map((row) => this.toView(row));
  }

  // The pass screen for one pitch: the price, and the player's current and
  // queued passes there.
  async myPassAtPitch(locationId: string, userId: Types.ObjectId) {
    if (!Types.ObjectId.isValid(locationId)) throw new NotFoundException('Pitch not found');
    const pitch = (await this.locations.findOne({ _id: new Types.ObjectId(locationId) })) as PitchRow | null;
    if (!pitch) throw new NotFoundException('Pitch not found');

    const selling = this.isMonthlyPitch(pitch) && !pitch.monthlyPassSalesPaused;
    const now = new Date();
    const passes = (await this.passes.findUnexpiredAtPitch(pitch._id, now, userId)).map((row) => this.toView(row, now));

    return {
      locationId: pitch._id.toString(),
      isMonthlyPitch: this.isMonthlyPitch(pitch),
      salesPaused: pitch.monthlyPassSalesPaused === true,
      // What a new pass costs now (kobo), when the pitch is selling.
      price: selling ? { baseAmount: pitch.paymentPerPersonMonthly as number, ...(await this.platformPosting.priceShare(pitch.paymentPerPersonMonthly as number)) } : null,
      current: passes.find((p) => p.state === 'ACTIVE') ?? null,
      queued: passes.filter((p) => p.state === 'QUEUED'),
    };
  }

  // Owner view (M01): who holds a pass now or queued, and pass income.
  async ownerOverview(locationId: string, ownerId: Types.ObjectId) {
    if (!Types.ObjectId.isValid(locationId)) throw new NotFoundException('Pitch not found');
    const pitch = (await this.locations.findOne({ _id: new Types.ObjectId(locationId) })) as PitchRow | null;
    if (!pitch) throw new NotFoundException('Pitch not found');
    if (pitch.owner?.toString() !== ownerId.toString()) throw new ForbiddenException('You do not own this pitch');

    const now = new Date();
    const rows = await this.passes.findUnexpiredAtPitch(pitch._id, now);
    const holders = rows.map((row) => ({ ...this.toView(row, now), player: row.userId }));
    return {
      locationId: pitch._id.toString(),
      activeCount: holders.filter((h) => h.state === 'ACTIVE').length,
      queuedCount: holders.filter((h) => h.state === 'QUEUED').length,
      revenue: await this.passes.revenueAtPitch(pitch._id), // kobo credited to the owner, all time
      salesPaused: pitch.monthlyPassSalesPaused === true,
      passes: holders,
    };
  }

  private toView(row: MonthlyPassRow, now = new Date()): PassView {
    const location = row.locationId as unknown;
    const populated = typeof location === 'object' && location !== null && 'name' in location
      ? (location as { _id: Types.ObjectId; name?: string; address?: string; pitchPhoto?: string })
      : null;
    return {
      _id: row._id.toString(),
      locationId: (populated?._id ?? row.locationId).toString(),
      pitch: populated
        ? { _id: populated._id.toString(), name: populated.name, address: populated.address, pitchPhoto: populated.pitchPhoto }
        : null,
      state: this.stateOf(row, now),
      startsAt: row.startsAt ?? null,
      endsAt: row.endsAt ?? null,
      daysLeft: row.status === MONTHLY_PASS_STATUS.ACTIVE && row.endsAt && row.endsAt > now
        ? Math.ceil((row.endsAt.getTime() - now.getTime()) / DAY_MS)
        : null,
      amount: row.amount,
      baseAmount: row.baseAmount,
      commissionAmount: row.commissionAmount,
      processingFee: row.processingFee,
      paidAt: row.paidAt ?? null,
    };
  }

  private stateOf(row: MonthlyPassRow, now: Date): PassState {
    if (row.status !== MONTHLY_PASS_STATUS.ACTIVE) return row.status;
    if (row.startsAt && row.startsAt > now) return 'QUEUED';
    if (row.endsAt && row.endsAt <= now) return 'EXPIRED';
    return 'ACTIVE';
  }
}
