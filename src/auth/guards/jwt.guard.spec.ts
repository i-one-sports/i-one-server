import { OWNER_ONBOARDING_STATUS, USER_ROLE } from '@app/common';
import { JwtAuthGuard } from './jwt.guard';

describe('JwtAuthGuard route allowlists', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard();
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
});
