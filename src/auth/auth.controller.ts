import { Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { LocalGuard } from './guards/local.guard';
import { AuthService } from './auth.service';
import { User, CurrentUser } from '@app/common';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(LocalGuard)
  @Post('user/login')
  async login(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    return await this.authService.login(user, response);
  }

  @Get('user/logout')
  async logout(@Res() response: Response): Promise<any> {
    return this.authService.logout(response);
  }
}
