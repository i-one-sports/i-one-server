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
  SendEmailVerifyDto,
  UpdateUserDto,
  VerifyEmailOtpDto,
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
import { StatsService } from 'src/stats/stats.service';
import { CacheService } from 'src/cache/cache.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  private readonly EMAIL_VERIFY_TTL = 10 * 60; // 10 minutes

  constructor(
    private readonly usersRepository: UserRepository,
    private readonly mailService: MailerService,
    private readonly statsService: StatsService,
    private readonly cacheService: CacheService,
  ) {}
  async registerUser({
    firstName,
    lastName,
    nickname,
    email,
    password,
    phoneNumber,
    avatar,
    address,
    position,
    location,
    isOwner,
    height,
    dateOfBirth,
  }: registerUserRequest) {
    this.logger.log(`Registering user: ${email} (${nickname})`);
    const formattedPhone = internationalisePhoneNumber(phoneNumber);
    const formattedEmail = email.toLowerCase()
    await this.checkExistingUser(phoneNumber, email, nickname);

    const payload: Partial<User> = {
      email: formattedEmail,
      phoneNumber: formattedPhone,
      password: await bcrypt.hash(password, 10),
      address,
      lastName,
      firstName,
      location,
      position,
      isOwner,
      nickname,
      height,
      dateOfBirth,
      avatar
    };
    try {
      const user = await this.usersRepository.create(payload);
      await this.statsService.initializeStat(user._id.toString());
      // Send welcome email asynchronously to avoid blocking the response
      this.sendWelcomeEmail(user).catch(err => console.error('Welcome email failed:', err));
      this.logger.log(`User registered successfully: ${user._id} (${email})`);
      return user;
    } catch (error) {
      this.logger.error(`User registration failed for ${email}: ${error.message}`);
      throw new CustomHttpException(
        `can not process request. Try again later ${JSON.stringify(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async sendWelcomeEmail(user: User) {
    const subject = 'Welcome to I-One App!';
    const body = `Hello ${user.firstName},\n\nWelcome to I-One App! We're excited to have you on board.\n\nBest regards,\nThe I-One Team`;
    await this.mailService.sendMail(user.email, subject, body);
  }

  async getUser(id: string) {
    return await this.usersRepository.findOne({
      _id: id,
    });
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

  async sendEmailVerification({ email }: SendEmailVerifyDto) {
    const user = await this.usersRepository.findOne({ email: email.toLowerCase() });

    if (!user) {
      throw new CustomHttpException('User with email does not exist', HttpStatus.NOT_FOUND);
    }

    if (user.emailVerified) {
      throw new CustomHttpException('Email is already verified', HttpStatus.CONFLICT);
    }

    const otp = crypto.randomInt(100000, 999999);
    const key = `email_verify:${email.toLowerCase()}`;

    await this.cacheService.set(key, otp.toString(), this.EMAIL_VERIFY_TTL);

    this.mailService
      .sendMail(
        user.email,
        'Verify your email',
        `Your email verification OTP is ${otp}. It is valid for 10 minutes.`,
      )
      .catch((err) => this.logger.error(`Email verification mail failed: ${err.message}`));

    return { message: 'Verification OTP sent to your email' };
  }

  async confirmEmailVerification({ email, otp }: VerifyEmailOtpDto) {
    const key = `email_verify:${email.toLowerCase()}`;
    const stored = await this.cacheService.get(key);

    if (!stored || parseInt(stored, 10) !== otp) {
      throw new CustomHttpException('Invalid or expired OTP', HttpStatus.UNAUTHORIZED);
    }

    await this.usersRepository.findOneAndUpdate(
      { email: email.toLowerCase() },
      { emailVerified: true },
    );

    await this.cacheService.delete(key);

    return { message: 'Email verified successfully' };
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

  public async updateProfile(id: string, data: UpdateUserDto): Promise<User> {
    const user = await this.usersRepository.findOne({ _id: id });

    if (!user) {
      throw new CustomHttpException('User not found', HttpStatus.NOT_FOUND);
    }

    if (data.phoneNumber) {
      data.phoneNumber = internationalisePhoneNumber(data.phoneNumber);
    }

    if (data.nickname && data.nickname !== user.nickname) {
      const existingNickname = await this.usersRepository.findOne({
        nickname: data.nickname,
      });
      if (existingNickname) {
        throw new CustomHttpException(
          'Nickname already exists',
          HttpStatus.CONFLICT,
        );
      }
    }

    const updatedUser = await this.usersRepository.findOneAndUpdate(
      { _id: id },
      data,
    );

    updatedUser.password = '';
    return updatedUser;
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
