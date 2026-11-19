import { Types } from 'mongoose';
import { CustomHttpException } from '@app/common';
import { SetsService } from './sets.service';

describe('SetsService', () => {
  let service: SetsService;
  let setRepository: {
    findRaw: jest.Mock;
    insertMany: jest.Mock;
    findAndPopulate: jest.Mock;
  };
  let sessionRepository: { findOne: jest.Mock };

  const sessionId = new Types.ObjectId().toString();
  const memberId = new Types.ObjectId().toString();
  const outsiderId = new Types.ObjectId().toString();

  beforeEach(() => {
    setRepository = {
      findRaw: jest.fn(),
      insertMany: jest.fn(),
      findAndPopulate: jest.fn(),
    };
    sessionRepository = { findOne: jest.fn() };

    service = new SetsService(setRepository as any, sessionRepository as any);
  });

  describe('createSetForMember', () => {
    it('throws 404 when the session does not exist', async () => {
      sessionRepository.findOne.mockResolvedValue(null);

      await expect(service.createSetForMember(sessionId, memberId)).rejects.toThrow(
        CustomHttpException,
      );
    });

    it('rejects a caller who is not a member of the session', async () => {
      sessionRepository.findOne.mockResolvedValue({
        _id: sessionId,
        members: [memberId],
        setNumber: 2,
        isFull: true,
      });

      await expect(service.createSetForMember(sessionId, outsiderId)).rejects.toThrow(
        'You are not a member of this session',
      );
      expect(setRepository.insertMany).not.toHaveBeenCalled();
    });

    it('delegates to createSet for an actual session member', async () => {
      sessionRepository.findOne.mockResolvedValue({
        _id: sessionId,
        members: [memberId],
        setNumber: 2,
        isFull: true,
      });
      setRepository.findRaw.mockReturnValue({
        countDocuments: jest.fn().mockResolvedValue(0),
        bulkWrite: jest.fn().mockResolvedValue({}),
      });
      const createdSets = [
        { _id: new Types.ObjectId(), session: sessionId, name: 'Team 1', players: [] },
        { _id: new Types.ObjectId(), session: sessionId, name: 'Team 2', players: [] },
      ];
      setRepository.insertMany.mockResolvedValue(createdSets);
      setRepository.findAndPopulate.mockResolvedValue(createdSets);

      const result = await service.createSetForMember(sessionId, memberId);

      expect(setRepository.insertMany).toHaveBeenCalled();
      expect(result).toEqual({ message: 'Sets created successfully', sets: createdSets });
    });
  });
});
