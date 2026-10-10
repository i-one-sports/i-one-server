import { HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  CustomHttpException,
  LOCATION_PRICING_OPTION,
  LOCATION_TIER,
  SESSION_PAYMENT_MODE,
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
    handlePoolMemberLeave: jest.Mock;
    publishPoolUpdate: jest.Mock;
    getUserSessionPayment: jest.Mock;
    refundPayment: jest.Mock;
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
      handlePoolMemberLeave: jest.fn().mockResolvedValue({ refunded: 0 }),
      publishPoolUpdate: jest.fn().mockResolvedValue(undefined),
      getUserSessionPayment: jest.fn(),
      refundPayment: jest.fn(),
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
      { get: jest.fn(), set: jest.fn(), delete: jest.fn() } as any,
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

    it('configures a paid hourly session as a POOL whose target is the total price × hours', async () => {
      sessionRepository.findOne
        .mockResolvedValueOnce({ _id: sessionId, location: locationId })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      captainsService.isCaptain.mockResolvedValue(true);
      locationRepository.findOne.mockResolvedValue({
        _id: locationId,
        tier: LOCATION_TIER.PAID,
        pricingOption: LOCATION_PRICING_OPTION.HOURLY,
        pricePerHour: 2000000,
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
          paymentMode: SESSION_PAYMENT_MODE.POOL,
          paymentTarget: 4000000,
          amountPaid: 0,
          amountReserved: 0,
          paymentStatus: 'NOT_INITIATED',
          allPaymentsCompleted: false,
        }),
      );
    });

    it('rejects paid hourly bookings until the owner has set a total hourly price', async () => {
      sessionRepository.findOne
        .mockResolvedValueOnce({ _id: sessionId, location: locationId })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      captainsService.isCaptain.mockResolvedValue(true);
      locationRepository.findOne.mockResolvedValue({
        _id: locationId,
        tier: LOCATION_TIER.PAID,
        pricingOption: LOCATION_PRICING_OPTION.HOURLY,
        paymentPerPersonHourly: 1500, // legacy field only
        openingHour: '00:00',
        closingHour: '23:59',
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
      expect(sessionRepository.findOneAndUpdate).not.toHaveBeenCalled();
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
          paymentMode: SESSION_PAYMENT_MODE.PER_PERSON,
          paymentAmount: 5000,
        })
        .mockResolvedValueOnce({ _id: sessionId });
      locationRepository.findOne.mockResolvedValue({
        _id: locationId,
        owner: ownerId,
        tier: LOCATION_TIER.PAID,
        pricingOption: LOCATION_PRICING_OPTION.MONTHLY,
      });
      sessionPaymentService.getUsersWithActiveRecurringPayment.mockResolvedValue(new Set());

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
        LOCATION_PRICING_OPTION.MONTHLY,
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

  describe('pooled sessions', () => {
    const poolSession = (overrides: any = {}) => ({
      _id: sessionId,
      location: locationId,
      members: [userId],
      paymentRequired: true,
      paymentMode: SESSION_PAYMENT_MODE.POOL,
      paymentTarget: 2000000,
      paymentStatus: 'NOT_INITIATED',
      ...overrides,
    });

    it('opens the pot when the session fills, without pre-creating per-player bills', async () => {
      locationRepository.findOne.mockResolvedValue({
        _id: locationId,
        owner: ownerId,
        tier: LOCATION_TIER.PAID,
        pricingOption: LOCATION_PRICING_OPTION.HOURLY,
      });
      sessionRepository.findOneAndUpdate.mockResolvedValue({ _id: sessionId });

      await service.onSessionFull(poolSession() as any);

      expect(sessionRepository.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: sessionId, paymentStatus: 'NOT_INITIATED' },
        expect.objectContaining({ paymentStatus: 'PENDING', allPaymentsCompleted: false }),
      );
      expect(sessionPaymentService.initializeSessionPayments).not.toHaveBeenCalled();
      expect(sessionPaymentService.publishPoolUpdate).toHaveBeenCalledWith(sessionId.toString(), 'pool_opened');
    });

    it('does not reopen a pot that is already open or funded when the session fills again', async () => {
      locationRepository.findOne.mockResolvedValue({
        _id: locationId,
        owner: ownerId,
        tier: LOCATION_TIER.PAID,
        pricingOption: LOCATION_PRICING_OPTION.HOURLY,
      });
      sessionRepository.findOneAndUpdate.mockResolvedValue(null); // filter on NOT_INITIATED didn't match

      await service.onSessionFull(poolSession({ paymentStatus: 'COMPLETED' }) as any);

      expect(sessionPaymentService.publishPoolUpdate).not.toHaveBeenCalled();
    });

    it('routes a pool member leaving through handlePoolMemberLeave, then broadcasts', async () => {
      sessionRepository.findOne.mockResolvedValue(poolSession({ paymentStatus: 'PENDING' }));
      userRepository.findOne.mockResolvedValue({ _id: userId });
      sessionRepository.findOneAndUpdate.mockResolvedValue({ _id: sessionId });

      await service.leaveSession(userId.toString(), sessionId.toString());

      expect(sessionPaymentService.handlePoolMemberLeave).toHaveBeenCalledWith(
        sessionId.toString(),
        userId.toString(),
      );
      expect(sessionPaymentService.getUserSessionPayment).not.toHaveBeenCalled();
      expect(sessionPaymentService.publishPoolUpdate).toHaveBeenCalledWith(sessionId.toString(), 'member_left');
    });

    it('blocks the leave when a needed refund could not be requested', async () => {
      sessionRepository.findOne.mockResolvedValue(poolSession({ paymentStatus: 'PENDING' }));
      userRepository.findOne.mockResolvedValue({ _id: userId });
      sessionPaymentService.handlePoolMemberLeave.mockRejectedValue(new Error('Paystack down'));

      await expect(
        service.leaveSession(userId.toString(), sessionId.toString()),
      ).rejects.toMatchObject({ status: HttpStatus.INTERNAL_SERVER_ERROR });
      expect(sessionRepository.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('recheduleSession', () => {
    const startTime = new Date('2026-05-03T10:00:00.000Z');
    const location = {
      _id: locationId,
      owner: ownerId,
      tier: LOCATION_TIER.PAID,
      pricingOption: LOCATION_PRICING_OPTION.HOURLY,
      pricePerHour: 2000000,
      openingHour: '00:00',
      closingHour: '23:59',
    };

    it('refuses to change the pot total once payment has started', async () => {
      sessionRepository.findOne.mockResolvedValueOnce({
        _id: sessionId,
        location: locationId,
        captain: userId,
        paymentMode: SESSION_PAYMENT_MODE.POOL,
        paymentTarget: 2000000,
        paymentStatus: 'PENDING',
        amountPaid: 1000000,
      });
      locationRepository.findOne.mockResolvedValue(location);

      await expect(
        service.recheduleSession(sessionId.toString(), startTime, 120, userId.toString()),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
      expect(sessionRepository.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('refuses to flip a legacy per-person session with open bills into a pool', async () => {
      sessionRepository.findOne.mockResolvedValueOnce({
        _id: sessionId,
        location: locationId,
        captain: userId,
        paymentAmount: 150000, // no paymentMode — pre-pooling session
        paymentStatus: 'PENDING',
      });
      locationRepository.findOne.mockResolvedValue(location);

      await expect(
        service.recheduleSession(sessionId.toString(), startTime, 60, userId.toString()),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    });

    it('keeps payment terms untouched when rescheduling a started pool to the same duration', async () => {
      sessionRepository.findOne
        .mockResolvedValueOnce({
          _id: sessionId,
          location: locationId,
          captain: userId,
          paymentRequired: true,
          paymentMode: SESSION_PAYMENT_MODE.POOL,
          paymentTarget: 2000000,
          paymentAmount: 0,
          paymentStatus: 'PENDING',
          amountPaid: 1000000,
        })
        .mockResolvedValue(null);
      locationRepository.findOne.mockResolvedValue(location);
      sessionRepository.findOneAndUpdate.mockResolvedValue({ _id: sessionId });

      await service.recheduleSession(sessionId.toString(), startTime, 60, userId.toString());

      const [, update] = sessionRepository.findOneAndUpdate.mock.calls[0];
      expect(update).not.toHaveProperty('paymentStatus');
      expect(update).not.toHaveProperty('paymentTarget');
    });
  });
});
