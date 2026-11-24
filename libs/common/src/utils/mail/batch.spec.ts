import { ConfigService } from '@nestjs/config';
import { MailgunProvider } from './mailgun.provider';
import { BrevoProvider } from './brevo.provider';

const config = (values: Record<string, string>) => ({ get: (key: string) => values[key] }) as unknown as ConfigService;

const recipients = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    to: `player${i}@example.com`,
    variables: { firstName: `P${i}`, pitchName: 'Lekki Turf', startTimeLabel: '5:00 PM', minutesLeft: '3' },
  }));

describe('MailgunProvider.sendBatch', () => {
  const provider = new MailgunProvider(config({ MAILGUN_DOMAIN: 'mg.i-one.example', MAILGUN_FROM: 'i-One <no-reply@i-one.example>' }));
  let post: jest.SpyInstance;

  beforeEach(() => {
    post = jest.spyOn(provider['client'], 'post').mockResolvedValue({ data: {} });
  });
  afterEach(() => post.mockRestore());

  const formOf = (call: number) => post.mock.calls[call][1] as URLSearchParams;

  it('sends one request with everyone in `to` and each person’s own values', async () => {
    await expect(provider.sendBatch({ template: 'session-at-risk', recipients: recipients(3) })).resolves.toEqual({ sent: 3, failed: 0 });

    expect(post).toHaveBeenCalledTimes(1);
    const form = formOf(0);
    expect(form.get('to')).toBe('player0@example.com,player1@example.com,player2@example.com');
    const vars = JSON.parse(form.get('recipient-variables') as string);
    expect(vars['player1@example.com']).toMatchObject({ firstName: 'P1', firstName_html: 'P1', pitchName: 'Lekki Turf' });
    // Rendered once with placeholders; Mailgun fills them in per person.
    expect(form.get('subject')).toContain('%recipient.pitchName%');
    expect(form.get('html')).toContain('%recipient.firstName_html%');
    expect(form.get('text')).toContain('%recipient.firstName%');
  });

  it('splits at 1,000 recipients per request', async () => {
    await expect(provider.sendBatch({ template: 'session-at-risk', recipients: recipients(2_500) })).resolves.toEqual({ sent: 2_500, failed: 0 });
    expect(post).toHaveBeenCalledTimes(3);
    expect((formOf(2).get('to') as string).split(',')).toHaveLength(500);
  });

  it('HTML gets escaped values, so a name can’t inject markup', async () => {
    await provider.sendBatch({
      template: 'account-deleted',
      recipients: [{ to: 'x@example.com', variables: { firstName: '<b>Ada</b>' } }],
    });
    const vars = JSON.parse(formOf(0).get('recipient-variables') as string);
    expect(vars['x@example.com']).toEqual({ firstName: '<b>Ada</b>', firstName_html: '&lt;b&gt;Ada&lt;/b&gt;' });
  });

  it('a failed request is counted, never thrown', async () => {
    post.mockRejectedValueOnce(new Error('503'));
    await expect(provider.sendBatch({ template: 'session-at-risk', recipients: recipients(2) })).resolves.toEqual({ sent: 0, failed: 2 });
  });

  it('an unknown template sends nothing', async () => {
    await expect(provider.sendBatch({ template: 'nope', recipients: recipients(2) })).resolves.toEqual({ sent: 0, failed: 2 });
    expect(post).not.toHaveBeenCalled();
  });
});

describe('BrevoProvider.sendBatch', () => {
  it('renders each email with real values and never sends more than 5 at once', async () => {
    const provider = new BrevoProvider(config({ MAIL_FROM: 'no-reply@i-one.example', MAIL_HOST: 'smtp.example' }));
    let inFlight = 0;
    let peak = 0;
    const sent: Array<{ to: string; html: string; subject: string }> = [];
    jest.spyOn(provider['transporter'], 'sendMail').mockImplementation((async (mail: { to: string; html: string; subject: string }) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      sent.push(mail);
      return {};
    }) as never);

    await expect(provider.sendBatch({ template: 'session-at-risk', recipients: recipients(12) })).resolves.toEqual({ sent: 12, failed: 0 });

    expect(peak).toBeLessThanOrEqual(5);
    const p3 = sent.find((m) => m.to === 'player3@example.com');
    expect(p3?.html).toContain('P3');
    expect(p3?.subject).toContain('Lekki Turf');
  });
});
