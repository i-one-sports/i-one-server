import {
  lagosDateKey,
  lagosMidnight,
  lagosMinutesOfDay,
  lagosStartOfMonth,
  lagosStartOfWeek,
  lagosStartOfYear,
} from './lagos-time';

// These must give the same answers whatever timezone the server runs in —
// run with TZ=UTC, TZ=Africa/Lagos, TZ=America/New_York, TZ=Asia/Tokyo.
describe('lagos-time', () => {
  it('reads wall-clock time in Lagos (UTC+1)', () => {
    expect(lagosMinutesOfDay(new Date('2026-05-03T16:30:00Z'))).toBe(17 * 60 + 30);
    expect(lagosMinutesOfDay(new Date('2026-05-03T23:30:00Z'))).toBe(30); // 00:30 next day in Lagos
  });

  it('uses the Lagos calendar day, which starts at 23:00 UTC', () => {
    expect(lagosDateKey(new Date('2026-05-03T22:59:00Z'))).toBe('2026-05-03');
    expect(lagosDateKey(new Date('2026-05-03T23:00:00Z'))).toBe('2026-05-04');
  });

  it('finds Lagos midnight as a UTC instant, including month/year overflow', () => {
    expect(lagosMidnight(2026, 5, 4).toISOString()).toBe('2026-05-03T23:00:00.000Z');
    expect(lagosMidnight(2026, 12, 32).toISOString()).toBe('2026-12-31T23:00:00.000Z'); // = 1 Jan 2027
    expect(lagosMidnight(2026, 3, 0).toISOString()).toBe('2026-02-27T23:00:00.000Z'); // = 28 Feb
  });

  it('computes week (from Sunday), month and year starts in Lagos time', () => {
    // Sunday 2026-05-31 23:30 UTC is already Monday 1 June 00:30 in Lagos.
    const now = new Date('2026-05-31T23:30:00Z');
    expect(lagosStartOfWeek(now).toISOString()).toBe('2026-05-30T23:00:00.000Z'); // Sun 31 May 00:00 Lagos
    expect(lagosStartOfMonth(now).toISOString()).toBe('2026-05-31T23:00:00.000Z'); // 1 June 00:00 Lagos
    expect(lagosStartOfYear(now).toISOString()).toBe('2025-12-31T23:00:00.000Z');
  });
});
