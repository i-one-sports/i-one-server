import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class IsOwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    let user: any;

    if (context.getType() === 'http') {
      user = context.switchToHttp().getRequest()?.user;
    } else if (context.getType() === 'rpc') {
      user = context.switchToRpc().getData()?.user;
    } else {
      // websocket or other types
      user = context.switchToWs()?.getClient()?.user;
    }

    if (!user || user?.isOwner !== true) {
      throw new ForbiddenException('You must be an owner to access this resource');
    }

    return true;
  }
}
