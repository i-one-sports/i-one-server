import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { SessionPaymentRepository } from '../repositories/session-payment.repository';
import { WalletService } from './wallet.service';
import { Types } from 'mongoose';
import { PaymentStatus } from '@app/common/schemas/session-payment.schema';
import { TransactionSource } from '@app/common/schemas/transaction.schema';
import { randomUUID } from 'crypto';

@Injectable()
export class SessionPaymentService {
  private readonly logger = new Logger(SessionPaymentService.name);

  constructor(
    private readonly sessionPaymentRepository: SessionPaymentRepository,
    private readonly walletService: WalletService,
  ) {}

  async initializeSessionPayments(
    sessionId: Types.ObjectId,
    locationId: Types.ObjectId,
    ownerId: Types.ObjectId,
    memberIds: Types.ObjectId[],
    amount: number,
    paymentDeadline?: Date,
  ) {
    this.logger.log(`Initializing payments for session: ${sessionId}, members: ${memberIds.length}`);

    const payments = [];

    for (const userId of memberIds) {
      const existingPayment = await this.sessionPaymentRepository.findOne({
        sessionId,
        userId,
      });

      if (existingPayment) {
        this.logger.log(`Payment already exists for user: ${userId} in session: ${sessionId}`);
        payments.push(existingPayment);
        continue;
      }

      const payment = await this.sessionPaymentRepository.create({
        sessionId,
        userId,
        locationId,
        ownerId,
        amount,
        status: PaymentStatus.PENDING,
        paymentReference: `SESSION_${sessionId}_USER_${userId}_${randomUUID()}`,
        expiresAt: paymentDeadline,
      });

      payments.push(payment);
    }

    this.logger.log(`Initialized ${payments.length} payment records for session: ${sessionId}`);

    return payments;
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
    const payments = await this.sessionPaymentRepository.find({ sessionId });

    if (payments.length === 0) {
      return false;
    }

    return payments.every((payment) => payment.status === PaymentStatus.PAID);
  }

  async getSessionPaymentStatus(sessionId: string) {
    const payments = await this.sessionPaymentRepository.find({
      sessionId: new Types.ObjectId(sessionId),
    });

    const totalPayments = payments.length;
    const paidPayments = payments.filter((p) => p.status === PaymentStatus.PAID).length;
    const pendingPayments = payments.filter((p) => p.status === PaymentStatus.PENDING).length;

    return {
      totalPayments,
      paidPayments,
      pendingPayments,
      allCompleted: totalPayments > 0 && paidPayments === totalPayments,
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
}
