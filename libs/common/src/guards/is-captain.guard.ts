import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { SessionsService } from 'src/sessions/sessions.service';

@Injectable()
export class IsCaptainGuard implements CanActivate {
  constructor(
    @Inject('SessionsService')
    private readonly sessionsService: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const sessionId = request.params.sessionId || request.body.sessionId;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (!sessionId) {
      throw new ForbiddenException('Session ID not provided');
    }

    const isCaptain = await this.sessionsService.isCaptain(
      user._id.toString(),
      sessionId,
    );

    if (!isCaptain) {
      throw new ForbiddenException(
        'You are not the captain of this session, access denied!',
      );
    }

    return true;
  }
}
