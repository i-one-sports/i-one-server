import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { FundMyWalletDto, FundWalletDto } from './wallet.dto';
import { WithdrawFundsDto } from './withdrawal.dto';
import { SessionCheckoutDto } from './session-payment.dto';
import { UpdateLocationPricingDto } from 'src/locations/dto/location.dto';
import { LOCATION_PRICING_OPTION, LOCATION_TIER } from '@app/common';

// Same options as main.ts
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const validate = (dto: any, body: any) =>
  pipe.transform(body, { type: 'body', metatype: dto } as ArgumentMetadata);

describe('money inputs are whole kobo', () => {
  const userId = '507f1f77bcf86cd799439011';

  it.each([
    ['owner wallet top-up', FundMyWalletDto, {}],
    ['admin wallet funding', FundWalletDto, { userId }],
    ['withdrawal', WithdrawFundsDto, {}],
    ['pool checkout', SessionCheckoutDto, {}],
  ])('%s: accepts 200000, rejects 2000.5 / 0 / "200000"', async (_label, dto, extra) => {
    await expect(validate(dto, { ...extra, amount: 200000 })).resolves.toMatchObject({ amount: 200000 });
    await expect(validate(dto, { ...extra, amount: 2000.5 })).rejects.toThrow(BadRequestException);
    await expect(validate(dto, { ...extra, amount: '200000' })).rejects.toThrow(BadRequestException);
    if (dto !== SessionCheckoutDto) {
      await expect(validate(dto, { ...extra, amount: 0 })).rejects.toThrow(BadRequestException);
    }
  });

  it('owner wallet top-up now rejects a missing amount (it had no validation before)', async () => {
    await expect(validate(FundMyWalletDto, {})).rejects.toThrow(BadRequestException);
  });

  it('pitch prices: whole kobo, at least 1', async () => {
    const base = { tier: LOCATION_TIER.PAID, pricingOption: LOCATION_PRICING_OPTION.HOURLY };
    await expect(validate(UpdateLocationPricingDto, { ...base, pricePerHour: 2000000 })).resolves.toBeDefined();
    await expect(validate(UpdateLocationPricingDto, { ...base, pricePerHour: 20000.5 })).rejects.toThrow(BadRequestException);
    const monthly = { tier: LOCATION_TIER.PAID, pricingOption: LOCATION_PRICING_OPTION.MONTHLY };
    await expect(validate(UpdateLocationPricingDto, { ...monthly, paymentPerPersonMonthly: 0 })).rejects.toThrow(BadRequestException);
  });
});
