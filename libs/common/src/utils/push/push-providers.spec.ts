import { Logger } from '@nestjs/common';
import { FcmPushProvider } from './fcm.provider';
import { NoopPushProvider } from './noop.provider';

// FcmPushProvider without touching Firebase: only dispatch() is replaced.
const fcmWith = (dispatch: jest.Mock) => {
  const provider: any = Object.create(FcmPushProvider.prototype);
  provider.logger = new Logger('test');
  provider.dispatch = dispatch;
  return provider as FcmPushProvider;
};
const msg = { deviceToken: 'tok_123456789', title: 't', body: 'b' };
const fcmError = (code: string) => Object.assign(new Error(`fcm says ${code}`), { code });

describe('push providers', () => {
  beforeAll(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));

  it('returns the FCM message id on success', async () => {
    const provider = fcmWith(jest.fn().mockResolvedValue('projects/x/messages/42'));
    await expect(provider.deliver(msg)).resolves.toEqual({ ok: true, messageId: 'projects/x/messages/42' });
  });

  it.each([
    ['messaging/registration-token-not-registered', 'INVALID_TOKEN'],
    ['messaging/invalid-registration-token', 'INVALID_TOKEN'],
    ['messaging/unavailable', 'RETRYABLE'],
    ['messaging/internal-error', 'RETRYABLE'],
    ['messaging/message-rate-exceeded', 'RETRYABLE'],
    ['app/network-error', 'RETRYABLE'],
    ['messaging/invalid-argument', 'PERMANENT'],
    ['messaging/mismatched-credential', 'PERMANENT'],
    ['messaging/third-party-auth-error', 'PERMANENT'],
    ['something/unknown', 'PERMANENT'],
  ])('classifies %s as %s', async (code, reason) => {
    const provider = fcmWith(jest.fn().mockRejectedValue(fcmError(code)));
    await expect(provider.deliver(msg)).resolves.toMatchObject({ ok: false, reason, code });
  });

  it('still clears dead tokens', async () => {
    const provider = fcmWith(jest.fn().mockRejectedValue(fcmError('messaging/registration-token-not-registered')));
    provider.onInvalidToken = jest.fn();
    await provider.deliver(msg);
    expect(provider.onInvalidToken).toHaveBeenCalledWith('tok_123456789');
  });

  it('reports NO_DEVICE for an empty token', async () => {
    const dispatch = jest.fn();
    await expect(fcmWith(dispatch).deliver({ ...msg, deviceToken: '' })).resolves.toEqual({ ok: false, reason: 'NO_DEVICE' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('send() keeps its fire-and-forget behaviour: resolves even when FCM fails', async () => {
    const provider = fcmWith(jest.fn().mockRejectedValue(fcmError('messaging/internal-error')));
    await expect(provider.send(msg)).resolves.toBeUndefined();
  });

  it('the no-op provider reports PUSH_DISABLED instead of pretending to succeed', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await expect(new NoopPushProvider().deliver(msg)).resolves.toMatchObject({ ok: false, reason: 'PUSH_DISABLED' });
  });
});
