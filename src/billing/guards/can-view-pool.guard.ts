import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SessionPaymentService } from '../services/session-payment.service';

// Session members, the pitch owner, or super-admin. Runs as a guard (not
// inside the handler) so a stranger gets a real 403/404 instead of an SSE
// stream that opens and then emits an error event.
@Injectable()
export class CanViewPoolGuard implements CanActivate {
  constructor(private readonly sessionPaymentService: SessionPaymentService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    await this.sessionPaymentService.assertCanViewPool(request.params.sessionId, request.user);
    return true;
  }
}
