import { HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import {
  CustomHttpException,
  LOCATION_PRICING_OPTION,
  LOCATION_STATUS,
  LOCATION_TIER,
  OWNER_ONBOARDING_STATUS,
  USER_ROLE,
} from '@app/common';
import { UsersService } from './users.service';
import { RegisterOwnerRequest } from './dto/user.dto';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomInt: jest.fn(),
}));

describe('UsersService', () => {
  let service: UsersService;
  let usersRepository: {
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    create: jest.Mock;
    findRaw: jest.Mock;
  };
  let mailService: {
    sendMail: jest.Mock;
    sendEmailVerificationOtp: jest.Mock;
  };
  let statsService: { initializeStat: jest.Mock };
  let cacheService: { set: jest.Mock; get: jest.Mock; delete: jest.Mock };
  let teamModel: { find: jest.Mock };
  let tournamentModel: { findOne: jest.Mock };
  let locationRepository: { findOne: jest.Mock; create: jest.Mock };
  let bankAccountRepository: { create: jest.Mock };
  let paystackService: { resolveAccount: jest.Mock };
  let connection: { transaction: jest.Mock };

  const userId = new Types.ObjectId();

  const leanResult = (value: any) => ({
    lean: jest.fn().mockResolvedValue(value),
  });

  beforeEach(() => {
    usersRepository = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      create: jest.fn(),
      findRaw: jest.fn(),
    };
    mailService = {
      sendMail: jest.fn().mockResolvedValue(undefined),
      sendEmailVerificationOtp: jest.fn().mockResolvedValue(undefined),
    };
    statsService = { initializeStat: jest.fn().mockResolvedValue(undefined) };
    cacheService = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    teamModel = { find: jest.fn() };
    tournamentModel = { findOne: jest.fn() };
    locationRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
    };
    bankAccountRepository = {
      create: jest.fn(),
    };
    paystackService = {
      resolveAccount: jest.fn(),
    };
    connection = {
      transaction: jest.fn((callback) => callback({})),
    };

    service = new UsersService(
      usersRepository as any,
      mailService as any,
      statsService as any,
      cacheService as any,
      teamModel as any,
      tournamentModel as any,
      locationRepository as never,
      bankAccountRepository as never,
      paystackService as never,
      connection as never,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerUser', () => {
    it('normalizes email, hashes password, creates stats, and returns the user', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      usersRepository.findOne.mockResolvedValue(null);
      usersRepository.create.mockResolvedValue({
        _id: userId,
        email: 'jane@example.com',
        firstName: 'Jane',
      });

      await expect(
        service.registerUser({
          firstName: 'Jane',
          lastName: 'Doe',
          nickname: 'jane',
          email: 'JANE@EXAMPLE.COM',
          password: 'secret',
          phoneNumber: '08012345678',
          isOwner: true,
        } as any),
      ).resolves.toEqual({
        _id: userId,
        email: 'jane@example.com',
        firstName: 'Jane',
      });

      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'jane@example.com',
          password: 'hashed-password',
          isOwner: false,
          role: USER_ROLE.USER,
        }),
      );
      expect(statsService.initializeStat).toHaveBeenCalledWith(
        userId.toString(),
      );
      expect(mailService.sendMail).toHaveBeenCalledWith(
        'jane@example.com',
        'Welcome to I-One App!',
        expect.stringContaining('Hello Jane'),
      );
    });

    it('rejects duplicate nicknames before creating a user', async () => {
      usersRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ _id: new Types.ObjectId() });

      await expect(
        service.registerUser({
          firstName: 'Jane',
          lastName: 'Doe',
          nickname: 'taken',
          email: 'jane@example.com',
          password: 'secret',
          phoneNumber: '08012345678',
        } as any),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });

      expect(usersRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('registerOwner', () => {
    it('creates pending owner onboarding records and does not expose the password', async () => {
      const locationId = new Types.ObjectId();
      const bankAccountId = new Types.ObjectId();

      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      usersRepository.findOne.mockResolvedValue(null);
      locationRepository.findOne.mockResolvedValue(null);
      paystackService.resolveAccount.mockResolvedValue({
        data: { account_name: 'Jane Doe Sports Ltd' },
      });
      usersRepository.create.mockResolvedValue({
        _id: userId,
        email: 'owner@example.com',
        firstName: 'Jane',
        password: 'hashed-password',
      });
      locationRepository.create.mockResolvedValue({
        _id: locationId,
        owner: userId,
        status: LOCATION_STATUS.PENDING_VERIFICATION,
      });
      bankAccountRepository.create.mockResolvedValue({
        _id: bankAccountId,
        userId,
        status: 'PENDING',
      });

      const ownerRequest: RegisterOwnerRequest = {
          user: {
            firstName: 'Jane',
            lastName: 'Doe',
            nickname: 'owner_jane',
            email: 'OWNER@EXAMPLE.COM',
            phoneNumber: '08012345678',
            password: 'secret123',
            role: 'Manager',
          },
          location: {
            name: 'Jane Arena',
            address: 'No 11, Trinity Estate',
            openingHour: '09:00',
            closingHour: '12:00',
            pitchMax: '5 x 5',
            pitchSize: '175m x 180m',
            tier: LOCATION_TIER.PAID,
            pricingOption: LOCATION_PRICING_OPTION.HOURLY,
            paymentPerPersonHourly: 2500,
            location: { coordinates: [3.1, 6.4] },
          },
          payout: {
            bankCode: '058',
            bankName: 'GTBank',
            accountNumber: '0123456789',
          },
          termsAccepted: true,
          newsletterOptIn: true,
        };

      await expect(service.registerOwner(ownerRequest)).resolves.toMatchObject({
        message: 'Owner registration submitted successfully',
        user: {
          _id: userId,
          email: 'owner@example.com',
        },
        location: {
          _id: locationId,
          status: LOCATION_STATUS.PENDING_VERIFICATION,
        },
        payout: {
          _id: bankAccountId,
          status: 'PENDING',
        },
      });

      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'owner@example.com',
          password: 'hashed-password',
          isOwner: false,
          role: USER_ROLE.ADMIN,
          ownerRole: 'Manager',
          ownerOnboardingStatus: OWNER_ONBOARDING_STATUS.PENDING_VERIFICATION,
          termsAcceptedAt: expect.any(Date),
        }),
        expect.any(Object),
      );
      expect(locationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: userId,
          status: LOCATION_STATUS.PENDING_VERIFICATION,
          pitchMax: '5 x 5',
          pitchSize: '175m x 180m',
          paymentPerPersonHourly: 2500,
        }),
        expect.any(Object),
      );
      expect(bankAccountRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          accountName: 'Jane Doe Sports Ltd',
          status: 'PENDING',
        }),
        expect.any(Object),
      );
      expect(statsService.initializeStat).toHaveBeenCalledWith(userId.toString());

      const freeOwnerRequest: RegisterOwnerRequest = {
        user: {
          firstName: 'Jane',
          lastName: 'Doe',
          nickname: 'owner_jane_2',
          email: 'owner2@example.com',
          phoneNumber: '08012345679',
          password: 'secret123',
        },
        location: {
          name: 'Jane Arena 2',
          address: 'No 12, Trinity Estate',
          openingHour: '09:00',
          closingHour: '12:00',
          tier: LOCATION_TIER.FREE,
          location: { coordinates: [3.2, 6.5] },
        },
        payout: {
          bankCode: '058',
          bankName: 'GTBank',
          accountNumber: '0123456789',
        },
        termsAccepted: true,
      };

      const result = await service.registerOwner(freeOwnerRequest);

      expect(Object.prototype.hasOwnProperty.call(result.user, 'password')).toBe(
        false,
      );
    });
  });

  describe('password flows', () => {
    it('creates and emails password reset OTP', async () => {
      (crypto.randomInt as unknown as jest.Mock).mockReturnValue(123456);
      usersRepository.findOne.mockResolvedValue({
        _id: userId,
        email: 'jane@example.com',
      });

      await service.forgetPassword({ email: 'jane@example.com' });

      expect(usersRepository.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: userId.toString() },
        expect.objectContaining({
          otp: 123456,
          otpVerified: false,
          otpExpiration: expect.any(Date),
        }),
      );
      expect(mailService.sendMail).toHaveBeenCalledWith(
        'jane@example.com',
        'PASSWORD RESET OTP',
        expect.stringContaining('123456'),
      );
    });

    it('verifies a valid OTP', async () => {
      usersRepository.findOne.mockResolvedValue({
        _id: userId,
        email: 'jane@example.com',
        otp: 123456,
        otpExpiration: new Date(Date.now() + 60_000),
      });

      await expect(
        service.verifyOtp({ email: 'jane@example.com', otp: 123456 }),
      ).resolves.toEqual({
        message: 'OTP verified, proceed to reset password',
      });

      expect(usersRepository.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: userId.toString() },
        { otpVerified: true },
      );
    });

    it('rejects reset when passwords do not match', async () => {
      usersRepository.findOne.mockResolvedValue({
        _id: userId,
        email: 'jane@example.com',
        otpVerified: true,
      });

      await expect(
        service.resetPassword({
          email: 'jane@example.com',
          newPassword: 'new-password',
          confirmPassword: 'different',
        }),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    });

    it('changes password only when the old password is correct', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
      usersRepository.findOne.mockResolvedValue({
        _id: userId,
        password: 'old-hash',
      });

      await expect(
        service.changePassword(userId.toString(), {
          oldPassword: 'old-password',
          newPassword: 'new-password',
          confirmNewPassword: 'new-password',
        }),
      ).resolves.toEqual({ message: 'Password changed successfully' });

      expect(usersRepository.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: userId.toString() },
        { password: 'new-hash' },
      );
    });
  });

  describe('email verification', () => {
    it('stores email verification OTP in cache and sends mail', async () => {
      (crypto.randomInt as unknown as jest.Mock).mockReturnValue(654321);
      usersRepository.findOne.mockResolvedValue({
        _id: userId,
        email: 'jane@example.com',
        emailVerified: false,
      });

      await expect(
        service.sendEmailVerification({ email: 'JANE@EXAMPLE.COM' }),
      ).resolves.toEqual({ message: 'Verification OTP sent to your email' });

      expect(cacheService.set).toHaveBeenCalledWith(
        'email_verify:jane@example.com',
        '654321',
        600,
      );
      expect(mailService.sendEmailVerificationOtp).toHaveBeenCalledWith(
        'jane@example.com',
        654321,
      );
    });

    it('confirms email verification and deletes the cached OTP', async () => {
      cacheService.get.mockResolvedValue('654321');

      await expect(
        service.confirmEmailVerification({
          email: 'JANE@EXAMPLE.COM',
          otp: 654321,
        }),
      ).resolves.toEqual({ message: 'Email verified successfully' });

      expect(usersRepository.findOneAndUpdate).toHaveBeenCalledWith(
        { email: 'jane@example.com' },
        { emailVerified: true },
      );
      expect(cacheService.delete).toHaveBeenCalledWith(
        'email_verify:jane@example.com',
      );
    });
  });

  describe('account access and deletion', () => {
    it('validates users case-insensitively and strips password', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const user = { _id: userId, email: 'jane@example.com', password: 'hash' };
      usersRepository.findOne.mockResolvedValue(user);

      await expect(
        service.validateUser('JANE@EXAMPLE.COM', 'secret'),
      ).resolves.toEqual({
        _id: userId,
        email: 'jane@example.com',
        password: '',
      });

      expect(usersRepository.findOne).toHaveBeenCalledWith({
        email: 'jane@example.com',
      });
    });

    it('blocks account deletion while user has a current session', async () => {
      usersRepository.findOne.mockResolvedValue({
        _id: userId,
        currentSession: new Types.ObjectId(),
      });

      await expect(
        service.deleteAccount(userId.toString()),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('deletes account when there are no active blockers', async () => {
      usersRepository.findOne.mockResolvedValue({
        _id: userId,
        currentSession: null,
      });
      teamModel.find.mockReturnValue(leanResult([]));
      const deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });
      usersRepository.findRaw.mockReturnValue({ deleteOne });

      await expect(service.deleteAccount(userId.toString())).resolves.toEqual({
        message: 'Account deleted successfully',
      });

      expect(deleteOne).toHaveBeenCalledWith({ _id: userId.toString() });
    });

    it('blocks account deletion when user is in an active tournament team', async () => {
      const teamId = new Types.ObjectId();
      usersRepository.findOne.mockResolvedValue({
        _id: userId,
        currentSession: null,
      });
      teamModel.find.mockReturnValue(leanResult([{ _id: teamId }]));
      tournamentModel.findOne.mockReturnValue(
        leanResult({ name: 'Weekend Cup' }),
      );

      await expect(
        service.deleteAccount(userId.toString()),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });
  });
});
