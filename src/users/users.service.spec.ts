import { HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { CustomHttpException, USER_ROLE } from '@app/common';
import { UsersService } from './users.service';

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
  let mailService: { sendMail: jest.Mock };
  let statsService: { initializeStat: jest.Mock };
  let cacheService: { set: jest.Mock; get: jest.Mock; delete: jest.Mock };
  let teamModel: { find: jest.Mock };
  let tournamentModel: { findOne: jest.Mock };

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
    mailService = { sendMail: jest.fn().mockResolvedValue(undefined) };
    statsService = { initializeStat: jest.fn().mockResolvedValue(undefined) };
    cacheService = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    teamModel = { find: jest.fn() };
    tournamentModel = { findOne: jest.fn() };

    service = new UsersService(
      usersRepository as any,
      mailService as any,
      statsService as any,
      cacheService as any,
      teamModel as any,
      tournamentModel as any,
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
          role: USER_ROLE.ADMIN,
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
      expect(mailService.sendMail).toHaveBeenCalledWith(
        'jane@example.com',
        'Verify your email',
        expect.stringContaining('654321'),
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
