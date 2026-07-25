import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SessionPaymentRepository } from '../repositories/session-payment.repository';
import { WalletService } from './wallet.service';
import { PaystackService } from '@app/common/providers/paystack.service';
import { PaymentStatus, type SessionPayment } from '@app/common/schemas/session-payment.schema';
import { TransactionSource } from '@app/common/schemas/transaction.schema';
import { Session } from '@app/common/schemas/session.schema';
import { randomUUID } from 'crypto';
import { LOCATION_PRICING_OPTION, SESSION_STATUS } from '@app/common';
import { SettingsService } from '../../settings/settings.service';
import { PlatformCommissionRepository } from '../repositories/platform-commission.repository';

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
  ) {}

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

  async initializeCheckout(sessionId: string, userId: string, userEmail: string) {
    const payment = await this.sessionPaymentRepository.findOne({
      sessionId: new Types.ObjectId(sessionId),
      userId: new Types.ObjectId(userId),
      status: PaymentStatus.PENDING,
    });

    if (!payment) {
      throw new NotFoundException('No pending payment found for this session');
    }

    // Before issuing a new Paystack transaction, verify the existing reference
    // on Paystack. The DB can show PENDING while Paystack shows success if the
    // webhook missed (wrong URL, timeout, etc.) — in that case we auto-confirm
    // the payment here instead of charging the user again.
    if (payment.paymentReference) {
      try {
        const existing = await this.paystackService.verifyTransaction(payment.paymentReference);

        if (existing?.status === 'success') {
          this.logger.log(
            `Paystack shows success for ref ${payment.paymentReference} but DB is still PENDING ` +
            `— confirming payment inline (missed webhook)`,
          );
          await this.confirmSessionPayment(
            new Types.ObjectId(sessionId),
            new Types.ObjectId(userId),
            payment.paymentReference,
            existing.amount,
          );
          return { alreadyPaid: true, status: 'confirmed' };
        }

        // abandoned / failed — Paystack knows about the reference but the user
        // never completed payment. Fall through and issue a new transaction.
      } catch {
        // Paystack has no record of this reference yet (first-ever call, or
        // the reference came from the seed script). Fall through to initialize.
      }
    }

    // Either first call or the previous transaction was abandoned/failed —
    // generate a fresh reference so Paystack doesn't reject with duplicate_reference.
    const reference = `SESSION_${sessionId}_USER_${userId}_${randomUUID()}`;

    await this.sessionPaymentRepository.findOneAndUpdate(
      { _id: payment._id },
      { paymentReference: reference },
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

    const payment = await this.sessionPaymentRepository.findOne({
      sessionId,
      userId,
      status: PaymentStatus.PENDING,
    });

    if (!payment) {
      throw new NotFoundException('Payment record not found or already processed');
    }

    if (payment.amount !== amount) {
      throw new BadRequestException(`Amount mismatch: expected ${payment.amount}, got ${amount}`);
    }

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

    const updatedPayment = await this.sessionPaymentRepository.findOneAndUpdate(
      { _id: payment._id },
      {
        status: PaymentStatus.PAID,
        transactionId: transaction._id,
        paidAt: new Date(),
      },
    );

    this.logger.log(`Payment confirmed for session: ${sessionId}, user: ${userId}`);

    return updatedPayment;
  }

  async areAllPaymentsCompleted(sessionId: Types.ObjectId): Promise<boolean> {
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

    return {
      totalPayments: stat.totalPayments,
      paidPayments: stat.paidPayments,
      pendingPayments: stat.pendingPayments,
      allCompleted: stat.paidPayments === stat.totalPayments,
      payments,
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

    return new Map(payments.map((p: any) => [p.userId.toString(), p.status]));
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

    const updatedPayment = await this.sessionPaymentRepository.findOneAndUpdate(
      { _id: payment._id },
      { status: PaymentStatus.REFUND_PENDING, refundReference: refund?.id?.toString() },
    );

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
