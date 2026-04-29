import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { Response } from 'express';
import { UsersService } from './users.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  PromoteUserDto,
  registerUserRequest,
  ResetPasswordDto,
  SendEmailVerifyDto,
  UpdateUserDto,
  VerifyEmailOtpDto,
  VerifyOtpDto,
} from './dto/user.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { CurrentUser, Roles, RolesGuard, UploadType, User, USER_ROLE } from '@app/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { AwsService } from '@app/common/providers/aws.service';

@Controller('user')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private readonly awsService: AwsService,
  ) {}

  @Post('register')
  async register(@Body() request: registerUserRequest) {
    return this.usersService.registerUser(request);
  }

  @Post('verify-email/send')
  async sendEmailVerification(@Body() data: SendEmailVerifyDto) {
    return this.usersService.sendEmailVerification(data);
  }

  @Post('verify-email/confirm')
  async confirmEmailVerification(@Body() data: VerifyEmailOtpDto) {
    return this.usersService.confirmEmailVerification(data);
  }

  @Post('forget-password')
  async forgetPassword(@Body() data: ForgotPasswordDto) {
    return this.usersService.forgetPassword(data);
  }

  @Post('verify-otp')
  async verifyOtp(@Body() data: VerifyOtpDto) {
    return this.usersService.verifyOtp(data);
  }

  @Put('reset-password')
  async resetPassword(@Body() data: ResetPasswordDto) {
    return this.usersService.resetPassword(data);
  }

  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
    }),
  )
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
  ) {
    const avatarUrl = await this.awsService.upload(
      file,
      UploadType.USER_AVATAR,
    );

    return { avatar: avatarUrl };
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getUser(
    @CurrentUser() user: User
  ) {
    return this.usersService.getUser(user._id.toString())
  }
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@CurrentUser() user: User) {
    return this.usersService.getProfile(user._id.toString());
  }

  @UseGuards(JwtAuthGuard)
  @Patch('change-password')
  async changePassword(
    @CurrentUser() user: User,
    @Body() data: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(user._id.toString(), data);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  async updateProfile(
    @CurrentUser() user: User,
    @Body() data: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(user._id.toString(), data);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.SUPER_ADMIN)
  @Patch('promote/:userId')
  async promoteUser(
    @Param('userId') userId: string,
    @Body() data: PromoteUserDto,
  ) {
    return this.usersService.promoteUser(userId, data.role);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('account')
  async deleteAccount(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.usersService.deleteAccount(user._id.toString());
    res.clearCookie('Authentication');
    return result;
  }
}
