import { OWNER_ONBOARDING_STATUS, User, USER_ROLE } from '@app/common';
import { JwtAuthGuard } from './jwt.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GUEST_READABLE_KEY } from '../decorators/guest-readable.decorator';

describe('JwtAuthGuard route allowlists', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard(new Reflector());
  });

  const shouldBlockPendingOwner = (originalUrl: string) =>
    (guard as any).shouldBlockPendingOwner(
      {
        role: USER_ROLE.ADMIN,
        emailVerified: true,
        ownerOnboardingStatus: OWNER_ONBOARDING_STATUS.PENDING_VERIFICATION,
      },
      originalUrl,
    );

  const shouldBlockUnverifiedEmail = (originalUrl: string) =>
    (guard as any).shouldBlockUnverifiedEmail(
      {
        role: USER_ROLE.USER,
        emailVerified: false,
      },
      originalUrl,
    );

  it('allows pending owners to read profile state after email verification', () => {
    expect(shouldBlockPendingOwner('/i-one/user/profile')).toBe(false);
    expect(shouldBlockPendingOwner('/i-one/user')).toBe(false);
  });

  it('still blocks pending owners from protected app actions', () => {
    expect(shouldBlockPendingOwner('/i-one/sessions/start')).toBe(true);
  });

  it('allows unverified users to read profile state but blocks protected actions', () => {
    expect(shouldBlockUnverifiedEmail('/i-one/user/profile')).toBe(false);
    expect(shouldBlockUnverifiedEmail('/i-one/sessions/start')).toBe(true);
  });

  describe('guest-readable routes', () => {
    const contextFor = (handler: () => void) =>
      ({
        getHandler: () => handler,
        getClass: () => class {},
        switchToHttp: () => ({ getRequest: () => ({}) }),
      }) as unknown as ExecutionContext;

    const guestRoute = () => undefined;
    Reflect.defineMetadata(GUEST_READABLE_KEY, true, guestRoute);
    const normalRoute = () => undefined;

    it('lets a request with no token through as a guest', async () => {
      jest.spyOn(AuthGuard('jwt').prototype, 'canActivate').mockRejectedValueOnce(new UnauthorizedException());
      await expect(guard.canActivate(contextFor(guestRoute))).resolves.toBe(true);
    });

    it('still rejects a request with no token on every other route', async () => {
      jest.spyOn(AuthGuard('jwt').prototype, 'canActivate').mockRejectedValueOnce(new UnauthorizedException());
      await expect(guard.canActivate(contextFor(normalRoute))).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('does not hide real failures (e.g. the database) as guest access', async () => {
      jest.spyOn(AuthGuard('jwt').prototype, 'canActivate').mockRejectedValueOnce(new Error('db down'));
      await expect(guard.canActivate(contextFor(guestRoute))).rejects.toThrow('db down');
    });
  });

  it('lets unverified users and pending owners delete their account', () => {
    const unverified = { role: USER_ROLE.USER, emailVerified: false } as User;
    const pendingOwner = {
      role: USER_ROLE.ADMIN,
      emailVerified: true,
      ownerOnboardingStatus: OWNER_ONBOARDING_STATUS.PENDING_VERIFICATION,
    } as User;

    expect(guard['shouldBlockUnverifiedEmail'](unverified, '/i-one/user/account')).toBe(false);
    expect(guard['shouldBlockPendingOwner'](pendingOwner, '/i-one/user/account')).toBe(false);
  });
});
