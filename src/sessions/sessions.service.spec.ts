import { HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  CustomHttpException,
  LOCATION_PRICING_OPTION,
  LOCATION_TIER,
} from '@app/common';
import { SessionsService } from './sessions.service';

describe('SessionsService', () => {
  let service: SessionsService;
  let sessionRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
    delete: jest.Mock;
    findRaw: jest.Mock;
  };
  let locationRepository: { find: jest.Mock; findOne: jest.Mock };
  let matchRepository: { findRaw: jest.Mock };
  let userRepository: {
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    updateMany: jest.Mock;
  };
  let captainsService: { createCaptain: jest.Mock; isCaptain: jest.Mock };
  let sessionPaymentService: {
    initializeSessionPayments: jest.Mock;
    getUsersWithActiveRecurringPayment: jest.Mock;
    getSessionMemberPaymentMap: jest.Mock;
  };
  let notificationService: { emit: jest.Mock };

  const userId = new Types.ObjectId();
  const locationId = new Types.ObjectId();
  const sessionId = new Types.ObjectId();
  const ownerId = new Types.ObjectId();

  beforeEach(() => {
    sessionRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      findRaw: jest.fn(),
    };
    locationRepository = { find: jest.fn(), findOne: jest.fn() };
    matchRepository = { findRaw: jest.fn() };
    userRepository = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateMany: jest.fn(),
    };
    captainsService = {
      createCaptain: jest.fn(),
      isCaptain: jest.fn(),
    };
    sessionPaymentService = {
      initializeSessionPayments: jest.fn(),
      getUsersWithActiveRecurringPayment: jest.fn(),
      getSessionMemberPaymentMap: jest.fn(),
    };
    notificationService = { emit: jest.fn().mockResolvedValue(undefined) };

    service = new SessionsService(
      sessionRepository as any,
      locationRepository as any,
      matchRepository as any,
      userRepository as any,
      captainsService as any,
      sessionPaymentService as any,
      notificationService as any,
    );
  });

  describe('startSession', () => {
    it('creates a session for an email-verified user', async () => {
      const session = { _id: sessionId, location: locationId, captain: userId };
      userRepository.findOne.mockResolvedValue({ _id: userId, emailVerified: true });
      locationRepository.findOne.mockResolvedValue({
        _id: locationId,
        owner: ownerId,
        name: 'Main Pitch',
      });
      sessionRepository.create.mockResolvedValue(session);
      userRepository.findOneAndUpdate.mockResolvedValue({ _id: userId });
      captainsService.createCaptain.mockResolvedValue({
        _id: new Types.ObjectId(),
      });

      await expect(
        service.startSession(userId.toString(), locationId.toString()),
      ).resolves.toBe(session);

      expect(sessionRepository.create).toHaveBeenCalledWith({
        location: locationId.toString(),
        captain: userId.toString(),
      });
      expect(captainsService.createCaptain).toHaveBeenCalledWith({
        userId: userId.toString(),
        sessionId: sessionId.toString(),
      });
      expect(notificationService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          targetUserId: ownerId.toString(),
          type: 'SESSION_CREATED',
        }),
      );
    });

    it('blocks users whose email is not verified', async () => {
      userRepository.findOne.mockResolvedValue({ _id: userId, emailVerified: false });
      locationRepository.findOne.mockResolvedValue({ _id: locationId });

      await expect(
        service.startSession(userId.toString(), locationId.toString()),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });

      expect(sessionRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('createSession', () => {
    const startTime = new Date('2026-05-03T10:00:00.000Z');

    it('configures a paid hourly session and calculates amount per full hour', async () => {
      sessionRepository.findOne
        .mockResolvedValueOnce({ _id: sessionId, location: locationId })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      captainsService.isCaptain.mockResolvedValue(true);
      locationRepository.findOne.mockResolvedValue({
        _id: locationId,
        tier: LOCATION_TIER.PAID,
        pricingOption: LOCATION_PRICING_OPTION.HOURLY,
        paymentPerPersonHourly: 1500,
        openingHour: '00:00',
        closingHour: '23:59',
      });
      sessionRepository.findOneAndUpdate.mockResolvedValue({ _id: sessionId });

      await service.createSession(
        {
          setNumber: 5,
          playersPerTeam: 2,
          timeDuration: 120,
          minsPerSet: 10,
          startTime,
          winningDecider: 'penalties' as any,
        },
        userId.toString(),
        sessionId.toString(),
      );

      expect(sessionRepository.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: sessionId.toString() },
        expect.objectContaining({
          maxNumber: 10,
          paymentRequired: true,
          paymentAmount: 3000,
          paymentStatus: 'NOT_INITIATED',
          allPaymentsCompleted: false,
        }),
      );
    });

    it('rejects non-captains', async () => {
      sessionRepository.findOne.mockResolvedValue({
        _id: sessionId,
        location: locationId,
      });
      captainsService.isCaptain.mockResolvedValue(false);

      await expect(
        service.createSession(
          {
            setNumber: 5,
            playersPerTeam: 2,
            timeDuration: 60,
            minsPerSet: 10,
            startTime,
            winningDecider: 'penalties' as any,
          },
          userId.toString(),
          sessionId.toString(),
        ),
      ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
    });

    it('rejects sessions outside location operating hours', async () => {
      sessionRepository.findOne.mockResolvedValueOnce({
        _id: sessionId,
        location: locationId,
      });
      captainsService.isCaptain.mockResolvedValue(true);
      locationRepository.findOne.mockResolvedValue({
        _id: locationId,
        tier: LOCATION_TIER.FREE,
        openingHour: '12:00',
        closingHour: '13:00',
      });

      await expect(
        service.createSession(
          {
            setNumber: 5,
            playersPerTeam: 2,
            timeDuration: 60,
            minsPerSet: 10,
            startTime,
            winningDecider: 'penalties' as any,
          },
          userId.toString(),
          sessionId.toString(),
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });
  });

  describe('joinSession', () => {
    it('adds a user, updates currentSession, and leaves payment untouched while not full', async () => {
      const existingMember = new Types.ObjectId();
      sessionRepository.findOne.mockResolvedValue({
        _id: sessionId,
        members: [existingMember],
        maxNumber: 4,
        isFull: false,
      });
      sessionRepository.findOneAndUpdate.mockResolvedValue({
        _id: sessionId,
        isFull: false,
      });

      await expect(
        service.joinSession(userId.toString(), sessionId.toString()),
      ).resolves.toMatchObject({ message: 'User successfully joined session' });

      expect(sessionRepository.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: sessionId.toString() },
        {
          $push: { members: userId.toString() },
          $set: { isFull: false },
        },
      );
      expect(
        sessionPaymentService.initializeSessionPayments,
      ).not.toHaveBeenCalled();
    });

    it('rejects duplicate session members', async () => {
      sessionRepository.findOne.mockResolvedValue({
        _id: sessionId,
        members: [userId],
        maxNumber: 4,
        isFull: false,
      });

      await expect(
        service.joinSession(userId.toString(), sessionId.toString()),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    });

    it('initializes payments when a paid session becomes full', async () => {
      const existingMember = new Types.ObjectId();
      sessionRepository.findOne.mockResolvedValue({
        _id: sessionId,
        location: locationId,
        members: [existingMember],
        maxNumber: 2,
        isFull: false,
      });
      sessionRepository.findOneAndUpdate
        .mockResolvedValueOnce({
          _id: sessionId,
          location: locationId,
          members: [existingMember, userId],
          maxNumber: 2,
          isFull: true,
          paymentRequired: true,
          paymentAmount: 5000,
        })
        .mockResolvedValueOnce({ _id: sessionId });
      locationRepository.findOne.mockResolvedValue({
        _id: locationId,
        owner: ownerId,
        tier: LOCATION_TIER.PAID,
        pricingOption: LOCATION_PRICING_OPTION.HOURLY,
      });

      await service.joinSession(userId.toString(), sessionId.toString());

      expect(
        sessionPaymentService.initializeSessionPayments,
      ).toHaveBeenCalledWith(
        sessionId,
        locationId,
        ownerId,
        expect.arrayContaining([existingMember, userId]),
        5000,
        expect.any(Date),
        LOCATION_PRICING_OPTION.HOURLY,
      );
    });
  });

  describe('onSessionFull', () => {
    it('marks monthly sessions complete when every member already has active recurring payment', async () => {
      const memberOne = new Types.ObjectId();
      const memberTwo = new Types.ObjectId();
      locationRepository.findOne.mockResolvedValue({
        _id: locationId,
        owner: ownerId,
        tier: LOCATION_TIER.PAID,
        pricingOption: LOCATION_PRICING_OPTION.MONTHLY,
      });
      sessionPaymentService.getUsersWithActiveRecurringPayment.mockResolvedValue(
        new Set([memberOne.toString(), memberTwo.toString()]),
      );

      await service.onSessionFull({
        _id: sessionId,
        location: locationId,
        members: [memberOne, memberTwo],
        paymentAmount: 5000,
      } as any);

      expect(
        sessionPaymentService.initializeSessionPayments,
      ).not.toHaveBeenCalled();
      expect(sessionRepository.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: sessionId },
        { paymentStatus: 'COMPLETED', allPaymentsCompleted: true },
      );
    });
  });
});
