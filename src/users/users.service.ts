import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { UserRepository } from './users.repository';
import {
  ForgotPasswordDto,
  registerUserRequest,
  ResetPasswordDto,
  VerifyOtpDto,
} from './dto/user.dto';
import {
  CustomHttpException,
  internationalisePhoneNumber,
  MailerService,
  User,
} from '@app/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly usersRepository: UserRepository,
    private readonly mailService: MailerService,
  ) {}
  async registerUser({
    firstName,
    lastName,
    nickname,
    email,
    password,
    phoneNumber,
    address,
    position,
    location,
    isOwner
  }: registerUserRequest) {
    const formattedPhone = internationalisePhoneNumber(phoneNumber);
    await this.checkExistingUser(phoneNumber, email, nickname);

    const payload: Partial<User> = {
      email,
      phoneNumber: formattedPhone,
      password: await bcrypt.hash(password, 10),
      address,
      lastName,
      firstName,
      location,
      position,
      isOwner,
      nickname
    };
    try {
      const user = await this.usersRepository.create(payload);
      return user;
    } catch (error) {
      throw new CustomHttpException(
        `can not process request. Try again later ${JSON.stringify(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getUser(id: string) {
    return await this.usersRepository.findOne({
      _id: id
    })
  }

  async forgetPassword(data: ForgotPasswordDto) {
    const user: User = await this.usersRepository.findOne({
      email: data.email,
    });

    if (user == null) {
      throw new CustomHttpException(
        'User with email does not exist',
        HttpStatus.NOT_FOUND,
      );
    }

    const otp = crypto.randomInt(100000, 999999);

    await this.usersRepository.findOneAndUpdate(
      {
        _id: user._id.toString(),
      },
      {
        otp,
        otpVerified: false,
        otpExpiration: new Date(Date.now() + 15 * 60 * 1000),
      },
    );

    await this.mailService.sendMail(
      user.email,
      'PASSWORD RESET OTP',
      `Your OTP for password reset is ${otp}. It is valid for 15 mins`,
    );
  }

  async verifyOtp(data: VerifyOtpDto) {
    const user: User = await this.usersRepository.findOne({
      email: data.email,
    });

    if (user == null) {
      throw new CustomHttpException(
        'User with email does not exist',
        HttpStatus.NOT_FOUND,
      );
    }

    if (user.otp !== data.otp || user.otpExpiration < new Date()) {
      throw new CustomHttpException(
        'Invalid or expired OTP',
        HttpStatus.UNAUTHORIZED,
      );
    }

    await this.usersRepository.findOneAndUpdate(
      {
        _id: user._id.toString(),
      },
      { otpVerified: true },
    );

    return { message: 'OTP verified, proceed to reset password' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user: User = await this.usersRepository.findOne({ email: dto.email });
    if (user == null)
      throw new CustomHttpException('User not found', HttpStatus.NOT_FOUND);

    if (!user.otpVerified)
      throw new CustomHttpException(
        'OTP not verified',
        HttpStatus.UNAUTHORIZED,
      );

    if (dto.newPassword !== dto.confirmPassword) {
      throw new CustomHttpException(
        'Passwords do not match',
        HttpStatus.CONFLICT,
      );
    }

    await this.usersRepository.findOneAndUpdate(
      {
        _id: user._id.toString(),
      },
      {
        otp: null,
        otpVerified: false,
        otpExpiration: null,
        password: await bcrypt.hash(dto.newPassword, 10),
      },
    );

    return { message: 'Password reset successful' };
  }

  private async checkExistingUser(
    phoneNumber: string,
    email: string,
    nickname: string,
  ): Promise<User> {
    const _phone: User | null = await this.usersRepository.findOne({
      phoneNumber,
    });

    const _email: User | null = await this.usersRepository.findOne({ email });

    const _nickname: User | null = await this.usersRepository.findOne({
      nickname,
    });

    if (_phone !== null) {
      throw new CustomHttpException(
        'Phone Number is  already registered.',
        HttpStatus.CONFLICT,
      );
    }

    if (_email !== null) {
      throw new CustomHttpException(
        'Email is  already registered.',
        HttpStatus.CONFLICT,
      );
    }

    if (_nickname !== null) {
      throw new CustomHttpException(
        'Nickname already exists',
        HttpStatus.CONFLICT,
      );
    }

    return _phone as unknown as User;
  }

  public async getProfile(id: string): Promise<User> {
    try {
      const profile = await this.usersRepository.findOne({ _id: id });

      if (profile === null) {
        throw new NotFoundException('No profile with the given Id');
      }

      profile.password = '';
      return profile;
    } catch (error) {
      this.logger.error({
        message: `Failed to fetch user profile ${id} `,
        error,
      });

      if (error instanceof NotFoundException) {
        throw new CustomHttpException(
          'No user found with the given ID',
          HttpStatus.UNAUTHORIZED,
        );
      } else {
        throw new CustomHttpException(error, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  public async validateUser(email: string, password: string): Promise<User> {
    const user: User = await this.usersRepository.findOne({
      email: email.toLowerCase(),
    });
    if (user === null) {
      throw new CustomHttpException(
        'User with email is not found',
        HttpStatus.NOT_FOUND,
      );
    }
    const isCorrectPassword = await bcrypt.compare(password, user.password);
    if (!isCorrectPassword) {
      throw new CustomHttpException(
        'Incorrect password',
        HttpStatus.UNAUTHORIZED,
      );
    }
    user.password = '';
    return user as any;
  }
}
