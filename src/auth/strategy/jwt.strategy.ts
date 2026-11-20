import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { TokenPayload, User } from '@app/common';
import { UsersService } from '../../users/users.service';

@Injectable()
export class UsersJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: any): string => {
          return request?.cookies?.Authentication;
        },
      ]),
      secretOrKey: configService.get<string>('JWT_SECRET') as string,
    });
  }

  async validate({ userId }: TokenPayload): Promise<User> {
    let user: User;
    try {
      user = await this.usersService.getProfile(userId);
    } catch (error: unknown) {
      throw new UnauthorizedException(error instanceof Error ? error.message : 'Unauthorized');
    }
    // A deleted (anonymised) account can't use a cookie it was issued before.
    if (user.deletedAt) throw new UnauthorizedException('This account has been deleted');
    return user;
  }
}
