import { HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import { CustomHttpException, MATCH_TYPE } from '@app/common';
import { MatchesService } from './matches.service';

describe('MatchesService', () => {
  let service: MatchesService;
  let matchRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    findOneAndPopulate: jest.Mock;
    findOneAndUpdate: jest.Mock;
    findAndPopulate: jest.Mock;
    findRaw: jest.Mock;
    insertMany: jest.Mock;
    IncrementMatchScore: jest.Mock;
    RedecrementMatchScore: jest.Mock;
    addGoalScorer: jest.Mock;
    viewMatchDetailsDeep: jest.Mock;
  };
  let setRepository: { find: jest.Mock };
  let sessionRepository: { findOne: jest.Mock; findRaw: jest.Mock };
  let locationRepository: { findRaw: jest.Mock };
  let matchEventService: { emitMatchScoreUpdate: jest.Mock };
  let sessionPaymentService: { areAllPaymentsCompleted: jest.Mock };

  const sessionId = new Types.ObjectId();
  const matchId = new Types.ObjectId();
  const teamOneId = new Types.ObjectId();
  const teamTwoId = new Types.ObjectId();
  const locationId = new Types.ObjectId();
  const ownerId = new Types.ObjectId();

  // Mocks the `findRaw().findById().select().lean()` chain used by
  // assertLocationOwner — resolves to `result` regardless of the filter passed in.
  const leanChain = (result: any) => ({
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(result),
      }),
    }),
  });

  beforeEach(() => {
    matchRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndPopulate: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findAndPopulate: jest.fn(),
      findRaw: jest.fn(),
      insertMany: jest.fn(),
      IncrementMatchScore: jest.fn(),
      RedecrementMatchScore: jest.fn(),
      addGoalScorer: jest.fn(),
      viewMatchDetailsDeep: jest.fn(),
    };
    setRepository = { find: jest.fn() };
    sessionRepository = { findOne: jest.fn(), findRaw: jest.fn() };
    locationRepository = { findRaw: jest.fn() };
    matchEventService = {
      emitMatchScoreUpdate: jest.fn().mockResolvedValue(undefined),
    };
    sessionPaymentService = { areAllPaymentsCompleted: jest.fn() };

    // Happy-path ownership chain: match -> session -> location owned by `ownerId`
    matchRepository.findRaw.mockReturnValue(leanChain({ session: sessionId }));
    sessionRepository.findRaw.mockReturnValue(leanChain({ location: locationId }));
    locationRepository.findRaw.mockReturnValue(leanChain({ owner: ownerId }));

    service = new MatchesService(
      matchRepository as any,
      setRepository as any,
      sessionRepository as any,
      locationRepository as any,
      matchEventService as any,
      sessionPaymentService as any,
    );
  });

  describe('matchUp', () => {
    it('creates pairings for an even number of sets', async () => {
      const sets = [
        { _id: new Types.ObjectId() },
        { _id: new Types.ObjectId() },
        { _id: new Types.ObjectId() },
        { _id: new Types.ObjectId() },
      ];
      const insertedMatches = [
        { _id: new Types.ObjectId() },
        { _id: new Types.ObjectId() },
      ];

      setRepository.find.mockResolvedValue(sets);
      sessionRepository.findOne.mockResolvedValue({
        _id: sessionId,
        matchType: MATCH_TYPE.FRIENDLY,
        paymentRequired: false,
      });
      matchRepository.find.mockResolvedValue([]);
      matchRepository.insertMany.mockResolvedValue(insertedMatches);

      await expect(service.matchUp(sessionId.toString())).resolves.toBe(
        insertedMatches,
      );

      expect(matchRepository.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            _id: expect.any(Types.ObjectId),
            session: sessionId.toString(),
            matchType: MATCH_TYPE.FRIENDLY,
          }),
          expect.objectContaining({
            _id: expect.any(Types.ObjectId),
            session: sessionId.toString(),
            matchType: MATCH_TYPE.FRIENDLY,
          }),
        ]),
      );
      expect(matchRepository.insertMany.mock.calls[0][0]).toHaveLength(2);
    });

    it('blocks paid sessions until all payments are complete', async () => {
      setRepository.find.mockResolvedValue([
        { _id: teamOneId },
        { _id: teamTwoId },
      ]);
      sessionRepository.findOne.mockResolvedValue({
        _id: sessionId,
        paymentRequired: true,
      });
      sessionPaymentService.areAllPaymentsCompleted.mockResolvedValue(false);

      await expect(service.matchUp(sessionId.toString())).rejects.toMatchObject(
        {
          status: HttpStatus.PAYMENT_REQUIRED,
        },
      );

      expect(matchRepository.insertMany).not.toHaveBeenCalled();
    });

    it('rejects odd set counts', async () => {
      setRepository.find.mockResolvedValue([
        { _id: new Types.ObjectId() },
        { _id: new Types.ObjectId() },
        { _id: new Types.ObjectId() },
      ]);
      sessionRepository.findOne.mockResolvedValue({
        _id: sessionId,
        paymentRequired: false,
      });

      await expect(service.matchUp(sessionId.toString())).rejects.toThrow(
        CustomHttpException,
      );
      expect(matchRepository.insertMany).not.toHaveBeenCalled();
    });

    it('rejects sessions that are already matched', async () => {
      setRepository.find.mockResolvedValue([
        { _id: teamOneId },
        { _id: teamTwoId },
      ]);
      sessionRepository.findOne.mockResolvedValue({
        _id: sessionId,
        paymentRequired: false,
      });
      matchRepository.find.mockResolvedValue([{ _id: matchId }]);

      await expect(service.matchUp(sessionId.toString())).rejects.toMatchObject(
        {
          status: HttpStatus.BAD_REQUEST,
        },
      );
    });
  });

  describe('match lifecycle', () => {
    it('starts a match and returns a friendly message', async () => {
      matchRepository.findOneAndPopulate.mockResolvedValue({
        teamOne: { name: 'Alpha' },
        teamTwo: { name: 'Beta' },
      });
      matchRepository.findOneAndUpdate.mockResolvedValue({
        _id: matchId,
        isStarted: true,
      });

      await expect(service.startMatch(matchId.toString(), ownerId.toString())).resolves.toEqual({
        message: 'Alpha vs Beta is underway',
        match: { _id: matchId, isStarted: true },
      });

      expect(matchRepository.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: matchId.toString() },
        { isStarted: true },
      );
    });

    it('throws when match details are missing', async () => {
      matchRepository.viewMatchDetailsDeep.mockResolvedValue(null);

      await expect(
        service.viewMatchDetails(matchId.toString()),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });
  });

  describe('score updates', () => {
    const updatedMatch = {
      _id: matchId,
      session: sessionId,
      teamOne: { _id: teamOneId, name: 'Alpha' },
      teamTwo: { _id: teamTwoId, name: 'Beta' },
      teamOneScore: 2,
      teamTwoScore: 1,
    };

    it('increments a score and emits a match score event', async () => {
      matchRepository.IncrementMatchScore.mockResolvedValue(updatedMatch);

      await expect(
        service.incrementMatchScore(matchId.toString(), 'teamOne', ownerId.toString()),
      ).resolves.toBe(updatedMatch);

      expect(matchEventService.emitMatchScoreUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          matchId: expect.any(Types.ObjectId),
          sessionId,
          teamOneScore: 2,
          teamTwoScore: 1,
        }),
      );
    });

    it('rejects scorer records before the match starts', async () => {
      matchRepository.findOne.mockResolvedValue({
        _id: matchId,
        isStarted: false,
      });

      await expect(
        service.recordGoalScorer(
          matchId.toString(),
          new Types.ObjectId().toString(),
          'teamOne',
          ownerId.toString(),
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });

      expect(matchRepository.addGoalScorer).not.toHaveBeenCalled();
      expect(matchEventService.emitMatchScoreUpdate).not.toHaveBeenCalled();
    });

    it('records a scorer and emits latest scorer metadata', async () => {
      const playerId = new Types.ObjectId().toString();
      matchRepository.findOne.mockResolvedValue({
        _id: matchId,
        isStarted: true,
      });
      matchRepository.addGoalScorer.mockResolvedValue(updatedMatch);

      await expect(
        service.recordGoalScorer(matchId.toString(), playerId, 'teamTwo', ownerId.toString()),
      ).resolves.toBe(updatedMatch);

      expect(matchEventService.emitMatchScoreUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          latestScorer: { player: playerId, team: 'teamTwo' },
        }),
      );
    });
  });
});
