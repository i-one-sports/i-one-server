import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PaystackService } from '@app/common/providers/paystack.service';
import { WalletService } from './wallet.service';
import { SessionPaymentService } from './session-payment.service';
import { TournamentPaymentService } from './tournament-payment.service';
import { WebhookEventRepository } from '../repositories/webhook-event.repository';
import { TransactionRepository } from '../repositories/transaction.repository';
import { WalletRepository } from '../repositories/wallet.repository';
import { Types } from 'mongoose';
import { TransactionSource, TransactionStatus } from '@app/common/schemas/transaction.schema';
import { randomUUID } from 'crypto';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly paystackService: PaystackService,
    private readonly walletService: WalletService,
    private readonly sessionPaymentService: SessionPaymentService,
    private readonly tournamentPaymentService: TournamentPaymentService,
    private readonly webhookEventRepository: WebhookEventRepository,
    private readonly transactionRepository: TransactionRepository,
    private readonly walletRepository: WalletRepository,
  ) {}

  async handleWebhook(signature: string, body: any, rawBody: string) {
    const isValid = this.paystackService.validateWebhookSignature(signature, rawBody);
    if (!isValid) {
      this.logger.error('Invalid webhook signature');
      throw new BadRequestException('Invalid webhook signature');
    }

    const { event, data } = this.paystackService.parseWebhookEvent(body);
    this.logger.log(`Received webhook event: ${event} | ref: ${data?.reference}`);

    // Store the event BEFORE processing. The unique index on eventId means
    // if Paystack delivers the same event twice, the second insert throws a
    // duplicate key error and we skip processing entirely — no double-credits.
    try {
      await this.webhookEventRepository.create({
        provider: 'paystack',
        event,
        eventId: data?.reference || `${event}_${Date.now()}`,
        payload: body,
        processed: false,
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        this.logger.warn(`Duplicate webhook ignored: ${data?.reference}`);
        return { status: 'duplicate' };
      }
      throw err;
    }

    try {
      switch (event) {
        case 'charge.success':
          await this.handleChargeSuccess(data);
          break;
        case 'transfer.success':
          await this.handleTransferSuccess(data);
          break;
        case 'transfer.failed':
          await this.handleTransferFailed(data);
          break;
        case 'transfer.reversed':
          await this.handleTransferReversed(data);
          break;
        default:
          this.logger.log(`Unhandled webhook event: ${event}`);
      }

      await this.webhookEventRepository.findOneAndUpdate(
        { eventId: data?.reference },
        { processed: true, processedAt: new Date() },
      );
    } catch (err: any) {
      this.logger.error(`Webhook processing failed for event ${event}: ${err.message}`);
    }

    return { status: 'success' };
  }

  private async handleChargeSuccess(data: any) {
    this.logger.log(`Processing charge.success: ${data.reference}`);

    const metadata = data.metadata || {};
    const amount = data.amount / 100; // Paystack sends kobo, convert to naira

    // Branch 1: Session payment — user paid for a specific session via Paystack checkout
    if (metadata.sessionId && metadata.userId) {
      await this.sessionPaymentService.confirmSessionPayment(
        new Types.ObjectId(metadata.sessionId),
        new Types.ObjectId(metadata.userId),
        data.reference,
        amount,
      );
      this.logger.log(`Session payment confirmed: ${data.reference}`);
      return;
    }

    // Branch 2: Tournament registration fee
    if (metadata.type === 'TOURNAMENT_REGISTRATION') {
      await this.tournamentPaymentService.confirmPayment(data.reference, amount);
      this.logger.log(`Tournament registration confirmed: ref ${data.reference}`);
      return;
    }

    // Branch 3: Wallet funding — owner topped up their wallet via Paystack
    if (metadata.type === 'WALLET_FUNDING' && metadata.walletId) {
      const wallet = await this.walletRepository.findOne({
        _id: new Types.ObjectId(metadata.walletId),
      });

      if (!wallet) {
        this.logger.error(`Wallet not found for funding: ${metadata.walletId}`);
        return;
      }

      await this.walletService.creditWallet(
        wallet._id,
        amount,
        TransactionSource.WALLET_FUNDING,
        data.reference,
        { paystackData: data },
      );

      // Mark the pending WALLET_FUNDING transaction as SUCCESS
      await this.transactionRepository.findOneAndUpdate(
        { reference: data.reference, status: TransactionStatus.PENDING },
        { status: TransactionStatus.SUCCESS, balanceAfter: wallet.balance + amount },
      );

      this.logger.log(`Wallet funded: ${metadata.walletId}, amount: ${amount}`);
      return;
    }

    this.logger.warn(`charge.success with unrecognized metadata — ref: ${data.reference}`);
  }

  private async handleTransferSuccess(data: any) {
    this.logger.log(`Transfer successful: ${data.reference}`);

    await this.transactionRepository.findOneAndUpdate(
      { reference: data.reference, source: TransactionSource.WITHDRAWAL },
      { status: TransactionStatus.SUCCESS },
    );
  }

  private async handleTransferFailed(data: any) {
    this.logger.error(`Transfer failed: ${data.reference}`);
    await this.refundWithdrawal(data, 'Withdrawal failed');
  }

  private async handleTransferReversed(data: any) {
    this.logger.warn(`Transfer reversed: ${data.reference}`);
    await this.refundWithdrawal(data, 'Withdrawal reversed by Paystack');
  }

  private async refundWithdrawal(data: any, reason: string) {
    const transaction = await this.transactionRepository.findOne({
      reference: data.reference,
      source: TransactionSource.WITHDRAWAL,
    });

    if (!transaction) return;

    try {
      await this.walletService.creditWallet(
        transaction.walletId,
        transaction.amount,
        TransactionSource.REFUND,
        `REFUND_${randomUUID()}`,
        { originalReference: data.reference, reason, paystackData: data },
      );
      this.logger.log(`Refunded withdrawal: ${data.reference}`);
    } catch (error: any) {
      this.logger.error(`Failed to refund withdrawal ${data.reference}: ${error.message}`);
    }
  }
}
