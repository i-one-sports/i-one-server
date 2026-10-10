import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SessionPaymentRepository } from '../repositories/session-payment.repository';
import { WalletService } from './wallet.service';
import { PaystackService } from '@app/common/providers/paystack.service';
import { PaymentStatus, type SessionPayment } from '@app/common/schemas/session-payment.schema';
import { TransactionSource } from '@app/common/schemas/transaction.schema';
import { Session } from '@app/common/schemas/session.schema';
import { randomUUID } from 'crypto';
import { LOCATION_PRICING_OPTION, SESSION_PAYMENT_MODE, SESSION_STATUS, USER_ROLE } from '@app/common';
import { Location } from '@app/common/schemas/location.schema';
import { SettingsService } from '../../settings/settings.service';
import { PlatformCommissionRepository } from '../repositories/platform-commission.repository';
import { SetsService } from '../../sets/sets.service';
import { PoolSnapshot, SessionPaymentEventService } from './session-payment-event.service';

// How long a pool checkout holds its share of the pot before the expiry job
// verifies it with Paystack and (if unpaid) releases it back to the pool.
// Kept short so an abandoned checkout can't lock the pot for long.
const POOL_RESERVATION_TTL_MS = 15 * 60 * 1000;

type PoolContributorLike = { userId: string; amount: number };

@Injectable()
export class SessionPaymentService {
  private readonly logger = new Logger(SessionPaymentService.name);

  constructor(
    private readonly sessionPaymentRepository: SessionPaymentRepository,
    private readonly walletService: WalletService,
    private readonly paystackService: PaystackService,
    private readonly settingsService: SettingsService,
    private readonly platformCommissionRepository: PlatformCommissionRepository,
    @InjectModel(Session.name) private readonly sessionModel: Model<Session>,
    private readonly setsService: SetsService,
    @InjectModel(Location.name) private readonly locationModel: Model<Location>,
    private readonly sessionPaymentEventService: SessionPaymentEventService,
  ) {}

  // Explicit equality on purpose: lean reads of sessions created before
  // pooling have no paymentMode at all, and those must stay PER_PERSON.
  private isPoolSession(session: any): boolean {
    return session?.paymentMode === SESSION_PAYMENT_MODE.POOL;
  }

  private isPoolPayment(payment: any): boolean {
    return payment?.metadata?.paymentMode === SESSION_PAYMENT_MODE.POOL;
  }

  // `baseAmount` is the location's listed per-person price, in kobo — what
  // the owner will be credited, unchanged by commission. The actual
  // Paystack charge (`amount` on the created record) is baseAmount plus the
  // platform's commission, added on top so the owner always receives the
  // full listed price. The commission % is snapshotted per-payment at
  // creation time so a later rate change doesn't retroactively alter
  // payments already in flight.
  async initializeSessionPayments(
    sessionId: Types.ObjectId,
    locationId: Types.ObjectId,
    ownerId: Types.ObjectId,
    memberIds: Types.ObjectId[],
    baseAmount: number,
    paymentDeadline?: Date,
    pricingOption?: LOCATION_PRICING_OPTION,
  ) {
    this.logger.log(`Initializing payments for session: ${sessionId}, members: ${memberIds.length}`);

    const existingPayments = await this.sessionPaymentRepository.find({
      sessionId,
      userId: { $in: memberIds },
    });

    const existingUserIds = new Set(existingPayments.map((p: SessionPayment) => p.userId.toString()));
    const newMemberIds = memberIds.filter((id) => !existingUserIds.has(id.toString()));

    if (newMemberIds.length > 0) {
      const commissionPercentage = await this.settingsService.getCommissionPercentage();
      // baseAmount is already kobo (an integer), so this is a plain
      // percentage calc — round to the nearest kobo, no unit conversion needed.
      const commissionAmount = Math.round((baseAmount * commissionPercentage) / 100);
      const chargeAmount = baseAmount + commissionAmount;

      const newPayments = newMemberIds.map((userId) => ({
        _id: new Types.ObjectId(),
        sessionId,
        userId,
        locationId,
        ownerId,
        amount: chargeAmount,
        baseAmount,
        commissionAmount,
        commissionPercentage,
        status: PaymentStatus.PENDING,
        paymentReference: `SESSION_${sessionId}_USER_${userId}_${randomUUID()}`,
        expiresAt: paymentDeadline,
        metadata: pricingOption ? { pricingOption } : undefined,
      }));

      await this.sessionPaymentRepository.insertMany(newPayments);
      this.logger.log(
        `Created ${newMemberIds.length} new payment records for session: ${sessionId} ` +
        `(base: ${baseAmount}, commission: ${commissionAmount} @ ${commissionPercentage}%, charged: ${chargeAmount})`,
      );
    }
  }

