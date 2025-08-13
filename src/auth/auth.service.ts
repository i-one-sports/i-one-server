import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';

import { User, TokenPayload } from '@app/common';

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async login(user: User, response: Response): Promise<void> {
    console.log(user);
    // const payload: TokenPayload = {
    //   userId: user._id as any,
    // };

    const expires = new Date(
      Date.now() + Number(this.configService.get('USER_JWT_EXPIRATION')) * 1000,
    );
    const token = this.jwtService.sign(user);

    response.cookie('Authentication', token, {
      httpOnly: true,
      expires,
      sameSite: 'none',
      secure: true,
    });

    response.json({
      message: "Login Successful",
      user: user
    })
  }

  logout(response: Response): void {
    response.cookie('Authentication', '', {
      httpOnly: true,
      expires: new Date(),
    });

    response.send();
  }
}
