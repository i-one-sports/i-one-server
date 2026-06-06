import { AuthGuard } from '@nestjs/passport';
import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  OWNER_ONBOARDING_STATUS,
  User,
  USER_ROLE,
} from '@app/common';

type AuthenticatedRequest = {
  originalUrl?: string;
  user?: User;
};

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const canActivate = await super.canActivate(context);
    if (!canActivate) return false;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

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

  private isAllowedVerificationRoute(originalUrl?: string) {
    const path = originalUrl?.split('?')[0] ?? '';
    return path.endsWith('/verification/submit') || path.endsWith('/verification/me');
  }
}
