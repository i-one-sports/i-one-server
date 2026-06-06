import {
  BadRequestException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { UserRepository } from './users.repository';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  RegisterOwnerRequest,
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
  LOCATION_PRICING_OPTION,
  LOCATION_STATUS,
  LOCATION_TIER,
  Location,
  MailerService,
  OWNER_ONBOARDING_STATUS,
  Team,
  Tournament,
  User,
  USER_ROLE,
} from '@app/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { StatsService } from 'src/stats/stats.service';
import { CacheService } from 'src/cache/cache.service';
import { LocationRepository } from 'src/locations/locations.repository';
import { BankAccountRepository } from 'src/billing/repositories/bank-account.repository';
import { PaystackService } from '@app/common/providers/paystack.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  private readonly EMAIL_VERIFY_TTL = 10 * 60; // 10 minutes

  constructor(
    private readonly usersRepository: UserRepository,
    private readonly mailService: MailerService,
    private readonly statsService: StatsService,
    private readonly cacheService: CacheService,
    @InjectModel(Team.name) private readonly teamModel: Model<Team>,
    @InjectModel(Tournament.name) private readonly tournamentModel: Model<Tournament>,
    private readonly locationRepository: LocationRepository,
    private readonly bankAccountRepository: BankAccountRepository,
    private readonly paystackService: PaystackService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async registerOwner(request: RegisterOwnerRequest) {
    const { user: userDto, location: locationDto, payout } = request;
    const formattedEmail = userDto.email.toLowerCase();
    const formattedPhone = internationalisePhoneNumber(userDto.phoneNumber);
    const nickname = userDto.nickname || this.buildOwnerNickname(formattedEmail);

    this.logger.log(`Registering owner: ${formattedEmail}`);

    await this.checkExistingOwnerUser(formattedPhone, formattedEmail, nickname);
    await this.ensureLocationIsAvailable(locationDto.location.coordinates);
    this.validateOwnerLocationPricing(locationDto);

    const accountName = await this.resolvePayoutAccount(
      payout.accountNumber,
      payout.bankCode,
    );

    const hashedPassword = await bcrypt.hash(userDto.password, 10);

    const { createdUser, createdLocation, createdBankAccount } =
      await this.connection.transaction(async (session) => {
        const user = await this.usersRepository.create(
          {
            email: formattedEmail,
            phoneNumber: formattedPhone,
            password: hashedPassword,
            firstName: userDto.firstName,
            lastName: userDto.lastName,
            address: locationDto.address,
            location: {
              type: 'Point',
              coordinates: locationDto.location.coordinates,
            },
            isOwner: false,
            role: USER_ROLE.ADMIN,
            ownerRole: userDto.role,
            nickname,
            ownerOnboardingStatus: OWNER_ONBOARDING_STATUS.PENDING_VERIFICATION,
            newsletterOptIn: request.newsletterOptIn ?? false,
            termsAcceptedAt: new Date(),
          },
          { session },
        );

        const locationPayload: Partial<Location> = {
          openingHour: locationDto.openingHour,
          closingHour: locationDto.closingHour,
          name: locationDto.name,
          address: locationDto.address,
          tier: locationDto.tier,
          location: {
            type: 'Point',
            coordinates: locationDto.location.coordinates,
          },
          pitchPhoto: locationDto.pitchPhoto,
          pitchMax: locationDto.pitchMax,
          pitchSize: locationDto.pitchSize,
          owner: user._id,
          status: LOCATION_STATUS.PENDING_VERIFICATION,
        };

        if (locationDto.tier === LOCATION_TIER.PAID) {
          locationPayload.pricingOption = locationDto.pricingOption;

          if (locationDto.pricingOption === LOCATION_PRICING_OPTION.HOURLY) {
            locationPayload.paymentPerPersonHourly = locationDto.paymentPerPersonHourly;
          }

          if (locationDto.pricingOption === LOCATION_PRICING_OPTION.MONTHLY) {
            locationPayload.paymentPerPersonMonthly = locationDto.paymentPerPersonMonthly;
          }
        }

        const location = await this.locationRepository.create(locationPayload, {
          session,
        });

        const bankAccount = await this.bankAccountRepository.create(
          {
            userId: user._id,
            accountNumber: payout.accountNumber,
            bankCode: payout.bankCode,
            bankName: payout.bankName,
            accountName,
            isDefault: true,
            status: 'PENDING',
          },
          { session },
        );

        return {
          createdUser: user,
          createdLocation: location,
          createdBankAccount: bankAccount,
        };
      });

    await this.statsService.initializeStat(createdUser._id.toString());
    this.sendWelcomeEmail(createdUser).catch((err) =>
      this.logger.error(`Welcome email failed: ${err.message}`),
    );

    return {
      message: 'Owner registration submitted successfully',
      user: this.toSafeUser(createdUser),
      location: createdLocation,
      payout: createdBankAccount,
    };
  }

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
      isOwner: false,
      nickname,
      height,
      dateOfBirth,
      avatar,
      role: USER_ROLE.USER,
    };
    try {
      const user = await this.usersRepository.create(payload);
      await this.statsService.initializeStat(user._id.toString());
      this.sendWelcomeEmail(user).catch(err => console.error('Welcome email failed:', err));
      this.logger.log(`User registered successfully: ${user._id} (${email})`);
      return user;
    } catch (error: any) {
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

  private buildOwnerNickname(email: string) {
    const prefix = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
    return `${prefix}_${crypto.randomInt(1000, 9999)}`;
  }

  private toSafeUser(user: User): Omit<User, 'password'> {
    const maybeDocument = user as User & { toObject?: () => User };
    const rawUser = typeof maybeDocument.toObject === 'function'
      ? maybeDocument.toObject()
      : user;
    const { password, ...safeUser } = rawUser;
    return safeUser;
  }

  private async checkExistingOwnerUser(
    phoneNumber: string,
    email: string,
    nickname: string,
  ) {
    const existingPhone = await this.usersRepository.findOne({ phoneNumber });
    if (existingPhone) {
      throw new CustomHttpException(
        'Phone Number is  already registered.',
        HttpStatus.CONFLICT,
      );
    }

    const existingEmail = await this.usersRepository.findOne({ email });
    if (existingEmail) {
      throw new CustomHttpException(
        'Email is  already registered.',
        HttpStatus.CONFLICT,
      );
    }

    const existingNickname = await this.usersRepository.findOne({ nickname });
    if (existingNickname) {
      throw new CustomHttpException(
        'Nickname already exists',
        HttpStatus.CONFLICT,
      );
    }
  }

  private async ensureLocationIsAvailable(coordinates: [number, number]) {
    const alreadyExists = await this.locationRepository.findOne({
      'location.coordinates': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates,
          },
          $maxDistance: 1,
        },
      },
    });

    if (alreadyExists) {
      throw new CustomHttpException(
        'Location already registered',
        HttpStatus.CONFLICT,
      );
    }
  }

  private validateOwnerLocationPricing(location: RegisterOwnerRequest['location']) {
    if (location.tier !== LOCATION_TIER.PAID) return;

    if (!location.pricingOption) {
      throw new BadRequestException('pricingOption is required for paid locations');
    }

    if (
      location.pricingOption === LOCATION_PRICING_OPTION.HOURLY &&
      (!location.paymentPerPersonHourly || location.paymentPerPersonHourly <= 0)
    ) {
      throw new BadRequestException(
        'paymentPerPersonHourly must be greater than 0 for hourly pricing',
      );
    }

    if (
      location.pricingOption === LOCATION_PRICING_OPTION.MONTHLY &&
      (!location.paymentPerPersonMonthly || location.paymentPerPersonMonthly <= 0)
    ) {
      throw new BadRequestException(
        'paymentPerPersonMonthly must be greater than 0 for monthly pricing',
      );
    }
  }

  private async resolvePayoutAccount(accountNumber: string, bankCode: string) {
    try {
      const resolved = await this.paystackService.resolveAccount(
        accountNumber,
        bankCode,
      );
      const accountName = resolved?.data?.account_name;

      if (!accountName) {
        throw new Error('Missing account name');
      }

      return accountName;
    } catch (error) {
      this.logger.error(`Failed to resolve owner payout account: ${error.message}`);
      throw new BadRequestException('Unable to verify bank account');
    }
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
    } catch (error: any) {
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

  async promoteUser(userId: string, role: USER_ROLE.ADMIN | USER_ROLE.SUPER_ADMIN) {
    const user = await this.usersRepository.findOne({ _id: userId });
    if (!user) {
      throw new CustomHttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const updated = await this.usersRepository.findOneAndUpdate(
      { _id: userId },
      { role },
    );

    return { message: `User role set to ${role}`, user: updated };
  }

  public async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.usersRepository.findOne({ _id: userId });

    if (!user) {
      throw new CustomHttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const isCorrectPassword = await bcrypt.compare(dto.oldPassword, user.password);
    if (!isCorrectPassword) {
      throw new CustomHttpException('Old password is incorrect', HttpStatus.UNAUTHORIZED);
    }

    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new CustomHttpException('Passwords do not match', HttpStatus.CONFLICT);
    }

    await this.usersRepository.findOneAndUpdate(
      { _id: userId },
      { password: await bcrypt.hash(dto.newPassword, 10) },
    );

    return { message: 'Password changed successfully' };
  }

  public async deleteAccount(userId: string): Promise<{ message: string }> {
    const user = await this.usersRepository.findOne({ _id: userId });
    if (!user) throw new CustomHttpException('User not found', HttpStatus.NOT_FOUND);

    // Blocker 1: active session
    if (user.currentSession) {
      throw new CustomHttpException(
        'You must leave your current session before deleting your account',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Blocker 2: active tournament — find any team the user is in, then check if that team is in a live tournament
    const teams = await this.teamModel
      .find({ players: new Types.ObjectId(userId) }, { _id: 1 })
      .lean();

    if (teams.length > 0) {
      const teamIds = teams.map((t) => t._id);
      const activeTournament = await this.tournamentModel
        .findOne(
          { registeredTeams: { $in: teamIds }, status: { $in: ['registration', 'started'] } },
          { name: 1 },
        )
        .lean();

      if (activeTournament) {
        throw new CustomHttpException(
          `You are part of an active tournament (${(activeTournament as any).name}). Leave or finish it before deleting your account`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    await this.usersRepository.findRaw().deleteOne({ _id: userId });
    return { message: 'Account deleted successfully' };
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
