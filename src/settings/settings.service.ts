import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { SettingsRepository } from './settings.repository';

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

    this.logger.log('No settings document found — creating default (commission: 0%)');
    return this.settingsRepository.upsert({}, {});
  }

  async getCommissionPercentage(): Promise<number> {
    const settings = await this.getSettings();
    return settings.commissionPercentage ?? 0;
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
}
