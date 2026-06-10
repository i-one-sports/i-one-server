import { Injectable, Logger } from '@nestjs/common';
import { Bank } from '@app/common';
import { BankRepository } from './banks.repository';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — bank list rarely changes

@Injectable()
export class BanksService {
  private readonly logger = new Logger(BanksService.name);

  // In-memory cache shared by every request on this instance — the bank list
  // is small and effectively static, so one DB read per TTL window is enough.
  private cachedBanks: Bank[] | null = null;
  private cacheExpiresAt = 0;

  constructor(private readonly bankRepository: BankRepository) {}

  async findAll(): Promise<Bank[]> {
    const now = Date.now();
    if (this.cachedBanks && now < this.cacheExpiresAt) {
      return this.cachedBanks;
    }

    const banks = await this.bankRepository
      .findRaw()
      .find({ isDeleted: false })
      .sort({ name: 1 })
      .lean();

    this.cachedBanks = banks as unknown as Bank[];
    this.cacheExpiresAt = now + CACHE_TTL_MS;
    this.logger.log(`Cached ${banks.length} banks for ${CACHE_TTL_MS / 1000}s`);

    return this.cachedBanks;
  }
}
