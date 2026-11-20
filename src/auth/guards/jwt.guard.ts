import { AuthGuard } from '@nestjs/passport';
import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  OWNER_ONBOARDING_STATUS,
  User,
  USER_ROLE,
} from '@app/common';
import { GUEST_READABLE_KEY } from '../decorators/guest-readable.decorator';

type AuthenticatedRequest = {
  method?: string;
  originalUrl?: string;
  user?: User;
};

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const guestReadable = this.reflector.getAllAndOverride<boolean>(GUEST_READABLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (guestReadable) {
      // Read-only route open to guests: authenticate if we can, otherwise
      // carry on as a guest (request.user stays unset). The email/KYC gates
      // below are for actions, so they don't apply to these reads.
      try {
        await super.canActivate(context);
      } catch (error: unknown) {
        if (!(error instanceof UnauthorizedException)) throw error;
      }
      return true;
    }

    const canActivate = await super.canActivate(context);
    if (!canActivate) return false;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (this.shouldBlockUnverifiedEmail(user, request.originalUrl)) {
      throw new ForbiddenException({
        message: 'Email verification is required before continuing',
        code: 'EMAIL_VERIFICATION_REQUIRED',
        nextStep: 'VERIFY_EMAIL',
      });
    }

    if (!this.shouldBlockPendingOwner(user, request.originalUrl)) {
      return true;
    }

    throw new ForbiddenException({
      message: 'Verification documents are required before continuing',
      code: 'OWNER_VERIFICATION_REQUIRED',
      nextStep: 'SUBMIT_VERIFICATION',
    });
  }

  private shouldBlockPendingOwner(user?: User, originalUrl?: string) {
    if (!user || user.role !== USER_ROLE.ADMIN) return false;
    if (this.isAllowedVerificationRoute(originalUrl)) return false;

    return [
      OWNER_ONBOARDING_STATUS.PENDING_VERIFICATION,
      OWNER_ONBOARDING_STATUS.REJECTED,
    ].includes(user.ownerOnboardingStatus);
  }

  private shouldBlockUnverifiedEmail(user?: User, originalUrl?: string) {
    if (!user || user.role === USER_ROLE.SUPER_ADMIN) return false;
    if (user.emailVerified) return false;
    if (this.isAllowedEmailVerificationRoute(originalUrl)) return false;

    return true;
  }

  private isAllowedVerificationRoute(originalUrl?: string) {
    const path = originalUrl?.split('?')[0] ?? '';
    return (
      path.endsWith('/verification/submit') ||
      path.endsWith('/verification/me') ||
      this.isAllowedAccountStateRoute(path)
    );
  }

  private isAllowedEmailVerificationRoute(originalUrl?: string) {
    const path = originalUrl?.split('?')[0] ?? '';
    return this.isAllowedAccountStateRoute(path);
  }

  private isAllowedAccountStateRoute(path: string) {
    return (
      path.endsWith('/user') ||
      path.endsWith('/user/profile') ||
      // Account deletion must work before email/KYC verification: someone
      // who signs up and changes their mind can still delete (App Store 5.1.1(v)).
      path.endsWith('/user/account') ||
      path.endsWith('/user/verify-email/send') ||
      path.endsWith('/user/verify-email/confirm') ||
      path.endsWith('/auth/user/logout')
    );
  }
}
