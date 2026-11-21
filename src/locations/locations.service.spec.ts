import { HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import { LOCATION_PRICING_OPTION, LOCATION_TIER } from '@app/common';
import { LocationsService } from './locations.service';
import { LocationRepository } from './locations.repository';
import { SessionRepository } from 'src/sessions/sessions.repository';
import { UserRepository } from 'src/users/users.repository';
import { MatchRepository } from 'src/matches/matches.repository';
import { SessionPaymentService } from 'src/billing/services/session-payment.service';
import { WithdrawalService } from 'src/billing/services/withdrawal.service';
import { CacheService } from 'src/cache/cache.service';
import { MonthlyPassService } from 'src/billing/services/monthly-pass.service';

describe('LocationsService — monthly pass pricing rules', () => {
  const ownerId = new Types.ObjectId();
  const pitchId = new Types.ObjectId();
  const monthlyPitch = {
    _id: pitchId, owner: ownerId, nameLower: 'lekki', tier: LOCATION_TIER.PAID,
    pricingOption: LOCATION_PRICING_OPTION.MONTHLY, paymentPerPersonMonthly: 2_000_000,
  };
  const noPasses = { activeCount: 0, pendingCount: 0, lastEndsAt: null };

  let locations: { findOne: jest.Mock; findOneAndUpdate: jest.Mock };
  let sessions: { releasePassSessions: jest.Mock };
  let monthlyPasses: { livePassSummary: jest.Mock };
  let service: LocationsService;

  beforeEach(() => {
    locations = {
      findOne: jest.fn().mockResolvedValue(monthlyPitch),
      findOneAndUpdate: jest.fn().mockImplementation((_q, update) => Promise.resolve({ ...monthlyPitch, ...update })),
    };
    sessions = { releasePassSessions: jest.fn().mockResolvedValue(0) };
    monthlyPasses = { livePassSummary: jest.fn().mockResolvedValue(noPasses) };
    service = new LocationsService(
      locations as unknown as LocationRepository,
      sessions as unknown as SessionRepository,
      {} as UserRepository,
      {} as MatchRepository,
      {} as SessionPaymentService,
      { getBankAccounts: jest.fn().mockResolvedValue([{ _id: 'bank' }]) } as unknown as WithdrawalService,
      { delete: jest.fn() } as unknown as CacheService,
      monthlyPasses as unknown as MonthlyPassService,
    );
  });

  const toHourly = () =>
    service.updateLocationPricing(pitchId.toString(), ownerId.toString(), {
      tier: LOCATION_TIER.PAID, pricingOption: LOCATION_PRICING_OPTION.HOURLY, pricePerHour: 1_500_000,
    });
  const failure = (promise: Promise<unknown>) =>
    promise.then(
      () => null,
      (e: { getStatus: () => number; getResponse: () => { message: string; details?: Record<string, unknown> } }) => ({
        status: e.getStatus(), message: e.getResponse().message, ...e.getResponse().details,
      }),
    );

  it('blocks monthly → hourly while passes are running, saying when the last ends', async () => {
    monthlyPasses.livePassSummary.mockResolvedValue({ activeCount: 3, pendingCount: 0, lastEndsAt: new Date('2026-12-06T12:00:00Z') });
    const result = await failure(toHourly());
    expect(result).toMatchObject({ status: HttpStatus.CONFLICT, code: 'PASSES_ACTIVE', activeCount: 3 });
    expect(result?.message).toContain('6 Dec 2026');
    expect(locations.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('blocks it while someone is paying for a pass (open checkout)', async () => {
    monthlyPasses.livePassSummary.mockResolvedValue({ activeCount: 0, pendingCount: 1, lastEndsAt: null });
    expect(await failure(toHourly())).toMatchObject({ status: HttpStatus.CONFLICT, code: 'PASSES_ACTIVE', pendingCount: 1 });
  });

  it('blocks it from free too (no monthly → free → hourly loophole)', async () => {
    locations.findOne.mockResolvedValue({ ...monthlyPitch, tier: LOCATION_TIER.FREE, pricingOption: undefined });
    monthlyPasses.livePassSummary.mockResolvedValue({ activeCount: 1, pendingCount: 0, lastEndsAt: new Date() });
    expect(await failure(toHourly())).toMatchObject({ code: 'PASSES_ACTIVE' });
  });

  it('once no pass is running: switches, and upcoming pass sessions become pool sessions at the new price', async () => {
    sessions.releasePassSessions.mockResolvedValue(2);
    const result = await toHourly();
    expect(sessions.releasePassSessions).toHaveBeenCalledWith(pitchId, expect.any(Date), { pricePerHour: 1_500_000 });
    expect(result).toMatchObject({ passSessionsChanged: 2 });
  });

  it('monthly → free is allowed with passes running; no refunds, upcoming pass sessions just become free', async () => {
    monthlyPasses.livePassSummary.mockResolvedValue({ activeCount: 5, pendingCount: 0, lastEndsAt: new Date() });
    await service.updateLocationPricing(pitchId.toString(), ownerId.toString(), { tier: LOCATION_TIER.FREE });
    expect(locations.findOneAndUpdate).toHaveBeenCalled();
    expect(sessions.releasePassSessions).toHaveBeenCalledWith(pitchId, expect.any(Date), undefined);
  });

  it('a price change on a monthly pitch only changes the price (sold passes keep theirs)', async () => {
    monthlyPasses.livePassSummary.mockResolvedValue({ activeCount: 5, pendingCount: 0, lastEndsAt: new Date() });
    await service.updateLocationPricing(pitchId.toString(), ownerId.toString(), {
      tier: LOCATION_TIER.PAID, pricingOption: LOCATION_PRICING_OPTION.MONTHLY, paymentPerPersonMonthly: 2_500_000,
    });
    expect(locations.findOneAndUpdate).toHaveBeenCalledWith({ _id: pitchId.toString() }, expect.objectContaining({ paymentPerPersonMonthly: 2_500_000 }));
    expect(sessions.releasePassSessions).not.toHaveBeenCalled();
  });

  it('owner can pause and resume pass sales; the reply says how many passes are still running', async () => {
    monthlyPasses.livePassSummary.mockResolvedValue({ activeCount: 2, pendingCount: 0, lastEndsAt: new Date('2026-12-06T12:00:00Z') });
    await expect(service.setMonthlyPassSalesPaused(pitchId.toString(), ownerId.toString(), true)).resolves.toMatchObject({
      monthlyPassSalesPaused: true, activePasses: 2,
    });
    expect(locations.findOneAndUpdate).toHaveBeenCalledWith({ _id: pitchId.toString() }, { monthlyPassSalesPaused: true });
  });

  it('someone else can’t pause a pitch they don’t own', async () => {
    await expect(service.setMonthlyPassSalesPaused(pitchId.toString(), new Types.ObjectId().toString(), true)).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
    });
  });
});
