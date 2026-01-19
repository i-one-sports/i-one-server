import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { User } from '@app/common';

export function getOwnerByContext(context: ExecutionContext): User | undefined {
  if (context.getType() === 'http') {
    return context.switchToHttp().getRequest()?.user as User;
  }
  return context.switchToRpc().getData()?.user as User;
}
export const IsOwner = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const user = getOwnerByContext(ctx);

  if (user?.isOwner === true) {
    return user;
  }
  if (user === undefined || !user?.isOwner) {
    throw new ForbiddenException(
      'You must be an owner to access this resource',
    );
  }
  return user;
});
