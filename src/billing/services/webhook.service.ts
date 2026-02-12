import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PaystackService } from '@app/common/providers/paystack.service';
import { WalletService } from './wallet.service';
import { SessionPaymentService } from './session-payment.service';
import { DvaRepository } from '../repositories/dva.repository';
import { TransactionRepository } from '../repositories/transaction.repository';
import { Types } from 'mongoose';
import { TransactionSource } from '@app/common/schemas/transaction.schema';
import { randomUUID } from 'crypto';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly paystackService: PaystackService,
    private readonly walletService: WalletService,
    private readonly sessionPaymentService: SessionPaymentService,
    private readonly dvaRepository: DvaRepository,
    private readonly transactionRepository: TransactionRepository,
  ) {}

  async handleWebhook(signature: string, body: any, rawBody: string) {
    const isValid = this.paystackService.validateWebhookSignature(signature, rawBody);
    if (!isValid) {
      this.logger.error('Invalid webhook signature');
      throw new BadRequestException('Invalid webhook signature');
    }

    const { event, data } = this.paystackService.parseWebhookEvent(body);

    this.logger.log(`Received webhook event: ${event}`);

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

    return { status: 'success' };
  }

  private async handleChargeSuccess(data: any) {
    this.logger.log(`Processing charge.success: ${data.reference}`);

    const metadata = data.metadata || {};
    const sessionId = metadata.sessionId;
    const userId = metadata.userId;

    const customerCode = data.customer?.customer_code;
    if (!customerCode) {
      this.logger.error('No customer code in webhook data');
      return;
    }

    const dva = await this.dvaRepository.findOne({ paystackCustomerCode: customerCode });
    if (!dva) {
      this.logger.error(`DVA not found for customer: ${customerCode}`);
      return;
    }

    const amount = data.amount / 100;

    if (sessionId && userId) {
      await this.sessionPaymentService.confirmSessionPayment(
        new Types.ObjectId(sessionId),
        new Types.ObjectId(userId),
        data.reference,
        amount,
      );
    } else {
      await this.walletService.creditWallet(
        dva.walletId,
        amount,
        TransactionSource.ADMIN_FUNDING,
        data.reference,
        { paystackData: data },
      );
    }

    this.logger.log(`Charge processed successfully: ${data.reference}`);
  }

  private async handleTransferSuccess(data: any) {
    this.logger.log(`Transfer successful: ${data.reference}`);

    const transaction = await this.transactionRepository.findOne({
      reference: data.reference,
    });

    if (transaction) {
      this.logger.log(`Withdrawal completed successfully for reference: ${data.reference}`);
    }
  }

  private async handleTransferFailed(data: any) {
    this.logger.error(`Transfer failed: ${data.reference}`, data);

    const transaction = await this.transactionRepository.findOne({
      reference: data.reference,
      source: TransactionSource.WITHDRAWAL,
    });

    if (transaction) {
      this.logger.log(`Reversing failed withdrawal: ${data.reference}`);

      try {
        await this.walletService.creditWallet(
          transaction.walletId,
          transaction.amount,
          TransactionSource.REFUND,
          `REFUND_${randomUUID()}`,
          {
            originalReference: data.reference,
            reason: 'Withdrawal failed',
            paystackData: data,
          },
        );

        this.logger.log(`Refunded failed withdrawal: ${data.reference}`);
      } catch (error) {
        this.logger.error(`Failed to refund withdrawal: ${error.message}`);
      }
    }
  }

  private async handleTransferReversed(data: any) {
    this.logger.warn(`Transfer reversed: ${data.reference}`);

    const transaction = await this.transactionRepository.findOne({
      reference: data.reference,
      source: TransactionSource.WITHDRAWAL,
    });

    if (transaction) {
      this.logger.log(`Reversing reversed withdrawal: ${data.reference}`);

      try {
        await this.walletService.creditWallet(
          transaction.walletId,
          transaction.amount,
          TransactionSource.REFUND,
          `REFUND_${randomUUID()}`,
          {
            originalReference: data.reference,
            reason: 'Withdrawal reversed by Paystack',
            paystackData: data,
          },
        );

        this.logger.log(`Refunded reversed withdrawal: ${data.reference}`);
      } catch (error) {
        this.logger.error(`Failed to refund reversed withdrawal: ${error.message}`);
      }
    }
  }
}
