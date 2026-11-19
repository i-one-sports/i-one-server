// Processing fee: the payer covers the card processor's fee on top of what
// we need to receive, so i-One's commission isn't eaten by Paystack.
// All amounts are kobo.

export interface ProcessingFeeConfig {
  percent: number; // e.g. 1.9 means 1.9%
  flat: number; // kobo, added when the charged total reaches flatWaivedBelow
  flatWaivedBelow: number; // kobo
  cap: number; // kobo, the fee never exceeds this
}

// The fee charged on a given total, using the same rules as Paystack's
// pricing (percent + flat fee, flat waived below a threshold, capped).
export function feeOn(total: number, config: ProcessingFeeConfig): number {
  const flat = total >= config.flatWaivedBelow ? config.flat : 0;
  return Math.min(config.cap, Math.ceil((total * config.percent) / 100 + flat));
}

// The smallest total to charge so that, after the fee, at least `subtotal`
// is left. Example at 1.9% + ₦100: subtotal ₦11,500 → total ₦11,825
// (processing fee ₦325).
export function grossUp(subtotal: number, config: ProcessingFeeConfig): { total: number; processingFee: number } {
  if (subtotal <= 0) return { total: 0, processingFee: 0 };
  if (config.percent <= 0 && config.flat <= 0) return { total: subtotal, processingFee: 0 };

  const rate = config.percent / 100;
  let total = Math.ceil(subtotal / (1 - rate));
  if (total >= config.flatWaivedBelow) {
    total = Math.ceil((subtotal + config.flat) / (1 - rate));
  }
  if (total - subtotal > config.cap) {
    total = subtotal + config.cap;
  }

  // Rounding can leave us a kobo short; step up until the fee is covered.
  while (total - feeOn(total, config) < subtotal) total++;

  return { total, processingFee: total - subtotal };
}