  async initializeCheckout(sessionId: string, userId: string, userEmail: string, amount?: number) {
    const session = await this.sessionModel.findById(sessionId).lean();
    if (session && this.isPoolSession(session)) {
      return this.initializePoolCheckout(session, userId, userEmail, amount);
    }

    const payment = await this.sessionPaymentRepository.findOne({
      sessionId: new Types.ObjectId(sessionId),
      userId: new Types.ObjectId(userId),
      status: PaymentStatus.PENDING,
    });

    if (!payment) {
      // Payment is not PENDING — check if it was already confirmed (webhook
      // arrived before the user retried). Return the same shape as alreadyPaid
      // so the client shows "payment successful" rather than a 404 error.
      const paid = await this.sessionPaymentRepository.findOne({
        sessionId: new Types.ObjectId(sessionId),
        userId: new Types.ObjectId(userId),
        status: PaymentStatus.PAID,
      });
      if (paid) {
        return { alreadyPaid: true, status: 'confirmed' };
      }
      throw new NotFoundException('No pending payment found for this session');
    }

    // Before issuing a new Paystack transaction, verify every reference ever
    // issued for this payment — not just the current one. The DB can show
    // PENDING while Paystack shows success if the webhook missed (wrong URL,
    // timeout, etc.); if that happened on an *older* reference that was since
    // superseded by a retry (e.g. the user completed payment on an old,
    // already-abandoned-looking checkout tab), checking only the latest
    // reference would miss it and the user gets charged again for the same
    // thing. Checking all known references catches it regardless of which
    // attempt the user actually completed.
    const referencesToCheck = [payment.paymentReference, ...(payment.previousReferences ?? [])].filter(
      (ref): ref is string => !!ref,
    );

    for (const ref of referencesToCheck) {
      try {
        const existing = await this.paystackService.verifyTransaction(ref);

        if (existing?.status === 'success') {
          this.logger.log(
            `Paystack shows success for ref ${ref} but DB is still PENDING ` +
            `— confirming payment inline (missed webhook)`,
          );
          await this.confirmSessionPayment(
            new Types.ObjectId(sessionId),
            new Types.ObjectId(userId),
            ref,
            existing.amount,
          );
          return { alreadyPaid: true, status: 'confirmed' };
        }

        // abandoned / failed — Paystack knows about the reference but the user
        // never completed payment on it. Keep checking the rest.
      } catch {
        // Paystack has no record of this reference (first-ever call, or the
        // reference came from the seed script). Keep checking the rest.
      }
    }

    // None of the known references have succeeded — generate a fresh one so
    // Paystack doesn't reject with duplicate_reference, keeping every prior
    // reference on record so a future retry can still catch a late payment.
    const reference = `SESSION_${sessionId}_USER_${userId}_${randomUUID()}`;

    await this.sessionPaymentRepository.findOneAndUpdate(
      { _id: payment._id },
      {
        $set: { paymentReference: reference },
        $addToSet: { previousReferences: { $each: referencesToCheck } },
      } as any,
    );

    try {
      const result = await this.paystackService.initializeTransaction(
        userEmail,
        payment.amount,
        reference,
        { sessionId, userId },
      );

      this.logger.log(`Checkout initialized for session: ${sessionId}, user: ${userId}`);

      return {
        authorizationUrl: result.authorization_url,
        reference: result.reference,
        amount: payment.amount,
      };
    } catch (error: any) {
      const paystackMessage =
        error?.response?.data?.message || error?.message || 'Payment initialization failed';
      throw new BadRequestException(paystackMessage);
    }
  }

  async confirmSessionPayment(
    sessionId: Types.ObjectId,
    userId: Types.ObjectId,
    paystackReference: string,
    amount: number,
  ) {
    this.logger.log(`Confirming payment for session: ${sessionId}, user: ${userId}`);

    // POOL contributions are looked up by reference — a player can have
    // several rows on one session, so (sessionId, userId) isn't unique.
    const poolPayment = await this.sessionPaymentRepository.findOne({ paymentReference: paystackReference });
    if (this.isPoolPayment(poolPayment)) {
      return this.confirmPoolContribution(poolPayment, paystackReference, amount);
    }

    // Atomic claim: PENDING → PAID in a single DB operation.
    // Two concurrent callers (webhook + inline confirm) can both reach here
    // for the same payment. MongoDB guarantees only one findOneAndUpdate with
    // { status: PENDING } succeeds — the other gets null and exits without
    // touching the wallet, preventing double credits.
    const payment = await this.sessionPaymentRepository.findOneAndUpdate(
      { sessionId, userId, status: PaymentStatus.PENDING },
      { status: PaymentStatus.PAID, paidAt: new Date() },
    );

    if (!payment) {
      this.logger.warn(
        `confirmSessionPayment: no PENDING record found — already confirmed or does not exist ` +
        `(session: ${sessionId}, user: ${userId}, ref: ${paystackReference})`,
      );
      return null;
    }

    if (payment.amount !== amount) {
      // Revert — amount mismatch means the webhook data doesn't match what
      // we initialised. Needs manual investigation before crediting.
      await this.sessionPaymentRepository.findOneAndUpdate(
        { _id: payment._id },
        { status: PaymentStatus.PENDING, paidAt: null },
      );
      throw new BadRequestException(`Amount mismatch: expected ${payment.amount}, got ${amount}`);
    }

    const updatedPayment = await this.creditOwnerForPayment(payment, paystackReference, amount);

    this.logger.log(`Payment confirmed for session: ${sessionId}, user: ${userId}`);

    await this.maybeCompleteSessionPayments(sessionId);

    return updatedPayment;
  }

  // Ledger side of a confirmed payment, shared by PER_PERSON and POOL: one
  // immutable owner credit (idempotent on the Paystack reference inside
  // creditWallet) plus one PlatformCommission row (unique on sessionPaymentId).
  // Safe to re-run for the same payment.
  private async creditOwnerForPayment(payment: any, paystackReference: string, amount: number) {
    const sessionId = payment.sessionId;
    const userId = payment.userId;

    // The owner is credited baseAmount, not the full charged amount — the
    // difference (commissionAmount) is the platform's cut, recorded below
    // but never credited to any wallet. Payments created before commission
    // existed have no baseAmount stored; fall back to the full amount so
    // those legacy records behave exactly as they did before (no commission).
    const ownerCreditAmount = payment.baseAmount ?? amount;
    const commissionAmount = payment.commissionAmount ?? 0;

    const ownerWallet = await this.walletService.getWalletByUserId(payment.ownerId.toString());

    const transaction = await this.walletService.creditWallet(
      ownerWallet._id,
      ownerCreditAmount,
      TransactionSource.SESSION_PAYMENT,
      paystackReference,
      {
        sessionId: sessionId.toString(),
        userId: userId.toString(),
        chargedAmount: amount,
        commissionAmount,
      },
      sessionId,
    );

    if (commissionAmount > 0) {
      try {
        await this.platformCommissionRepository.create({
          sessionPaymentId: payment._id,
          sessionId,
          payerId: userId,
          ownerId: payment.ownerId,
          baseAmount: ownerCreditAmount,
          commissionAmount,
          commissionPercentage: payment.commissionPercentage ?? 0,
          paymentReference: paystackReference,
        });
      } catch (error: any) {
        // Unique index on sessionPaymentId — a duplicate here just means a
        // retry of the same webhook after the commission record already
        // landed. Anything else is worth knowing about, but shouldn't block
        // the payment confirmation that already succeeded above.
        if (error?.code !== 11000) {
          this.logger.error(`Failed to record platform commission for payment ${payment._id}: ${error.message}`);
        }
      }
    }

    return this.sessionPaymentRepository.findOneAndUpdate(
      { _id: payment._id },
      { transactionId: transaction._id },
    );
  }

