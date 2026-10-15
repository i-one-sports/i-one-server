import { feeOn, grossUp, ProcessingFeeConfig } from './processing-fee';

describe('processing fee', () => {
  // 1.9% + ₦100, ₦100 waived below ₦2,500, capped at ₦2,000 (kobo)
  const config: ProcessingFeeConfig = { percent: 1.9, flat: 10000, flatWaivedBelow: 250000, cap: 200000 };

  it.each([
    // subtotal (share + 15% commission) → total charged, to the kobo
    [230000, 234455], // ₦2,000 share  → ₦2,344.55
    [575000, 596331], // ₦5,000 share  → ₦5,963.31
    [1150000, 1182467], // ₦10,000 share → ₦11,824.67
    [2300000, 2354741], // ₦20,000 share → ₦23,547.41
  ])('grosses %i up to %i', (subtotal, total) => {
    expect(grossUp(subtotal, config).total).toBe(total);
  });

  it('applies the flat fee when the total crosses the waiver threshold', () => {
    // ₦2,470 needs > ₦2,500 once the fee is added, so the ₦100 applies
    const { total } = grossUp(247000, config);
    expect(total).toBeGreaterThanOrEqual(250000);
    expect(total - feeOn(total, config)).toBeGreaterThanOrEqual(247000);
  });

  it('never charges more than the cap', () => {
    const { processingFee } = grossUp(50_000_000, config); // ₦500,000
    expect(processingFee).toBe(200000);
  });

  it('never under-collects: every kobo amount up to ₦300, around the ₦2,500 threshold, and a spread above', () => {
    const amounts = [
      ...Array.from({ length: 30000 }, (_, i) => i + 1),
      ...Array.from({ length: 20000 }, (_, i) => 235000 + i), // straddles the ₦2,500 flat-fee threshold
      ...Array.from({ length: 2000 }, (_, i) => 300000 + i * 7919),
    ];
    for (const subtotal of amounts) {
      const { total } = grossUp(subtotal, config);
      expect(total - feeOn(total, config)).toBeGreaterThanOrEqual(subtotal);
    }
  });

  it('charges no fee when the fee is configured off', () => {
    expect(grossUp(500000, { ...config, percent: 0, flat: 0 })).toEqual({ total: 500000, processingFee: 0 });
  });
});
