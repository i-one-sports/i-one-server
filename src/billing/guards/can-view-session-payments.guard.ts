import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SessionPaymentService } from '../services/session-payment.service';

// Session members, the pitch owner, or super-admin — anyone else gets a 403
// instead of seeing who paid what on a session they're not part of.
@Injectable()
export class CanViewSessionPaymentsGuard implements CanActivate {
  constructor(private readonly sessionPaymentService: SessionPaymentService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    await this.sessionPaymentService.assertCanViewSessionPayments(request.params.sessionId, request.user);
    return true;
  }
}
