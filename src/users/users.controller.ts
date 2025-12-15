import { Body, Controller, Get, Patch, Post, Put, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { UsersService } from './users.service';
import {
  ForgotPasswordDto,
  registerUserRequest,
  ResetPasswordDto,
  UpdateUserDto,
  VerifyOtpDto,
} from './dto/user.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { CurrentUser, UploadType, User } from '@app/common';
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
  @Patch('profile')
  async updateProfile(
    @CurrentUser() user: User,
    @Body() data: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(user._id.toString(), data);
  }
}
