import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { TransactionSource } from '@app/common/schemas/transaction.schema';
import { SettingsService } from '../../settings/settings.service';
import { grossUp } from '../utils/processing-fee';
import { WalletService } from './wallet.service';

export interface PriceShare {
  commissionPercentage: number;
  commissionAmount: number;
  processingFee: number;
  amount: number; // what the player is charged (kobo)
}

export interface PlatformPostingInput {
  // The Paystack reference that was paid. Every posting's reference is
  // derived from it, so re-running for the same payment posts nothing twice.
  reference: string;
  commissionAmount: number;
  processingFee: number;
  paystackFee?: number; // what Paystack charged us (data.fees), when known
  meta: Record<string, string>;
  sessionId?: Types.ObjectId;
}

// Pricing and i-One's ledger side of a confirmed payment, shared by session
// payments and monthly passes so both split money the same way.
@Injectable()
export class PlatformPostingService {
  constructor(
    private readonly walletService: WalletService,
    private readonly settingsService: SettingsService,
  ) {}

  // What a player is charged for `base` kobo: base + commission (i-One's cut,
  // on top) + processing fee (covers Paystack's fee, on top). Rates are read
  // from Settings now and snapshotted on the payment row by the caller.
  async priceShare(base: number): Promise<PriceShare> {
    const commissionPercentage = await this.settingsService.getCommissionPercentage();
    const commissionAmount = Math.round((base * commissionPercentage) / 100);
    const { total, processingFee } = grossUp(
      base + commissionAmount,
      await this.settingsService.getProcessingFeeConfig(),
    );
    return { commissionPercentage, commissionAmount, processingFee, amount: total };
  }

  // On the single PLATFORM wallet: + commission, + processing fee collected,
  // − what Paystack actually charged. Throws on failure so the webhook is
  // redelivered; the redelivery skips postings that already landed.
  async postPlatformEntries(input: PlatformPostingInput): Promise<void> {
    const platform = await this.walletService.getPlatformWallet();

    if (input.commissionAmount > 0) {
      await this.walletService.creditWallet(
        platform._id,
        input.commissionAmount,
        TransactionSource.PLATFORM_COMMISSION,
        `COMMISSION_${input.reference}`,
        input.meta,
        input.sessionId,
      );
    }

    if (input.processingFee > 0) {
      await this.walletService.creditWallet(
        platform._id,
        input.processingFee,
        TransactionSource.PROCESSING_FEE_COLLECTED,
        `FEE_IN_${input.reference}`,
        input.meta,
        input.sessionId,
      );
    }

    await this.postPaystackFee(input.reference, input.paystackFee, input.meta);
  }

  // Paystack's fee on a charge is i-One's cost (also for charges that are
  // refunded, where nothing else is posted).
  async postPaystackFee(reference: string, paystackFee: number | undefined, meta: Record<string, string>): Promise<void> {
    if (paystackFee === undefined || !Number.isFinite(paystackFee) || paystackFee <= 0) return;
    const platform = await this.walletService.getPlatformWallet();
    await this.walletService.debitWallet(platform._id, paystackFee, TransactionSource.PAYSTACK_FEE, `FEE_OUT_${reference}`, meta);
  }
}