  // ─── POOL payments ────────────────────────────────────────────────────
  // The owner's price is the session total (paymentTarget). Members chip in
  // any amount until it's covered. Each contribution is its own
  // SessionPayment row — the billing record for one Paystack reference.
  //
  // Over-payment is prevented by reserving before charging: a checkout
  // atomically claims its share of what's left (amountPaid + amountReserved
  // + x <= paymentTarget) and only then talks to Paystack. The reservation
  // is released if the payment never lands (expireStaleReservations).

  private async initializePoolCheckout(session: any, userId: string, userEmail: string, amount?: number) {
    const sessionId = session._id.toString();

    if (!(session.members ?? []).some((m: any) => m.toString() === userId)) {
      throw new ForbiddenException('Only members of this session can pay into it');
    }

    if (session.paymentStatus === 'COMPLETED') {
      return { alreadyPaid: true, status: 'confirmed', pool: await this.getPoolSnapshot(sessionId) };
    }

    if ((session.status ?? SESSION_STATUS.OPEN) !== SESSION_STATUS.OPEN || session.paymentStatus !== 'PENDING') {
      throw new BadRequestException('Payment is not open for this session yet');
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('amount (kobo, whole number) is required');
    }

    // A player retrying checkout shouldn't keep their earlier reservation
    // locked — settle it first (confirms it if Paystack shows it actually
    // paid, otherwise hands the amount back to the pool).
    const ownOpen = await this.sessionPaymentRepository.find({
      sessionId: session._id,
      userId: new Types.ObjectId(userId),
      status: PaymentStatus.PENDING,
      'metadata.paymentMode': SESSION_PAYMENT_MODE.POOL,
    });
    for (const row of ownOpen) {
      await this.settleReservation(row);
    }

    const minContribution = await this.settingsService.getMinContributionAmount();
    const committed = {
      $add: [{ $ifNull: ['$amountPaid', 0] }, { $ifNull: ['$amountReserved', 0] }, amount],
    };
    // Below the minimum is only allowed when it exactly clears the pool.
    const fits = amount >= minContribution
      ? { $lte: [committed, '$paymentTarget'] }
      : { $eq: [committed, '$paymentTarget'] };

    const reserved = await this.sessionModel.findOneAndUpdate(
      {
        _id: session._id,
        paymentMode: SESSION_PAYMENT_MODE.POOL,
        paymentStatus: 'PENDING',
        $expr: fits,
      },
      { $inc: { amountReserved: amount } },
      { new: true },
    );

    if (!reserved) {
      const pool = await this.getPoolSnapshot(sessionId);
      if (pool.fullyFunded) {
        return { alreadyPaid: true, status: 'confirmed', pool };
      }
      if (amount > pool.available) {
        throw new ConflictException({
          message: pool.reserved > 0
            ? `Only ${pool.available} kobo is available right now — ${pool.reserved} is being paid by other players`
            : `Only ${pool.available} kobo is left to pay`,
          pool,
        });
      }
      throw new BadRequestException({
        message: `Minimum contribution is ${minContribution} kobo (or exactly what's left: ${pool.available})`,
        pool,
      });
    }

    let payment: any;
    try {
      const location = await this.locationModel.findById(session.location).select('owner').lean();
      if (!location?.owner) {
        throw new BadRequestException('Location owner not found');
      }

      const commissionPercentage = await this.settingsService.getCommissionPercentage();
      const commissionAmount = Math.round((amount * commissionPercentage) / 100);

      payment = await this.sessionPaymentRepository.create({
        sessionId: session._id,
        userId: new Types.ObjectId(userId),
        locationId: new Types.ObjectId(session.location.toString()),
        ownerId: location.owner as any,
        amount: amount + commissionAmount,
        baseAmount: amount,
        commissionAmount,
        commissionPercentage,
        status: PaymentStatus.PENDING,
        paymentReference: `SESSION_${sessionId}_USER_${userId}_${randomUUID()}`,
        expiresAt: new Date(Date.now() + POOL_RESERVATION_TTL_MS),
        metadata: { paymentMode: SESSION_PAYMENT_MODE.POOL },
      } as any);
    } catch (error) {
      await this.sessionModel.updateOne({ _id: session._id }, { $inc: { amountReserved: -amount } });
      throw error;
    }

    try {
      const result = await this.paystackService.initializeTransaction(
        userEmail,
        payment.amount,
        payment.paymentReference,
        { sessionId, userId, paymentId: payment._id.toString(), paymentMode: SESSION_PAYMENT_MODE.POOL },
      );

      await this.publishPoolUpdate(sessionId, 'reserved');

      return {
        authorizationUrl: result.authorization_url,
        reference: result.reference,
        amount: payment.amount,
        baseAmount: payment.baseAmount,
        commissionAmount: payment.commissionAmount,
        expiresAt: payment.expiresAt,
      };
    } catch (error: any) {
      // Paystack never issued a checkout for this reference, so nothing can
      // be charged against it — safe to release immediately.
      await this.releaseReservation(payment);
      const paystackMessage =
        error?.response?.data?.message || error?.message || 'Payment initialization failed';
      throw new BadRequestException(paystackMessage);
    }
  }

