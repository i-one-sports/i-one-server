import {
  LOCATION_PRICING_OPTION,
  ROTATION_FORMAT,
  SESSION_PAYMENT_MODE,
  WINNING_DECIDER,
} from '@app/common';
import { LOCAL_TEMPLATES } from '@app/common/utils/mail/templates';
import { naira, sessionEmailDetails, SessionEmailInput } from './session-email-details';

// The San Siro session: 23:45 UTC is 00:45 in Lagos, the next calendar day.
const sanSiro: SessionEmailInput = {
  startTime: new Date('2026-10-30T23:45:00.000Z'),
  stopTime: new Date('2026-10-31T01:45:00.000Z'),
  timeDuration: 120,
  playersPerTeam: 5,
  setNumber: 2,
  rotationFormat: ROTATION_FORMAT.WINNER_STAYS,
  winningDecider: WINNING_DECIDER.PENALTY,
  paymentRequired: true,
  paymentMode: SESSION_PAYMENT_MODE.PER_PERSON,
  paymentAmount: 1000000,
  pricingOption: LOCATION_PRICING_OPTION.MONTHLY,
};

describe('sessionEmailDetails', () => {
  it('reads the date and time in Lagos, not UTC', () => {
    expect(sessionEmailDetails(sanSiro)).toEqual({
      date: 'Saturday 31 October 2026',
      time: '12:45 AM – 2:45 AM',
      duration: '2 hours',
      format: '5-a-side · 2 teams · 10 players',
      rules: 'Winner stays on · draws: penalties',
      payment: '₦10,000 per player (monthly pass)',
    });
  });

  it('marks a session that runs past midnight', () => {
    const late = sessionEmailDetails({
      ...sanSiro,
      startTime: new Date('2026-10-31T22:00:00.000Z'), // 11 PM Lagos
      stopTime: new Date('2026-11-01T00:30:00.000Z'), // 1:30 AM Lagos
      timeDuration: 150,
    });
    expect(late.time).toBe('11:00 PM – 1:30 AM (next day)');
    expect(late.duration).toBe('2 hours 30 mins');
  });

  it('describes pool, hourly and free pricing', () => {
    expect(
      sessionEmailDetails({ ...sanSiro, paymentMode: SESSION_PAYMENT_MODE.POOL, paymentTarget: 2000000 }).payment,
    ).toBe('₦20,000 for the pitch, split between the players');
    expect(sessionEmailDetails({ ...sanSiro, pricingOption: LOCATION_PRICING_OPTION.HOURLY }).payment).toBe(
      '₦10,000 per player',
    );
    expect(sessionEmailDetails({ ...sanSiro, paymentRequired: false }).payment).toBe('Free');
  });

  it('round robin and both-teams-off rules', () => {
    expect(
      sessionEmailDetails({
        ...sanSiro,
        rotationFormat: ROTATION_FORMAT.ROUND_ROBIN,
        winningDecider: WINNING_DECIDER.BOTH_OFF,
      }).rules,
    ).toBe('Round robin · draws: both teams off');
  });

  it('formats kobo as naira', () => {
    expect(naira(1000000)).toBe('₦10,000');
    expect(naira(1182467)).toBe('₦11,824.67');
  });
});

describe('session-created email', () => {
  const render = LOCAL_TEMPLATES['session-created'];

  it('shows every detail and puts the date and time in the subject', () => {
    const mail = render({ firstName: 'Grey', locationName: 'Camp nou', captainName: 'chidi', ...sessionEmailDetails(sanSiro) });

    expect(mail.subject).toBe('New session at Camp nou: Saturday 31 October 2026, 12:45 AM – 2:45 AM');
    for (const value of ['Camp nou', 'Saturday 31 October 2026', '12:45 AM – 2:45 AM', '2 hours', '5-a-side', 'chidi', '₦10,000 per player']) {
      expect(mail.html).toContain(value);
      expect(mail.text).toContain(value);
    }
  });

  it('escapes names so a nickname cannot inject HTML', () => {
    const mail = render({ firstName: 'Grey', locationName: 'Camp nou', captainName: '<b>x</b>' });
    expect(mail.html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(mail.html).not.toContain('<b>x</b>');
  });

  it('still reads well without session details', () => {
    const mail = render({ firstName: 'Grey', locationName: 'Camp nou' });
    expect(mail.subject).toBe('New session booked at Camp nou');
    expect(mail.html).not.toContain('Date');
  });
});

describe('session-rescheduled email', () => {
  const render = LOCAL_TEMPLATES['session-rescheduled'];

  it('shows the old time next to the new one, and who moved it', () => {
    const mail = render({
      firstName: 'Grey',
      locationName: 'Camp nou',
      captainName: 'chidi',
      rescheduledBy: 'chidi',
      previousDate: 'Friday 30 October 2026',
      previousTime: '6:00 PM – 8:00 PM',
      ...sessionEmailDetails(sanSiro),
    });

    expect(mail.subject).toBe('Session moved at Camp nou: now Saturday 31 October 2026, 12:45 AM – 2:45 AM');
    expect(mail.text).toContain('Hi Grey, a session at Camp nou has been moved by chidi to Saturday 31 October 2026.');
    expect(mail.text).toContain('Was: Friday 30 October 2026, 6:00 PM – 8:00 PM');
    expect(mail.text).toContain('Time: 12:45 AM – 2:45 AM');
    expect(mail.html).toContain('Session rescheduled');
    expect(mail.html).toContain('Friday 30 October 2026, 6:00 PM – 8:00 PM');
  });

  it('leaves out "Was" when the session had no time before', () => {
    const mail = render({ firstName: 'Grey', locationName: 'Camp nou', ...sessionEmailDetails(sanSiro) });
    expect(mail.text).not.toContain('Was:');
  });
});
