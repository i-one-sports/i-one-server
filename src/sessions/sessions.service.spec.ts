import { HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  CustomHttpException,
  LOCATION_PRICING_OPTION,
  LOCATION_TIER,
  SESSION_PAYMENT_MODE,
  SESSION_STATUS,
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
  let locationRepository: { find: jest.Mock; findOne: jest.Mock; findRaw: jest.Mock };
  // Raw models behind findRaw(), used by bookSlot inside the transaction.
  let sessionModel: { findOne: jest.Mock; findOneAndUpdate: jest.Mock };
  let locationModel: { updateOne: jest.Mock };
  let connection: { transaction: jest.Mock };
  let slotClash: any;
  const tx = { id: 'tx' };
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
    slotClash = null;
    sessionModel = {
      findOne: jest.fn(() => ({ lean: () => Promise.resolve(slotClash) })),
      findOneAndUpdate: jest.fn().mockResolvedValue({ _id: sessionId }),
    };
    locationModel = { updateOne: jest.fn().mockResolvedValue({}) };
    connection = { transaction: jest.fn(async (fn: any) => fn(tx)) };
    locationRepository = { find: jest.fn(), findOne: jest.fn(), findRaw: jest.fn(() => locationModel) };
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
      connection as any,
    );
    sessionRepository.findRaw.mockReturnValue(sessionModel);
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

      expect(sessionModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: sessionId },
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
        { session: tx, new: true, lean: true },
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
      expect(sessionModel.findOneAndUpdate).not.toHaveBeenCalled();
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
      expect(sessionModel.findOneAndUpdate).not.toHaveBeenCalled();
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

      await service.recheduleSession(sessionId.toString(), startTime, 60, userId.toString());

      const [, update] = sessionModel.findOneAndUpdate.mock.calls[0];
      expect(update).not.toHaveProperty('paymentStatus');
      expect(update).not.toHaveProperty('paymentTarget');
    });
  });

  describe('slot booking', () => {
    const startTime = new Date('2026-05-03T10:00:00.000Z');
    const freeLocation = {
      _id: locationId,
      owner: ownerId,
      name: 'Lekki Pitch',
      tier: LOCATION_TIER.FREE,
      openingHour: '00:00',
      closingHour: '23:59',
    };
    const config = {
      setNumber: 2,
      playersPerTeam: 2,
      timeDuration: 60,
      minsPerSet: 10,
      startTime,
      winningDecider: 'penalties' as any,
    };
    const configure = () => service.createSession(config, userId.toString(), sessionId.toString());

    beforeEach(() => {
      sessionRepository.findOne.mockResolvedValue({ _id: sessionId, location: locationId });
      captainsService.isCaptain.mockResolvedValue(true);
      locationRepository.findOne.mockResolvedValue(freeLocation);
      (notificationService as any).send = jest.fn().mockResolvedValue(undefined);
    });

    it('bumps the pitch, checks for clashes, and saves — in that order, all in one transaction', async () => {
      await configure();

      expect(connection.transaction).toHaveBeenCalledTimes(1);
      expect(locationModel.updateOne).toHaveBeenCalledWith(
        { _id: locationId },
        { $inc: { bookingVersion: 1 } },
        { session: tx },
      );
      expect(sessionModel.findOne).toHaveBeenCalledWith(
        {
          _id: { $ne: sessionId },
          location: locationId,
          status: { $nin: [SESSION_STATUS.CANCELLED, SESSION_STATUS.REFUNDED] },
          startTime: { $lt: new Date('2026-05-03T11:00:00.000Z') },
          stopTime: { $gt: startTime },
        },
        { _id: 1 },
        { session: tx },
      );
      expect(sessionModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: sessionId },
        expect.objectContaining({ startTime, stopTime: new Date('2026-05-03T11:00:00.000Z') }),
        { session: tx, new: true, lean: true },
      );

      const order = (m: jest.Mock) => m.mock.invocationCallOrder[0];
      expect(order(locationModel.updateOne)).toBeLessThan(order(sessionModel.findOne));
      expect(order(sessionModel.findOne)).toBeLessThan(order(sessionModel.findOneAndUpdate));
    });

    it('rejects a clash at the same pitch with 409 and saves nothing', async () => {
      slotClash = { _id: new Types.ObjectId() };

      await expect(configure()).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
      expect(sessionModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('only notifies the owner after the booking has committed', async () => {
      let committed = false;
      connection.transaction.mockImplementation(async (fn: any) => {
        const result = await fn(tx);
        committed = true;
        return result;
      });
      const committedWhenSent: boolean[] = [];
      (notificationService as any).send = jest.fn(async () => {
        committedWhenSent.push(committed);
      });

      await configure();
      await new Promise(process.nextTick);

      expect(committedWhenSent).toEqual([true]);
    });

    it('books reschedules through the same transaction', async () => {
      sessionRepository.findOne.mockResolvedValue({ _id: sessionId, location: locationId, captain: userId });

      await service.recheduleSession(sessionId.toString(), startTime, 60, userId.toString());

      expect(connection.transaction).toHaveBeenCalledTimes(1);
      expect(locationModel.updateOne).toHaveBeenCalledWith(
        { _id: locationId },
        { $inc: { bookingVersion: 1 } },
        { session: tx },
      );
      expect(sessionModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: sessionId },
        expect.objectContaining({ startTime, timeDuration: 60 }),
        { session: tx, new: true, lean: true },
      );
    });
  });

  describe('opening hours (Lagos time)', () => {
    // Times below are Lagos wall-clock; Lagos is UTC+1.
    const lagos = (isoLocal: string) => new Date(`${isoLocal}+01:00`);
    const book = (location: any, startLocal: string, minutes: number) => {
      sessionRepository.findOne.mockResolvedValue({ _id: sessionId, location: locationId });
      captainsService.isCaptain.mockResolvedValue(true);
      locationRepository.findOne.mockResolvedValue({ _id: locationId, owner: ownerId, tier: LOCATION_TIER.FREE, ...location });
      (notificationService as any).send = jest.fn().mockResolvedValue(undefined);
      return service.createSession(
        {
          setNumber: 2,
          playersPerTeam: 2,
          timeDuration: minutes,
          minsPerSet: 10,
          startTime: lagos(startLocal),
          winningDecider: 'penalties' as any,
        },
        userId.toString(),
        sessionId.toString(),
      );
    };
    const allowed = async (location: any, start: string, minutes: number) =>
      expect(book(location, start, minutes)).resolves.toBeDefined();
    const rejected = async (location: any, start: string, minutes: number) =>
      expect(book(location, start, minutes)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });

    const daytime = { openingHour: '08:00', closingHour: '22:00' };
    const overnight = { openingHour: '23:00', closingHour: '05:00' };
    const allDay = { openingHour: '00:00', closingHour: '00:00' };

    it('checks a daytime pitch against Lagos time, not server time', async () => {
      await allowed(daytime, '2026-05-03T08:00:00', 60); // opens 08:00 Lagos (07:00 UTC)
      await allowed(daytime, '2026-05-03T21:00:00', 60); // ends exactly at closing
      await rejected(daytime, '2026-05-03T07:30:00', 60); // before opening
      await rejected(daytime, '2026-05-03T21:30:00', 60); // runs past closing
    });

    it('allows overnight pitches, including games that cross midnight', async () => {
      await allowed(overnight, '2026-05-03T23:00:00', 60);
      await allowed(overnight, '2026-05-03T23:30:00', 90); // 23:30–01:00
      await allowed(overnight, '2026-05-04T02:00:00', 120); // 02:00–04:00, previous night's window
      await allowed(overnight, '2026-05-04T04:00:00', 60); // ends exactly at 05:00
      await rejected(overnight, '2026-05-04T04:30:00', 60); // runs past 05:00
      await rejected(overnight, '2026-05-04T12:00:00', 60); // closed during the day
      await rejected(overnight, '2026-05-03T22:30:00', 60); // starts before opening
    });

    it('treats the same opening and closing time as open 24 hours', async () => {
      await allowed(allDay, '2026-05-03T03:00:00', 60);
      await allowed(allDay, '2026-05-03T23:30:00', 120); // across midnight
    });
  });

  describe('getSessionsByLocationAndDate', () => {
    it('returns the Lagos calendar day (23:00 UTC the day before → 22:59:59.999 UTC)', async () => {
      const chain: any = { populate: () => chain, sort: () => Promise.resolve([]) };
      const find = jest.fn(() => chain);
      sessionRepository.findRaw.mockReturnValue({ find });

      await service.getSessionsByLocationAndDate(locationId.toString(), '2026-05-04');

      expect(find).toHaveBeenCalledWith({
        location: locationId,
        startTime: {
          $gte: new Date('2026-05-03T23:00:00.000Z'),
          $lte: new Date('2026-05-04T22:59:59.999Z'),
        },
      });
    });
  });
});