  // Called for any Paystack-confirmed charge on a POOL row (webhook, inline
  // verify, expiry job). Idempotent: if the row was already claimed, returns
  // it as-is so every caller sees the same, current status.
  private async confirmPoolContribution(row: any, paystackReference: string, amount: number) {
    // PENDING → PAID: its share was still reserved.
    // EXPIRED → PAID: a late payment after the reservation was released.
    let wasReserved = true;
    let payment = await this.sessionPaymentRepository.findOneAndUpdate(
      { _id: row._id, status: PaymentStatus.PENDING },
      { status: PaymentStatus.PAID, paidAt: new Date() },
    );
    if (!payment) {
      wasReserved = false;
      payment = await this.sessionPaymentRepository.findOneAndUpdate(
        { _id: row._id, status: PaymentStatus.EXPIRED },
        { status: PaymentStatus.PAID, paidAt: new Date() },
      );
    }

    if (!payment) {
      const current = await this.sessionPaymentRepository.findOne({ _id: row._id });
      this.logger.warn(
        `Pool contribution ${row._id} already ${current?.status} — returning existing record (ref: ${paystackReference})`,
      );
      return current;
    }

    if (payment.amount !== amount) {
      await this.sessionPaymentRepository.findOneAndUpdate(
        { _id: payment._id },
        { status: wasReserved ? PaymentStatus.PENDING : PaymentStatus.EXPIRED, paidAt: null },
      );
      throw new BadRequestException(`Amount mismatch: expected ${payment.amount}, got ${amount}`);
    }

    const updatedPayment = await this.creditOwnerForPayment(payment, paystackReference, amount);

    const base = payment.baseAmount;
    const session = await this.sessionModel
      .findOneAndUpdate(
        { _id: payment.sessionId },
        { $inc: wasReserved ? { amountPaid: base, amountReserved: -base } : { amountPaid: base } },
        { new: true },
      )
      .lean();

    // Money has landed and the owner is credited (keeps the ledger honest).
    // If it shouldn't count toward this pot, hand it straight back through
    // the normal refund flow — which debits the owner when it settles.
    const isMember = (session?.members ?? []).some((m: any) => m.toString() === payment.userId.toString());
    const refundReason =
      (session?.status ?? SESSION_STATUS.OPEN) !== SESSION_STATUS.OPEN
        ? 'Session is no longer open'
        : !isMember
          ? 'Player is no longer in this session'
          : (session.amountPaid ?? 0) > (session.paymentTarget ?? 0)
            ? 'Session was already fully paid'
            : null;

    if (refundReason) {
      this.logger.warn(`Pool contribution ${payment._id} will be refunded: ${refundReason}`);
      try {
        await this.refundPayment(payment._id.toString(), refundReason);
      } catch (error: any) {
        this.logger.error(
          `CRITICAL: pool contribution ${payment._id} needs a refund (${refundReason}) but the request failed: ` +
          `${error.message} — retry via refundPayment`,
        );
      }
    } else {
      await this.maybeCompletePool(payment.sessionId);
    }

    await this.publishPoolUpdate(payment.sessionId.toString(), refundReason ? 'refund_requested' : 'paid');

    this.logger.log(`Pool contribution confirmed: ${payment._id} (${base} kobo) for session ${payment.sessionId}`);
    return updatedPayment;
  }

  private async maybeCompletePool(sessionId: Types.ObjectId) {
    // paymentStatus filter makes this flip (and set allocation) happen once.
    const updated = await this.sessionModel.findOneAndUpdate(
      {
        _id: sessionId,
        status: SESSION_STATUS.OPEN,
        paymentStatus: { $ne: 'COMPLETED' },
        $expr: { $gte: [{ $ifNull: ['$amountPaid', 0] }, '$paymentTarget'] },
      },
      { $set: { paymentStatus: 'COMPLETED', allPaymentsCompleted: true } },
    );

    if (updated) {
      this.logger.log(`Pool fully funded for session ${sessionId}`);
      this.setsService
        .createSet(sessionId.toString())
        .catch((err) => this.logger.error(`Auto set-allocation failed for session ${sessionId}: ${err.message}`));
    }
  }

  // Checks a PENDING pool row against Paystack before giving its reservation
  // back: if any of its references actually succeeded, confirm it instead.
  // Only releases when Paystack definitively says "not paid" — a network
  // error leaves the reservation in place for the next run.
  private async settleReservation(row: any): Promise<'confirmed' | 'released' | 'unknown'> {
    const references = [row.paymentReference, ...(row.previousReferences ?? [])].filter(Boolean);

    for (const ref of references) {
      try {
        const tx = await this.paystackService.verifyTransaction(ref);
        if (tx?.status === 'success') {
          await this.confirmPoolContribution(row, ref, tx.amount);
          return 'confirmed';
        }
      } catch (error: any) {
        const status = error?.response?.status;
        // 4xx = Paystack has no successful record of this reference
        // (never opened / not found). Anything else = we don't know yet.
        if (!status || status >= 500) {
          this.logger.warn(`Could not verify ${ref} with Paystack (${error?.message}) — will retry`);
          return 'unknown';
        }
      }
    }

    await this.releaseReservation(row);
    return 'released';
  }

