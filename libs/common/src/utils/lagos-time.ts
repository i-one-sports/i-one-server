// i-One runs in Nigeria: opening hours, "today", day/week/month boundaries
// are all Lagos wall-clock time — never the server's timezone (production
// runs in UTC, which is an hour behind Lagos). Dates are still stored as
// UTC instants; these helpers only decide how an instant reads in Lagos.

export const APP_TIME_ZONE = 'Africa/Lagos';

export interface LagosParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  weekday: number; // 0 = Sunday … 6 = Saturday
}

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function lagosParts(date: Date): LagosParts {
  const parts: Record<string, string> = {};
  for (const p of formatter.formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday),
  };
}

// Minutes since Lagos midnight, e.g. 17:30 in Lagos → 1050.
export function lagosMinutesOfDay(date: Date): number {
  const { hour, minute } = lagosParts(date);
  return hour * 60 + minute;
}

// Lagos calendar date as YYYY-MM-DD.
export function lagosDateKey(date: Date): string {
  const { year, month, day } = lagosParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// The UTC instant of 00:00 Lagos time on the given Lagos calendar date.
// Month/day may overflow (day 0, day 32) like Date.UTC does.
export function lagosMidnight(year: number, month: number, day: number): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day));
  // Offset of Lagos from UTC at that moment, derived rather than hardcoded.
  const p = lagosParts(utcGuess);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const offsetMs = asIfUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offsetMs);
}

export function lagosStartOfDay(date: Date): Date {
  const { year, month, day } = lagosParts(date);
  return lagosMidnight(year, month, day);
}

// Start of the Lagos week (Sunday 00:00, matching the existing revenue
// buckets), month and year containing `date`.
export function lagosStartOfWeek(date: Date): Date {
  const { year, month, day, weekday } = lagosParts(date);
  return lagosMidnight(year, month, day - weekday);
}

export function lagosStartOfMonth(date: Date): Date {
  const { year, month } = lagosParts(date);
  return lagosMidnight(year, month, 1);
}

export function lagosStartOfYear(date: Date): Date {
  return lagosMidnight(lagosParts(date).year, 1, 1);
}

const timeLabelFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

// Lagos clock time for messages, e.g. "5:00 PM".
export function lagosTimeLabel(date: Date): string {
  return timeLabelFormatter.format(date);
}
