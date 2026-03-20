import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { SessionPaymentRepository } from '../repositories/session-payment.repository';
import { WalletService } from './wallet.service';
import { PaystackService } from '@app/common/providers/paystack.service';
import { Types } from 'mongoose';
import { PaymentStatus } from '@app/common/schemas/session-payment.schema';
import { TransactionSource } from '@app/common/schemas/transaction.schema';
import { randomUUID } from 'crypto';
import { LOCATION_PRICING_OPTION } from '@app/common';

@Injectable()
export class SessionPaymentService {
  private readonly logger = new Logger(SessionPaymentService.name);

  constructor(
    private readonly sessionPaymentRepository: SessionPaymentRepository,
    private readonly walletService: WalletService,
    private readonly paystackService: PaystackService,
  ) {}

  async initializeSessionPayments(
    sessionId: Types.ObjectId,
    locationId: Types.ObjectId,
    ownerId: Types.ObjectId,
    memberIds: Types.ObjectId[],
    amount: number,
    paymentDeadline?: Date,
    pricingOption?: LOCATION_PRICING_OPTION,
  ) {
    this.logger.log(`Initializing payments for session: ${sessionId}, members: ${memberIds.length}`);

    const existingPayments = await this.sessionPaymentRepository.find({
      sessionId,
      userId: { $in: memberIds },
    });

    const existingUserIds = new Set(existingPayments.map((p) => p.userId.toString()));
    const newMemberIds = memberIds.filter((id) => !existingUserIds.has(id.toString()));

    if (newMemberIds.length > 0) {
      const newPayments = newMemberIds.map((userId) => ({
        _id: new Types.ObjectId(),
        sessionId,
        userId,
        locationId,
        ownerId,
        amount,
        status: PaymentStatus.PENDING,
        paymentReference: `SESSION_${sessionId}_USER_${userId}_${randomUUID()}`,
        expiresAt: paymentDeadline,
        metadata: pricingOption ? { pricingOption } : undefined,
      }));

      await this.sessionPaymentRepository.insertMany(newPayments);
      this.logger.log(`Created ${newMemberIds.length} new payment records for session: ${sessionId}`);
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

    const result = await this.paystackService.initializeTransaction(
      userEmail,
      payment.amount,
      payment.paymentReference,
      { sessionId, userId },
    );

    this.logger.log(`Checkout initialized for session: ${sessionId}, user: ${userId}`);

    return {
      authorizationUrl: result.authorization_url,
      reference: result.reference,
      amount: payment.amount,
    };
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

    const ownerWallet = await this.walletService.getWalletByUserId(payment.ownerId.toString());

    const transaction = await this.walletService.creditWallet(
      ownerWallet._id,
      amount,
      TransactionSource.SESSION_PAYMENT,
      paystackReference,
      {
        sessionId: sessionId.toString(),
        userId: userId.toString(),
      },
      sessionId,
    );

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
            total: { $sum: '$amount' },
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
}
