import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { SettingsRepository } from './settings.repository';
import { ProcessingFeeConfig } from 'src/billing/utils/processing-fee';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly settingsRepository: SettingsRepository) {}

  // Settings is a singleton collection — there's only ever meant to be one
  // document in it. Reading with an empty filter and creating on first read
  // (rather than a fixed, guessable _id) keeps this self-bootstrapping: no
  // seed script required before the app can boot.
  async getSettings() {
    const existing = await this.settingsRepository.findOne({});
    if (existing) return existing;

    this.logger.log('No settings document found — creating default (commission: 15%)');
    return this.settingsRepository.upsert({}, {});
  }

  async getCommissionPercentage(): Promise<number> {
    const settings = await this.getSettings();
    return settings.commissionPercentage ?? 0;
  }

  // Missing fields (Settings documents created before the processing fee
  // existed) fall back to the schema defaults: 1.9% + ₦100, ₦100 waived
  // below ₦2,500, capped at ₦2,000.
  async getProcessingFeeConfig(): Promise<ProcessingFeeConfig> {
    const settings: any = await this.getSettings();
    return {
      percent: settings.processingFeePercent ?? 1.9,
      flat: settings.processingFeeFlat ?? 10000,
      flatWaivedBelow: settings.processingFeeFlatWaivedBelow ?? 250000,
      cap: settings.processingFeeCap ?? 200000,
    };
  }

  async setProcessingFeeConfig(config: Partial<ProcessingFeeConfig>) {
    if (config.percent !== undefined && (!Number.isFinite(config.percent) || config.percent < 0 || config.percent >= 100)) {
      throw new BadRequestException('percent must be between 0 and 100');
    }
    for (const key of ['flat', 'flatWaivedBelow', 'cap'] as const) {
      if (config[key] !== undefined && (!Number.isInteger(config[key]) || config[key] < 0)) {
        throw new BadRequestException(`${key} must be a non-negative whole number of kobo`);
      }
    }

    await this.getSettings();
    const update: Record<string, number> = {};
    if (config.percent !== undefined) update.processingFeePercent = config.percent;
    if (config.flat !== undefined) update.processingFeeFlat = config.flat;
    if (config.flatWaivedBelow !== undefined) update.processingFeeFlatWaivedBelow = config.flatWaivedBelow;
    if (config.cap !== undefined) update.processingFeeCap = config.cap;

    await this.settingsRepository.upsert({}, update as any);
    this.logger.log(`Processing fee updated: ${JSON.stringify(update)}`);
    return this.getProcessingFeeConfig();
  }

  async setCommissionPercentage(percentage: number, updatedBy: string) {
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      throw new BadRequestException('Commission percentage must be a number between 0 and 100');
    }

    // Ensure the singleton exists before updating it.
    await this.getSettings();

    const updated = await this.settingsRepository.upsert(
      {},
      {
        commissionPercentage: percentage,
        commissionUpdatedBy: new Types.ObjectId(updatedBy),
        commissionUpdatedAt: new Date(),
      },
    );

    this.logger.log(`Commission percentage updated to ${percentage}% by ${updatedBy}`);

    return updated;
  }

  async getMinContributionAmount(): Promise<number> {
    const settings = await this.getSettings();
    return settings.minContributionAmount ?? 50000;
  }

  async setMinContributionAmount(amount: number) {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new BadRequestException('Minimum contribution must be a non-negative whole number of kobo');
    }

    await this.getSettings();

    const updated = await this.settingsRepository.upsert({}, { minContributionAmount: amount });
    this.logger.log(`Minimum pool contribution updated to ${amount} kobo`);

    return updated;
  }
}
