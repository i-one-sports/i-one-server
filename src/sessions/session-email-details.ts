import {
  APP_TIME_ZONE,
  LOCATION_PRICING_OPTION,
  ROTATION_FORMAT,
  SESSION_PAYMENT_MODE,
  WINNING_DECIDER,
} from '@app/common';

export interface SessionEmailInput {
  startTime: Date;
  stopTime: Date;
  timeDuration: number;
  playersPerTeam: number;
  setNumber: number;
  rotationFormat?: ROTATION_FORMAT;
  winningDecider?: WINNING_DECIDER;
  paymentRequired: boolean;
  paymentMode?: SESSION_PAYMENT_MODE;
  paymentAmount?: number;
  paymentTarget?: number;
  pricingOption?: LOCATION_PRICING_OPTION;
}

export interface SessionEmailDetails {
  date: string;
  time: string;
  duration: string;
  format: string;
  rules: string;
  payment: string;
}

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE });

// "Saturday 31 October 2026", built from parts so the punctuation doesn't
// depend on the Node/ICU version.
const dateText = (date: Date): string => {
  const p = Object.fromEntries(dateFormat.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month} ${p.year}`;
};

// Kobo → "₦10,000" (or "₦11,824.67" when there are kobo).
export const naira = (kobo: number): string =>
  `₦${(kobo / 100).toLocaleString('en-NG', {
    minimumFractionDigits: kobo % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;

const durationText = (mins: number): string => {
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  const h = hours ? `${hours} hour${hours === 1 ? '' : 's'}` : '';
  const m = rest ? `${rest} min${rest === 1 ? '' : 's'}` : '';
  return [h, m].filter(Boolean).join(' ') || '0 mins';
};

const paymentText = (s: SessionEmailInput): string => {
  if (!s.paymentRequired) return 'Free';
  if (s.paymentMode === SESSION_PAYMENT_MODE.POOL) {
    return `${naira(s.paymentTarget ?? 0)} for the pitch, split between the players`;
  }
  const per = `${naira(s.paymentAmount ?? 0)} per player`;
  return s.pricingOption === LOCATION_PRICING_OPTION.MONTHLY ? `${per} (monthly pass)` : per;
};

// When a session is, in Lagos time: "Saturday 31 October 2026" and
// "12:45 AM – 2:45 AM", with "(next day)" if it runs past midnight.
export function sessionWhen(startTime: Date, stopTime: Date): { date: string; time: string } {
  const start = new Date(startTime);
  const stop = new Date(stopTime);
  const nextDay = dayKey.format(start) !== dayKey.format(stop) ? ' (next day)' : '';
  return {
    date: dateText(start),
    time: `${timeFormat.format(start)} – ${timeFormat.format(stop)}${nextDay}`,
  };
}

// What the session emails tell the pitch owner, all in Lagos time.
export function sessionEmailDetails(s: SessionEmailInput): SessionEmailDetails {
  return {
    ...sessionWhen(s.startTime, s.stopTime),
    duration: durationText(s.timeDuration),
    format: `${s.playersPerTeam}-a-side · ${s.setNumber} teams · ${s.playersPerTeam * s.setNumber} players`,
    rules: [
      s.rotationFormat === ROTATION_FORMAT.ROUND_ROBIN ? 'Round robin' : 'Winner stays on',
      s.winningDecider === WINNING_DECIDER.BOTH_OFF ? 'draws: both teams off' : 'draws: penalties',
    ].join(' · '),
    payment: paymentText(s),
  };
}