  private async releaseReservation(row: any) {
    const expired = await this.sessionPaymentRepository.findOneAndUpdate(
      { _id: row._id, status: PaymentStatus.PENDING },
      { status: PaymentStatus.EXPIRED },
    );
    if (!expired) return; // already confirmed / released by another caller

    await this.sessionModel.updateOne(
      { _id: expired.sessionId },
      { $inc: { amountReserved: -expired.baseAmount } },
    );
    await this.publishPoolUpdate(expired.sessionId.toString(), 'reservation_released');
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async expireStaleReservations() {
    const stale = await this.sessionPaymentRepository.find({
      status: PaymentStatus.PENDING,
      'metadata.paymentMode': SESSION_PAYMENT_MODE.POOL,
      expiresAt: { $lt: new Date() },
    });

    for (const row of stale) {
      try {
        await this.settleReservation(row);
      } catch (error: any) {
        this.logger.error(`Failed to settle pool reservation ${row._id}: ${error.message}`);
      }
    }
  }

  // Called by SessionsService before removing a member from a POOL session.
  // Before the pot is full their contributions are refunded; once it's full
  // they leave with no refund (product decision) and their money stays in.
  // Throws if a needed refund couldn't be requested, so the leave is blocked.
  async handlePoolMemberLeave(sessionId: string, userId: string) {
    const sid = new Types.ObjectId(sessionId);
    const uid = new Types.ObjectId(userId);

    const pending = await this.sessionPaymentRepository.find({
      sessionId: sid,
      userId: uid,
      status: PaymentStatus.PENDING,
      'metadata.paymentMode': SESSION_PAYMENT_MODE.POOL,
    });
    for (const row of pending) {
      await this.settleReservation(row);
    }

    const session = await this.sessionModel.findById(sid).lean();
    if (session?.paymentStatus === 'COMPLETED') {
      return { refunded: 0 };
    }

    const paid = await this.sessionPaymentRepository.find({ sessionId: sid, userId: uid, status: PaymentStatus.PAID });
    for (const row of paid) {
      await this.refundPayment(row._id.toString(), 'Player left session');
    }

    return { refunded: paid.length };
  }

  async getPoolSnapshot(sessionId: string): Promise<PoolSnapshot> {
    const sid = new Types.ObjectId(sessionId);
    const session: any = await this.sessionModel.findById(sid).lean();
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // `paid` is derived from the rows (the truth), not the counter.
    const contributions = await this.sessionPaymentRepository.findRaw().aggregate([
      { $match: { sessionId: sid, status: PaymentStatus.PAID } },
      { $group: { _id: '$userId', amount: { $sum: { $ifNull: ['$baseAmount', '$amount'] } } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $sort: { amount: -1 } },
    ]);

    const contributors = contributions.map((c: any) => ({
      userId: c._id.toString(),
      name: c.user?.nickname || [c.user?.firstName, c.user?.lastName].filter(Boolean).join(' ') || 'Player',
      amount: c.amount,
    }));

    const target = session.paymentTarget ?? 0;
    const paid = contributors.reduce((sum: number, c: PoolContributorLike) => sum + c.amount, 0);
    const reserved = Math.max(0, session.amountReserved ?? 0);
    const remaining = Math.max(0, target - paid);

    if (paid !== (session.amountPaid ?? 0)) {
      this.logger.warn(
        `Pool counter drift on session ${sessionId}: amountPaid=${session.amountPaid}, rows say ${paid} — run recomputePool`,
      );
    }

    const contributorIds = new Set(contributors.map((c: PoolContributorLike) => c.userId));
    const members: string[] = (session.members ?? []).map((m: any) => m.toString());
    const notYetPaid = members.filter((m) => !contributorIds.has(m)).length;
    const divisor = notYetPaid || members.length || 1;

    return {
      sessionId,
      target,
      paid,
      reserved,
      remaining,
      available: Math.max(0, remaining - reserved),
      fairShare: Math.ceil(remaining / divisor),
      minContribution: await this.settingsService.getMinContributionAmount(),
      fullyFunded: session.paymentStatus === 'COMPLETED' || (target > 0 && paid >= target),
      contributors,
    };
  }

  // Rebuilds the pool counters from the SessionPayment rows (the source of
  // truth). For reconciliation if the counters ever drift.
  async recomputePool(sessionId: string) {
    const sid = new Types.ObjectId(sessionId);
    const [sums] = await this.sessionPaymentRepository.findRaw().aggregate([
      { $match: { sessionId: sid, 'metadata.paymentMode': SESSION_PAYMENT_MODE.POOL } },
      {
        $group: {
          _id: null,
          paid: { $sum: { $cond: [{ $eq: ['$status', PaymentStatus.PAID] }, '$baseAmount', 0] } },
          reserved: { $sum: { $cond: [{ $eq: ['$status', PaymentStatus.PENDING] }, '$baseAmount', 0] } },
        },
      },
    ]);

    const amountPaid = sums?.paid ?? 0;
    const amountReserved = sums?.reserved ?? 0;
    await this.sessionModel.updateOne({ _id: sid }, { $set: { amountPaid, amountReserved } });
    await this.maybeCompletePool(sid);
    await this.publishPoolUpdate(sessionId, 'recomputed');

    return { sessionId, amountPaid, amountReserved };
  }

  // Live updates are best-effort: an SSE/Redis failure must never fail the
  // payment flow that triggered it. Clients re-sync from the snapshot on
  // (re)connect anyway.
  async publishPoolUpdate(sessionId: string, reason: string) {
    try {
      const snapshot = await this.getPoolSnapshot(sessionId);
      await this.sessionPaymentEventService.emitPoolUpdate(snapshot, reason);
    } catch (error: any) {
      this.logger.error(`Failed to publish pool update for session ${sessionId}: ${error.message}`);
    }
  }

  // Who may see a session's payments (who paid, how much, contributor
  // names): its members, the pitch owner, or super-admin.
  async assertCanViewSessionPayments(sessionId: string, user: any) {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new NotFoundException('Session not found');
    }
    const session: any = await this.sessionModel.findById(sessionId).select('members location paymentMode').lean();
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const userId = user?._id?.toString();
    if (user?.role === USER_ROLE.SUPER_ADMIN) return session;
    if ((session.members ?? []).some((m: any) => m.toString() === userId)) return session;

    const location = await this.locationModel.findById(session.location).select('owner').lean();
    if (location?.owner?.toString() === userId) return session;

    throw new ForbiddenException('You are not part of this session');
  }

  async assertCanViewPool(sessionId: string, user: any) {
    const session = await this.assertCanViewSessionPayments(sessionId, user);
    if (!this.isPoolSession(session)) {
      throw new BadRequestException('This session does not use pooled payment');
    }
  }

  // The session's own paymentStatus/allPaymentsCompleted are set once when
  // payments are initialized (onSessionFull) but nothing was ever flipping
  // them back once every member actually paid — individual SessionPayment
  // rows would all show PAID while the session itself stayed stuck PENDING.
  // Mirrors maybeCompleteSessionRefund below, but for the payment side.
  private async maybeCompleteSessionPayments(sessionId: Types.ObjectId) {
    const allPaid = await this.areAllPaymentsCompleted(sessionId);
    if (!allPaid) return;

    const updated = await this.sessionModel.findOneAndUpdate(
      { _id: sessionId, status: SESSION_STATUS.OPEN },
      { $set: { paymentStatus: 'COMPLETED', allPaymentsCompleted: true } },
    );
    // Only the update that actually flips PENDING -> COMPLETED should
    // allocate sets (guards against a cancelled/already-completed session,
    // and against firing twice if this ever races). Fire-and-forget with a
    // logged failure — a set-allocation error must never fail the payment
    // confirmation that triggered it. createSet() is itself idempotent
    // (throws if sets already exist for this session), so a rare double
    // trigger is harmless.
    if (updated) {
      this.setsService
        .createSet(sessionId.toString())
        .catch((err) => this.logger.error(`Auto set-allocation failed for session ${sessionId}: ${err.message}`));
    }
  }

  // "Is this session paid for?" — used to gate match start. A POOL session
  // is paid once the pot is full, regardless of how many members chipped in.
  async areAllPaymentsCompleted(sessionId: Types.ObjectId): Promise<boolean> {
    const session: any = await this.sessionModel.findById(sessionId).select('paymentMode paymentStatus').lean();
    if (this.isPoolSession(session)) {
      return session.paymentStatus === 'COMPLETED';
    }

    const [total, unpaid] = await Promise.all([
      this.sessionPaymentRepository.findRaw().countDocuments({ sessionId }),
      this.sessionPaymentRepository.findRaw().countDocuments({ sessionId, status: { $ne: PaymentStatus.PAID } }),
    ]);

    return total === 0 || unpaid === 0;
  }

  async getUsersWithActiveRecurringPayment(
    locationId: Types.ObjectId,
    userIds: Types.ObjectId[],
    pricingOption: LOCATION_PRICING_OPTION,
  ): Promise<Set<string>> {
    if (!userIds.length || pricingOption === LOCATION_PRICING_OPTION.HOURLY) {
      return new Set<string>();
    }

    const now = new Date();
    const validityMs = 30 * 24 * 60 * 60 * 1000;

    const paidRecords = await this.sessionPaymentRepository.find({
      locationId,
      userId: { $in: userIds },
      status: PaymentStatus.PAID,
      'metadata.pricingOption': pricingOption,
    });

    const latestPaidByUser = new Map<string, Date>();
    for (const record of paidRecords) {
      if (!record.paidAt) continue;
      const userId = record.userId.toString();
      const currentLatest = latestPaidByUser.get(userId);
      if (!currentLatest || new Date(record.paidAt) > currentLatest) {
        latestPaidByUser.set(userId, new Date(record.paidAt));
      }
    }

    const activeUsers = new Set<string>();
    for (const [userId, paidAt] of latestPaidByUser.entries()) {
      if (now.getTime() - paidAt.getTime() < validityMs) {
        activeUsers.add(userId);
      }
    }

    return activeUsers;
  }

  async getSessionPaymentStatus(sessionId: string) {
    const [aggResult] = await this.sessionPaymentRepository.findRaw().aggregate([
      { $match: { sessionId: new Types.ObjectId(sessionId) } },
      {
        $facet: {
          stats: [
            {
              $group: {
                _id: null,
                totalPayments: { $sum: 1 },
                paidPayments: { $sum: { $cond: [{ $eq: ['$status', PaymentStatus.PAID] }, 1, 0] } },
                pendingPayments: { $sum: { $cond: [{ $eq: ['$status', PaymentStatus.PENDING] }, 1, 0] } },
              },
            },
          ],
          payments: [{ $project: { __v: 0 } }],
        },
      },
    ]);

    const stat = aggResult?.stats?.[0] ?? { totalPayments: 0, paidPayments: 0, pendingPayments: 0 };
    const payments = aggResult?.payments ?? [];

    const session: any = await this.sessionModel.findById(sessionId).select('paymentMode').lean();
    const pool = this.isPoolSession(session) ? await this.getPoolSnapshot(sessionId) : undefined;

    return {
      totalPayments: stat.totalPayments,
      paidPayments: stat.paidPayments,
      pendingPayments: stat.pendingPayments,
      allCompleted: pool ? pool.fullyFunded : stat.paidPayments === stat.totalPayments,
      payments,
      ...(pool ? { pool } : {}),
    };
  }

  // True if the session has any payment where money is still with the owner
  // and not yet confirmed refunded — PAID (never refunded), or any of the
  // in-flight refund states (a cancel was requested but Paystack hasn't
  // confirmed it yet). Used to block session deletion until refunds have
  // actually cleared, not just been requested.
  async hasUnresolvedPayments(sessionId: string): Promise<boolean> {
    const count = await this.sessionPaymentRepository.findRaw().countDocuments({
      sessionId: new Types.ObjectId(sessionId),
      status: {
        $in: [
          PaymentStatus.PAID,
          PaymentStatus.REFUND_PENDING,
          PaymentStatus.REFUND_NEEDS_ATTENTION,
          PaymentStatus.REFUND_FAILED,
        ],
      },
    });

    return count > 0;
  }

  async getSessionMemberPaymentMap(sessionId: string): Promise<Map<string, PaymentStatus>> {
    const payments = await this.sessionPaymentRepository
      .findRaw()
      .find({ sessionId: new Types.ObjectId(sessionId) }, { userId: 1, status: 1, _id: 0 })
      .lean();

    // POOL sessions can have several rows per member (top-ups, expired
    // checkouts) — a member who has any PAID contribution shows as PAID.
    const map = new Map<string, PaymentStatus>();
    for (const p of payments as any[]) {
      const key = p.userId.toString();
      if (map.get(key) !== PaymentStatus.PAID) map.set(key, p.status);
    }
    return map;
  }

  // Requests a refund for a single PAID session payment. IMPORTANT: Paystack
  // refunds are asynchronous — this only *initiates* the refund (Paystack's
  // response is "queued for processing"). The payment moves to
  // REFUND_PENDING here; it only becomes REFUNDED once the refund.processed
  // webhook arrives (see handleRefundWebhookEvent below). Money can take up
  // to 10 business days to actually settle per Paystack's docs, so nothing
  // in this codebase should treat a successful call here as "money moved."
  async refundPayment(paymentId: string, reason = 'Session cancelled') {
    const payment = await this.sessionPaymentRepository.findOne({
      _id: new Types.ObjectId(paymentId),
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status === PaymentStatus.REFUNDED) {
      this.logger.warn(`Payment already refunded, skipping: ${paymentId}`);
      return payment;
    }

    if (
      payment.status === PaymentStatus.REFUND_PENDING ||
      payment.status === PaymentStatus.REFUND_NEEDS_ATTENTION
    ) {
      this.logger.warn(`Refund already in flight for payment ${paymentId} (status: ${payment.status})`);
      return payment;
    }

    if (payment.status !== PaymentStatus.PAID && payment.status !== PaymentStatus.REFUND_FAILED) {
      this.logger.warn(`Payment ${paymentId} is not refundable (status: ${payment.status})`);
      return payment;
    }

    const refund = await this.paystackService.refundTransaction(payment.paymentReference, payment.amount, reason);

    // Conditional on the status we read, so a concurrent refund of the same
    // row can't decrement the pool counter twice.
    const updatedPayment = await this.sessionPaymentRepository.findOneAndUpdate(
      { _id: payment._id, status: payment.status },
      { status: PaymentStatus.REFUND_PENDING, refundReference: refund?.id?.toString() },
    );

    // A refunded POOL contribution stops counting toward the pot as soon as
    // the refund is requested. REFUND_FAILED retries were already taken out.
    if (updatedPayment && this.isPoolPayment(payment) && payment.status === PaymentStatus.PAID) {
      await this.sessionModel.updateOne(
        { _id: payment.sessionId },
        { $inc: { amountPaid: -(payment.baseAmount ?? payment.amount) } },
      );
      await this.publishPoolUpdate(payment.sessionId.toString(), 'refund_requested');
    }

    this.logger.log(
      `Refund requested for payment ${paymentId} (session ${payment.sessionId}), Paystack refund id: ${refund?.id}`,
    );

    return updatedPayment;
  }

  // Requests a refund for every PAID payment on a session. Runs
  // sequentially (not Promise.all) to keep behaviour predictable if a
  // future change adds any pre-refund DB writes per payment. Returns
  // per-payment results instead of throwing, so a partial failure doesn't
  // hide which specific members still need a refund *requested*.
  // NOTE: "allInitiated: true" means every refund request was accepted by
  // Paystack — not that the money has moved. The session only reaches
  // SESSION_STATUS.REFUNDED once every payment's refund.processed webhook
  // has actually arrived (see maybeCompleteSessionRefund below).
  async refundAllForSession(sessionId: string) {
    const paidPayments = await this.sessionPaymentRepository.find({
      sessionId: new Types.ObjectId(sessionId),
      status: PaymentStatus.PAID,
    });

    const results: Array<{ paymentId: string; userId: string; success: boolean; error?: string }> = [];

    for (const payment of paidPayments) {
      try {
        await this.refundPayment(payment._id.toString());
        results.push({ paymentId: payment._id.toString(), userId: payment.userId.toString(), success: true });
      } catch (error: any) {
        this.logger.error(`Failed to request refund for payment ${payment._id}: ${error.message}`);
        results.push({
          paymentId: payment._id.toString(),
          userId: payment.userId.toString(),
          success: false,
          error: error.message,
        });
      }
    }

    return {
      allInitiated: results.every((r) => r.success),
      totalPaid: paidPayments.length,
      results,
    };
  }

  // Entry point for refund.* Paystack webhook events (called from
  // WebhookService). Correlates the event back to a SessionPayment via the
  // original transaction reference — refund events don't carry our payment
  // id, only Paystack's own transaction/refund references.
  async handleRefundWebhookEvent(event: string, data: any) {
    const transactionReference = data?.transaction_reference || data?.transaction?.reference;
    if (!transactionReference) {
      this.logger.warn(`Refund webhook ${event} missing transaction reference — cannot correlate to a payment`);
      return;
    }

    const payment = await this.sessionPaymentRepository.findOne({ paymentReference: transactionReference });
    if (!payment) {
      // Not every refund belongs to a session payment (tournament fees,
      // wallet funding, withdrawal reversals, etc. all reuse Paystack too).
      return;
    }

    switch (event) {
      case 'refund.processed':
        await this.completeRefund(payment);
        break;

      case 'refund.failed':
        await this.sessionPaymentRepository.findOneAndUpdate(
          { _id: payment._id },
          { status: PaymentStatus.REFUND_FAILED },
        );
        this.logger.error(
          `Refund FAILED for payment ${payment._id}, session ${payment.sessionId} — needs manual follow-up (retry via refundPayment)`,
        );
        break;

      case 'refund.needs-attention':
        await this.sessionPaymentRepository.findOneAndUpdate(
          { _id: payment._id },
          { status: PaymentStatus.REFUND_NEEDS_ATTENTION },
        );
        this.logger.error(
          `Refund for payment ${payment._id} (session ${payment.sessionId}) needs the player's bank account ` +
          `submitted manually — Paystack couldn't determine it from the original transaction. Call ` +
          `PaystackService.retryRefundWithBankDetails with the player's bank details to continue. ` +
          `NOTE: this app does not currently collect player bank details anywhere — this requires an ops workflow.`,
        );
        break;

      case 'refund.pending':
      case 'refund.processing':
        // Already REFUND_PENDING from the initial request — just visibility.
        this.logger.log(`Refund ${event} for payment ${payment._id}`);
        break;

      default:
        this.logger.log(`Unhandled refund event: ${event}`);
    }
  }

  private async completeRefund(payment: any) {
    if (payment.status === PaymentStatus.REFUNDED) {
      this.logger.warn(`Payment ${payment._id} already marked REFUNDED, ignoring duplicate refund.processed`);
      return;
    }

    // Only debit what the owner was actually credited (baseAmount), not the
    // full amount Paystack refunds to the player. Paystack refunds the
    // player their whole payment including commission — but the platform's
    // commission cut was never credited to the owner's wallet in the first
    // place, so there's nothing to claw back from them for that portion.
    // (The commission itself isn't reversed here — see the note on
    // PlatformCommission if you want refunds to also void the commission
    // record; today it's left as a historical "commission was charged on
    // this payment" fact even if the payment later got refunded.)
    const ownerDebitAmount = payment.baseAmount ?? payment.amount;

    const ownerWallet = await this.walletService.getWalletByUserId(payment.ownerId.toString());

    try {
      await this.walletService.debitWallet(
        ownerWallet._id,
        ownerDebitAmount,
        TransactionSource.REFUND,
        `REFUND_${payment._id}`,
        {
          sessionId: payment.sessionId.toString(),
          userId: payment.userId.toString(),
          originalReference: payment.paymentReference,
        },
      );
    } catch (error: any) {
      // Paystack has confirmed the refund but our ledger debit failed (e.g.
      // owner wallet balance already withdrawn below the refund amount).
      // Do NOT mark REFUNDED here — that would claim our books are square
      // when they aren't. Leaving status at REFUND_PENDING keeps this
      // visibly unresolved rather than silently wrong.
      this.logger.error(
        `CRITICAL: Paystack confirmed refund for payment ${payment._id} but the internal wallet debit failed ` +
        `(${error.message}) — owner wallet and Paystack are now out of sync. Needs manual reconciliation.`,
      );
      return;
    }

    await this.sessionPaymentRepository.findOneAndUpdate(
      { _id: payment._id },
      { status: PaymentStatus.REFUNDED, refundedAt: new Date() },
    );

    this.logger.log(`Refund completed for payment ${payment._id}, session ${payment.sessionId}, amount: ${payment.amount}`);

    await this.maybeCompleteSessionRefund(payment.sessionId);
  }

  // Once every paid member's refund has actually cleared, flip the session
  // from CANCELLED to REFUNDED. Only ever moves a session that's currently
  // CANCELLED — never touches one that's OPEN/COMPLETED for any reason.
  private async maybeCompleteSessionRefund(sessionId: Types.ObjectId) {
    const stillOutstanding = await this.sessionPaymentRepository.findRaw().countDocuments({
      sessionId,
      status: {
        $in: [
          PaymentStatus.PAID,
          PaymentStatus.REFUND_PENDING,
          PaymentStatus.REFUND_NEEDS_ATTENTION,
          PaymentStatus.REFUND_FAILED,
        ],
      },
    });

    if (stillOutstanding > 0) return;

    await this.sessionModel.findOneAndUpdate(
      { _id: sessionId, status: SESSION_STATUS.CANCELLED },
      { $set: { status: SESSION_STATUS.REFUNDED, allRefunded: true } },
    );
  }

  async getUserSessionPayment(sessionId: string, userId: string) {
    const payment = await this.sessionPaymentRepository.findOne({
      sessionId: new Types.ObjectId(sessionId),
      userId: new Types.ObjectId(userId),
    });

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    return payment;
  }

  async getRevenueByLocation(locationId: string) {
    const now = new Date();

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    // Owner-facing revenue must reflect what the owner actually receives
    // (baseAmount), not what the player was charged (amount) — the
    // difference is platform commission, which never reaches the owner.
    // $ifNull falls back to `amount` for payments created before commission
    // existed (no baseAmount stored), matching their original behaviour.
    const aggregate = (startDate: Date) =>
      this.sessionPaymentRepository.findRaw().aggregate([
        {
          $match: {
            locationId: new Types.ObjectId(locationId),
            status: PaymentStatus.PAID,
            paidAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: { $ifNull: ['$baseAmount', '$amount'] } },
            count: { $sum: 1 },
          },
        },
      ]);

    const [weekResult, monthResult, yearResult] = await Promise.all([
      aggregate(weekStart),
      aggregate(monthStart),
      aggregate(yearStart),
    ]);

    return {
      this_week: { total: weekResult[0]?.total ?? 0, count: weekResult[0]?.count ?? 0 },
      this_month: { total: monthResult[0]?.total ?? 0, count: monthResult[0]?.count ?? 0 },
      this_year: { total: yearResult[0]?.total ?? 0, count: yearResult[0]?.count ?? 0 },
    };
  }

  // All-time platform revenue from commission — sums PlatformCommission
  // records directly rather than deriving from SessionPayment, since a
  // payment's commission fact should stay on record even if that payment
  // later gets refunded (see the note in completeRefund).
  async getCommissionSummary() {
    const [result] = await this.platformCommissionRepository.findRaw().aggregate([
      {
        $group: {
          _id: null,
          totalCommission: { $sum: '$commissionAmount' },
          count: { $sum: 1 },
        },
      },
    ]);

    return {
      totalCommission: result?.totalCommission ?? 0,
      count: result?.count ?? 0,
    };
  }
}
