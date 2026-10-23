import { HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import { REFEREE_MODE, REFEREE_STATUS, SESSION_STATUS } from '@app/common';
import { RefereesService } from './referees.service';

describe('RefereesService', () => {
  const id = () => new Types.ObjectId();
  const sessionId = id();
  const captain = id();
  const invitee = id();

  let refereeRepository: { findOne: jest.Mock; findOneAndUpdate: jest.Mock; create: jest.Mock; findRaw: jest.Mock };
  let sessionRepository: { findOne: jest.Mock };
  let locationRepository: { findOne: jest.Mock };
  let userRepository: { findOne: jest.Mock };
  let matchRepository: { findRaw: jest.Mock };
  let captainsService: { isCaptain: jest.Mock };
  let outbox: { enqueue: jest.Mock };
  let service: RefereesService;

  beforeEach(() => {
    refereeRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      findOneAndUpdate: jest.fn(async (_f, u) => ({ _id: id(), ...u })),
      create: jest.fn(async (doc) => ({ _id: id(), ...doc })),
      findRaw: jest.fn(),
    };
    sessionRepository = {
      findOne: jest.fn().mockResolvedValue({ _id: sessionId, captain, members: [captain], status: SESSION_STATUS.OPEN }),
    };
    locationRepository = { findOne: jest.fn().mockResolvedValue({ owner: id() }) };
    userRepository = {
      findOne: jest.fn(async (q) => (q._id?.toString() === invitee.toString() ? { _id: invitee } : q._id ? { _id: q._id, firstName: 'Emeka' } : null)),
    };
    matchRepository = { findRaw: jest.fn() };
    captainsService = { isCaptain: jest.fn().mockResolvedValue(false) };
    outbox = { enqueue: jest.fn().mockResolvedValue(true) };
    service = new RefereesService(
      refereeRepository as any,
      sessionRepository as any,
      locationRepository as any,
      userRepository as any,
      matchRepository as any,
      captainsService as any,
      outbox as any,
    );
  });

  describe('invite', () => {
    it('lets a captain invite a user and notifies them', async () => {
      const entry = await service.invite(sessionId.toString(), captain.toString(), invitee.toString());

      expect(refereeRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ user: invitee, mode: REFEREE_MODE.OWN_PHONE, status: REFEREE_STATUS.INVITED }),
      );
      expect(outbox.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ targetUserId: invitee.toString(), payload: expect.objectContaining({ refereeId: entry._id.toString() }) }),
      );
    });

    it('refuses non-captains', async () => {
      await expect(
        service.invite(sessionId.toString(), id().toString(), invitee.toString()),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    });

    it('refuses closed sessions', async () => {
      sessionRepository.findOne.mockResolvedValue({ _id: sessionId, captain, status: SESSION_STATUS.CANCELLED });
      await expect(
        service.invite(sessionId.toString(), captain.toString(), invitee.toString()),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('refuses a second invite while one is open, but re-invites after a decline', async () => {
      refereeRepository.findOne.mockResolvedValue({ _id: id(), user: invitee, status: REFEREE_STATUS.INVITED });
      await expect(
        service.invite(sessionId.toString(), captain.toString(), invitee.toString()),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });

      const declined = { _id: id(), user: invitee, status: REFEREE_STATUS.DECLINED };
      refereeRepository.findOne.mockResolvedValue(declined);
      await service.invite(sessionId.toString(), captain.toString(), invitee.toString());
      expect(refereeRepository.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: declined._id, status: REFEREE_STATUS.DECLINED },
        expect.objectContaining({ status: REFEREE_STATUS.INVITED }),
      );
    });
  });

  describe('respond', () => {
    it('only the invitee can answer, and only once', async () => {
      const entry = { _id: id(), session: sessionId, user: invitee, status: REFEREE_STATUS.INVITED };
      refereeRepository.findOne.mockResolvedValue(entry);

      await expect(service.respond(entry._id.toString(), id().toString(), true)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });

      await service.respond(entry._id.toString(), invitee.toString(), true);
      expect(refereeRepository.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: entry._id.toString(), status: REFEREE_STATUS.INVITED },
        expect.objectContaining({ status: REFEREE_STATUS.ACCEPTED }),
      );

      refereeRepository.findOneAndUpdate.mockResolvedValue(null);
      await expect(service.respond(entry._id.toString(), invitee.toString(), false)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });
  });

  describe('addOnCaptainDevice', () => {
    it('links the guest to an account by phone, accepts at once, and never returns the phone', async () => {
      const linked = id();
      userRepository.findOne.mockImplementation(async (q) => (q.phoneNumber === '+2348034127788' ? { _id: linked } : null));

      const entry = await service.addOnCaptainDevice(sessionId.toString(), captain.toString(), ' Tola ', '08034127788');

      expect(refereeRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user: linked,
          guestName: 'Tola',
          guestPhone: '+2348034127788',
          mode: REFEREE_MODE.CAPTAIN_DEVICE,
          deviceOwner: captain,
          status: REFEREE_STATUS.ACCEPTED,
        }),
      );
      expect(entry).not.toHaveProperty('guestPhone');
    });

    it('refuses someone already refereeing on their own phone', async () => {
      refereeRepository.findOne.mockResolvedValue({
        _id: id(),
        mode: REFEREE_MODE.OWN_PHONE,
        status: REFEREE_STATUS.ACCEPTED,
      });
      await expect(
        service.addOnCaptainDevice(sessionId.toString(), captain.toString(), 'Tola', '08034127788'),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });
  });

  describe('roster', () => {
    const rosterChain = (rows: any[]) => ({
      find: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(rows) }),
        }),
      }),
    });

    it('shows members the roster without guest phone numbers', async () => {
      refereeRepository.findRaw.mockReturnValue(rosterChain([{ _id: id(), guestName: 'Tola', guestPhone: '+234...' }]));

      const rows = await service.roster(sessionId.toString(), captain.toString());

      expect(rows).toEqual([expect.not.objectContaining({ guestPhone: expect.anything() })]);
    });

    it('hides it from people outside the session', async () => {
      refereeRepository.findRaw.mockReturnValue(rosterChain([]));
      await expect(service.roster(sessionId.toString(), id().toString())).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
      });
    });
  });
});
