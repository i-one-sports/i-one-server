import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { User } from '@app/common';
import { UsersService } from '../../users/users.service';

@Injectable()
export class UserLocalStrategy extends PassportStrategy(Strategy, 'local') {
  constructor(private readonly usersService: UsersService) {
    super({ usernameField: 'email' });
  }
  async validate(email: string, password: string): Promise<User> {
    try {
      return await this.usersService.validateUser(
        email.toLowerCase(),
        password,
      );
    } catch (error) {
      throw new UnauthorizedException(error);
    }
  }
}
