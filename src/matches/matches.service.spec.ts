import { HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  MATCH_DECIDED_BY,
  MATCH_RESULT_STATUS,
  MATCH_STATUS,
  MATCH_TYPE,
  REFEREE_MODE,
  ROTATION_FORMAT,
  WINNING_DECIDER,
} from '@app/common';
import { MatchesService } from './matches.service';
import { RotationService } from './rotation.service';

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
    create: jest.Mock;
    viewMatchDetailsDeep: jest.Mock;
  };
  let setRepository: { find: jest.Mock };
  let sessionRepository: { findOne: jest.Mock; findRaw: jest.Mock };
  let matchReferee: {
    assertCanOfficiate: jest.Mock;
    assertEligible: jest.Mock;
    carryOver: jest.Mock;
    resultStatusFor: jest.Mock;
    playersOf: jest.Mock;
    notifyReviewers: jest.Mock;
  };
  let matchStats: { postMatchStats: jest.Mock };
  let matchEventService: { emitMatchScoreUpdate: jest.Mock };
  let sessionPaymentService: { areAllPaymentsCompleted: jest.Mock };

  const sessionId = new Types.ObjectId();
  const matchId = new Types.ObjectId();
  const teamOneId = new Types.ObjectId();
  const teamTwoId = new Types.ObjectId();
  const ownerId = new Types.ObjectId();
  const referee = { _id: new Types.ObjectId(), mode: REFEREE_MODE.OWN_PHONE };

  // What MatchRefereeService.assertCanOfficiate hands back: the match, and
  // the referee recording it (null = unofficiated, caller is a player).
  const officiating = (match: Record<string, any> = {}, ref: any = referee) => ({
    match: { _id: matchId, session: sessionId, status: MATCH_STATUS.LIVE, ...match },
    referee: ref,
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
      create: jest.fn(async (doc) => ({ _id: new Types.ObjectId(), ...doc })),
      viewMatchDetailsDeep: jest.fn(),
    };
    setRepository = { find: jest.fn() };
    sessionRepository = { findOne: jest.fn(), findRaw: jest.fn() };
    matchReferee = {
      assertCanOfficiate: jest.fn().mockResolvedValue(officiating()),
      assertEligible: jest.fn().mockResolvedValue(undefined),
      carryOver: jest.fn().mockResolvedValue(null),
      resultStatusFor: jest.fn().mockReturnValue(MATCH_RESULT_STATUS.CONFIRMED),
      playersOf: jest.fn(),
      notifyReviewers: jest.fn().mockResolvedValue(undefined),
    };
    matchStats = { postMatchStats: jest.fn().mockResolvedValue(0) };
    matchEventService = {
      emitMatchScoreUpdate: jest.fn().mockResolvedValue(undefined),
    };
    sessionPaymentService = { areAllPaymentsCompleted: jest.fn() };

    service = new MatchesService(
      matchRepository as any,
      setRepository as any,
      sessionRepository as any,
      matchEventService as any,
      sessionPaymentService as any,
      new RotationService(),
      matchReferee as any,
      matchStats as any,
    );
  });

  describe('matchUp', () => {
    const threeSets = () => [
      { _id: new Types.ObjectId() },
      { _id: new Types.ObjectId() },
      { _id: new Types.ObjectId() },
    ];

    it('creates game 1 only, with the other teams waiting', async () => {
      setRepository.find.mockResolvedValue(threeSets());
      sessionRepository.findOne.mockResolvedValue({
        _id: sessionId,
        matchType: MATCH_TYPE.FRIENDLY,
        paymentRequired: false,
      });
      matchRepository.findOne.mockResolvedValue(null);

      const result = await service.matchUp(sessionId.toString());

      expect(result).toHaveLength(1);
      expect(matchRepository.create).toHaveBeenCalledTimes(1);
      const created = matchRepository.create.mock.calls[0][0];
      expect(created).toMatchObject({
        session: sessionId.toString(),
        matchType: MATCH_TYPE.FRIENDLY,
        sequence: 1,
        status: MATCH_STATUS.SCHEDULED,
      });
      expect(created.waiting).toHaveLength(1);
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

      expect(matchRepository.create).not.toHaveBeenCalled();
    });

    it('rejects a session with fewer than 2 teams', async () => {
      setRepository.find.mockResolvedValue([{ _id: teamOneId }]);
      sessionRepository.findOne.mockResolvedValue({
        _id: sessionId,
        paymentRequired: false,
      });

      await expect(service.matchUp(sessionId.toString())).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      expect(matchRepository.create).not.toHaveBeenCalled();
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
      matchRepository.findOne.mockResolvedValue({ _id: matchId });

      await expect(service.matchUp(sessionId.toString())).rejects.toMatchObject(
        {
          status: HttpStatus.BAD_REQUEST,
        },
      );
      expect(matchRepository.create).not.toHaveBeenCalled();
    });

    it('turns a racing duplicate matchup into a 400', async () => {
      setRepository.find.mockResolvedValue(threeSets());
      sessionRepository.findOne.mockResolvedValue({ _id: sessionId, paymentRequired: false });
      matchRepository.findOne.mockResolvedValue(null);
      matchRepository.create.mockRejectedValue({ code: 11000 });

      await expect(service.matchUp(sessionId.toString())).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });
  });

  describe('match lifecycle', () => {
    it('starts only a SCHEDULED match, re-checking the referee at kick-off', async () => {
      matchReferee.assertCanOfficiate.mockResolvedValue(officiating({ status: MATCH_STATUS.SCHEDULED }));
      matchRepository.findOneAndPopulate.mockResolvedValue({
        teamOne: { name: 'Alpha' },
        teamTwo: { name: 'Beta' },
      });
      matchRepository.findOneAndUpdate.mockResolvedValue({
        _id: matchId,
        status: MATCH_STATUS.LIVE,
      });
      matchRepository.findOne.mockResolvedValue({ _id: matchId, status: MATCH_STATUS.LIVE });

      await expect(service.startMatch(matchId.toString(), ownerId.toString())).resolves.toEqual({
        message: 'Alpha vs Beta is underway',
        match: { _id: matchId, status: MATCH_STATUS.LIVE },
      });

      expect(matchRepository.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: matchId.toString(), status: MATCH_STATUS.SCHEDULED },
        expect.objectContaining({ status: MATCH_STATUS.LIVE, isStarted: true }),
      );
      expect(matchReferee.assertEligible).toHaveBeenCalledWith(referee, expect.objectContaining({ _id: matchId }));
    });

    it('does not start when the referee is no longer eligible', async () => {
      matchReferee.assertCanOfficiate.mockResolvedValue(officiating({ status: MATCH_STATUS.SCHEDULED }));
      matchReferee.assertEligible.mockRejectedValue({ status: HttpStatus.BAD_REQUEST });

      await expect(
        service.startMatch(matchId.toString(), ownerId.toString()),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(matchRepository.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('returns a live match as-is when start is retried', async () => {
      matchRepository.findOneAndPopulate.mockResolvedValue({ teamOne: { name: 'Alpha' }, teamTwo: { name: 'Beta' } });
      matchRepository.findOne.mockResolvedValue({ _id: matchId, status: MATCH_STATUS.LIVE });

      await expect(service.startMatch(matchId.toString(), ownerId.toString())).resolves.toMatchObject({
        match: { status: MATCH_STATUS.LIVE },
      });
      expect(matchRepository.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rejects starting a finished match', async () => {
      matchReferee.assertCanOfficiate.mockResolvedValue(officiating({ status: MATCH_STATUS.FINISHED }));
      matchRepository.findOneAndUpdate.mockResolvedValue(null);
      matchRepository.findOne.mockResolvedValue({ _id: matchId, status: MATCH_STATUS.FINISHED });

      await expect(
        service.startMatch(matchId.toString(), ownerId.toString()),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    describe('endMatch', () => {
      const teamC = new Types.ObjectId();
      const liveMatch = (overrides: Record<string, any> = {}) => ({
        _id: matchId,
        session: sessionId,
        sequence: 1,
        status: MATCH_STATUS.LIVE,
        teamOne: teamOneId,
        teamTwo: teamTwoId,
        waiting: [teamC],
        teamOneScore: 2,
        teamTwoScore: 1,
        ...overrides,
      });
      const session = (overrides: Record<string, any> = {}) => ({
        _id: sessionId,
        matchType: MATCH_TYPE.FRIENDLY,
        rotationFormat: ROTATION_FORMAT.WINNER_STAYS,
        winningDecider: WINNING_DECIDER.PENALTY,
        stopTime: new Date(Date.now() + 60 * 60 * 1000),
        ...overrides,
      });

      beforeEach(() => {
        setRepository.find.mockResolvedValue([{ _id: teamOneId }, { _id: teamTwoId }, { _id: teamC }]);
        matchRepository.findOneAndUpdate.mockImplementation(async (_f, update) => ({ _id: matchId, ...update }));
        matchRepository.findOneAndPopulate.mockResolvedValue({
          teamOne: { name: 'Alpha' },
          teamTwo: { name: 'Beta' },
          teamOneScore: 2,
          teamTwoScore: 1,
        });
      });

      it('finishes the game and creates the next one: winner vs waiting team', async () => {
        matchReferee.assertCanOfficiate.mockResolvedValue(officiating(liveMatch()));
        sessionRepository.findOne.mockResolvedValue(session());

        const result = await service.endMatch(matchId.toString(), ownerId.toString(), 0);

        expect(matchRepository.findOneAndUpdate).toHaveBeenCalledWith(
          { _id: matchId.toString(), status: MATCH_STATUS.LIVE, scoreVersion: { $in: [0, null] }, referee: null },
          expect.objectContaining({
            status: MATCH_STATUS.FINISHED,
            winner: teamOneId,
            decidedBy: MATCH_DECIDED_BY.NORMAL_TIME,
            resultStatus: MATCH_RESULT_STATUS.CONFIRMED,
          }),
        );
        expect(matchReferee.resultStatusFor).toHaveBeenCalledWith(referee);
        expect(result.next).toMatchObject({
          sequence: 2,
          status: MATCH_STATUS.SCHEDULED,
          teamOne: teamOneId.toString(),
          teamTwo: teamC.toString(),
        });
        expect(result.next.waiting.map(String)).toEqual([teamTwoId.toString()]);
      });

      it('rejects ending a match that has not started', async () => {
        matchReferee.assertCanOfficiate.mockResolvedValue(officiating({ status: MATCH_STATUS.SCHEDULED }));

        await expect(
          service.endMatch(matchId.toString(), ownerId.toString(), 0),
        ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
        expect(matchRepository.create).not.toHaveBeenCalled();
      });

      it('refuses to end when a goal landed after the recorder pressed end', async () => {
        matchReferee.assertCanOfficiate.mockResolvedValue(officiating(liveMatch({ scoreVersion: 4 })));

        await expect(
          service.endMatch(matchId.toString(), ownerId.toString(), 3),
        ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
        expect(matchRepository.findOneAndUpdate).not.toHaveBeenCalled();
      });

      it('answers a retried end with the same result and creates nothing', async () => {
        const next = { _id: new Types.ObjectId(), sequence: 2 };
        matchReferee.assertCanOfficiate.mockResolvedValue(
          officiating(liveMatch({ status: MATCH_STATUS.FINISHED, scoreVersion: 3 })),
        );
        matchRepository.findOne.mockResolvedValue(next);

        const result = await service.endMatch(matchId.toString(), ownerId.toString(), 3);

        expect(result.next).toBe(next);
        expect(matchRepository.findOne).toHaveBeenCalledWith({ session: sessionId, sequence: 2 });
        expect(matchRepository.findOneAndUpdate).not.toHaveBeenCalled();
        expect(matchRepository.create).not.toHaveBeenCalled();
      });

      it('refuses an end from an out-of-date screen on a finished match', async () => {
        matchReferee.assertCanOfficiate.mockResolvedValue(
          officiating(liveMatch({ status: MATCH_STATUS.FINISHED, scoreVersion: 3 })),
        );

        await expect(
          service.endMatch(matchId.toString(), ownerId.toString(), 2),
        ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
      });

      it('a racing duplicate end gets the winner’s result, and nothing is created twice', async () => {
        const next = { _id: new Types.ObjectId(), sequence: 2 };
        matchReferee.assertCanOfficiate.mockResolvedValue(officiating(liveMatch()));
        sessionRepository.findOne.mockResolvedValue(session());
        matchRepository.findOneAndUpdate.mockResolvedValue(null);
        matchRepository.findOne
          .mockResolvedValueOnce(liveMatch({ status: MATCH_STATUS.FINISHED }))
          .mockResolvedValue(next);

        const result = await service.endMatch(matchId.toString(), ownerId.toString(), 0);

        expect(result.next).toBe(next);
        expect(matchRepository.create).not.toHaveBeenCalled();
      });

      it('requires penaltyWinner for a draw settled on penalties', async () => {
        matchReferee.assertCanOfficiate.mockResolvedValue(officiating(liveMatch({ teamOneScore: 1, teamTwoScore: 1 })));
        sessionRepository.findOne.mockResolvedValue(session());

        await expect(
          service.endMatch(matchId.toString(), ownerId.toString(), 0),
        ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
        expect(matchRepository.findOneAndUpdate).not.toHaveBeenCalled();

        const result = await service.endMatch(matchId.toString(), ownerId.toString(), 0, 'teamTwo');
        expect(matchRepository.findOneAndUpdate).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            winner: teamTwoId,
            decidedBy: MATCH_DECIDED_BY.PENALTIES,
            penaltyWinner: 'teamTwo',
          }),
        );
        expect(result.next).toMatchObject({ teamOne: teamTwoId.toString(), teamTwo: teamC.toString() });
      });

      it('carries the referee over to the next game when still eligible', async () => {
        const refId = new Types.ObjectId();
        matchReferee.assertCanOfficiate.mockResolvedValue(officiating(liveMatch({ referee: refId })));
        sessionRepository.findOne.mockResolvedValue(session());
        matchReferee.carryOver.mockResolvedValue(refId);

        const result = await service.endMatch(matchId.toString(), ownerId.toString(), 0);

        expect(matchRepository.findOneAndUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ referee: refId }),
          expect.anything(),
        );
        expect(matchReferee.carryOver).toHaveBeenCalledWith(refId, {
          session: sessionId,
          teamOne: teamOneId.toString(),
          teamTwo: teamC.toString(),
        });
        expect(result.next).toMatchObject({ referee: refId });
        expect(result.next.refereeHistory).toEqual([
          expect.objectContaining({ referee: refId, by: ownerId }),
        ]);
      });

      it('posts stats for a counted result, and only then', async () => {
        sessionRepository.findOne.mockResolvedValue(session());
        matchReferee.assertCanOfficiate.mockResolvedValue(officiating(liveMatch()));

        await service.endMatch(matchId.toString(), ownerId.toString(), 0);
        expect(matchStats.postMatchStats).toHaveBeenCalledWith(matchId);
        expect(matchReferee.notifyReviewers).not.toHaveBeenCalled();

        matchStats.postMatchStats.mockClear();
        matchReferee.resultStatusFor.mockReturnValue(MATCH_RESULT_STATUS.UNOFFICIAL);
        await service.endMatch(matchId.toString(), ownerId.toString(), 0);
        expect(matchStats.postMatchStats).not.toHaveBeenCalled();
      });

      it('Referee mode: counts at once, opens a 24h review window and pushes the other side', async () => {
        sessionRepository.findOne.mockResolvedValue(session());
        matchReferee.assertCanOfficiate.mockResolvedValue(officiating(liveMatch()));
        matchReferee.resultStatusFor.mockReturnValue(MATCH_RESULT_STATUS.PENDING_CONFIRMATION);

        await service.endMatch(matchId.toString(), ownerId.toString(), 0);

        const update = matchRepository.findOneAndUpdate.mock.calls[0][1];
        expect(update.reviewUntil.getTime() - update.endedAt.getTime()).toBe(24 * 60 * 60 * 1000);
        expect(matchStats.postMatchStats).toHaveBeenCalled();
        expect(matchReferee.notifyReviewers).toHaveBeenCalledWith(
          expect.objectContaining({ resultStatus: MATCH_RESULT_STATUS.PENDING_CONFIRMATION }),
        );
      });

      it('a failed stats post does not fail the end request', async () => {
        sessionRepository.findOne.mockResolvedValue(session());
        matchReferee.assertCanOfficiate.mockResolvedValue(officiating(liveMatch()));
        matchStats.postMatchStats.mockRejectedValue(new Error('db blip'));

        await expect(service.endMatch(matchId.toString(), ownerId.toString(), 0)).resolves.toHaveProperty('next');
      });

      it('creates no next game once the session time is up', async () => {
        matchReferee.assertCanOfficiate.mockResolvedValue(officiating(liveMatch()));
        sessionRepository.findOne.mockResolvedValue(session({ stopTime: new Date(Date.now() - 1000) }));

        const result = await service.endMatch(matchId.toString(), ownerId.toString(), 0);

        expect(result.next).toBeNull();
        expect(matchRepository.create).not.toHaveBeenCalled();
      });

      it('creates no next game for a match from before rotation existed', async () => {
        matchReferee.assertCanOfficiate.mockResolvedValue(officiating(liveMatch({ waiting: undefined })));
        sessionRepository.findOne.mockResolvedValue(session());

        const result = await service.endMatch(matchId.toString(), ownerId.toString(), 0);

        expect(result.next).toBeNull();
        expect(matchRepository.create).not.toHaveBeenCalled();
      });
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

  describe('score changes', () => {
    const playerId = new Types.ObjectId().toString();
    const teammate = new Types.ObjectId().toString();
    const details = { _id: matchId, session: sessionId, teamOne: { _id: teamOneId, name: 'Alpha' }, teamTwo: { _id: teamTwoId, name: 'Beta' }, teamOneScore: 1, teamTwoScore: 0 };
    const change = (expectedScoreVersion = 0, eventId = 'tap-0001') => ({ eventId, expectedScoreVersion });

    beforeEach(() => {
      matchReferee.playersOf.mockResolvedValue({ teamOne: new Set([playerId, teammate]), teamTwo: new Set() });
      matchRepository.findOneAndUpdate.mockResolvedValue({ _id: matchId });
      matchRepository.viewMatchDetailsDeep.mockResolvedValue(details);
    });

    it('records a goal as one versioned, conditional update', async () => {
      await service.recordGoalScorer(matchId.toString(), ownerId.toString(), {
        team: 'teamOne', playerId, assistedBy: teammate, ...change(0),
      });

      expect(matchRepository.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: matchId.toString(),
          status: MATCH_STATUS.LIVE,
          scoreVersion: { $in: [0, null] },
          'events.eventId': { $ne: 'tap-0001' },
        },
        expect.objectContaining({
          $inc: { teamOneScore: 1, scoreVersion: 1 },
          $push: expect.objectContaining({
            events: expect.objectContaining({ eventId: 'tap-0001', type: 'GOAL', team: 'teamOne' }),
            goalScorers: expect.objectContaining({ team: 'teamOne', eventId: 'tap-0001', recordedBy: referee._id }),
          }),
        }),
      );
      expect(matchEventService.emitMatchScoreUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ latestScorer: { player: playerId, team: 'teamOne' } }),
      );
    });

    it('a retry carrying an already-applied eventId is answered 200 and changes nothing', async () => {
      matchReferee.assertCanOfficiate.mockResolvedValue(
        officiating({ status: MATCH_STATUS.FINISHED, events: [{ eventId: 'tap-0001' }] }),
      );

      await expect(
        service.incrementMatchScore(matchId.toString(), 'teamOne', ownerId.toString(), change(0)),
      ).resolves.toBe(details);
      expect(matchRepository.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('a new tap from an out-of-date screen gets 409 with the current score', async () => {
      matchReferee.assertCanOfficiate.mockResolvedValue(officiating({ scoreVersion: 5, teamOneScore: 3 }));

      await expect(
        service.incrementMatchScore(matchId.toString(), 'teamOne', ownerId.toString(), change(4, 'tap-new')),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: expect.objectContaining({ details: expect.objectContaining({ scoreVersion: 5, teamOneScore: 3 }) }),
      });
      expect(matchRepository.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('losing a race to another phone gives 409; losing it to its own retry gives 200', async () => {
      matchRepository.findOneAndUpdate.mockResolvedValue(null);

      matchRepository.findOne.mockResolvedValueOnce({ status: MATCH_STATUS.LIVE, scoreVersion: 1, events: [{ eventId: 'other' }] });
      await expect(
        service.incrementMatchScore(matchId.toString(), 'teamOne', ownerId.toString(), change(0)),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });

      matchRepository.findOne.mockResolvedValueOnce({ status: MATCH_STATUS.LIVE, scoreVersion: 1, events: [{ eventId: 'tap-0001' }] });
      await expect(
        service.incrementMatchScore(matchId.toString(), 'teamOne', ownerId.toString(), change(0)),
      ).resolves.toBe(details);
    });

    it('rejects score changes when the match is not live', async () => {
      matchReferee.assertCanOfficiate.mockResolvedValue(officiating({ status: MATCH_STATUS.SCHEDULED }));

      await expect(
        service.incrementMatchScore(matchId.toString(), 'teamOne', ownerId.toString(), change()),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('rejects goal scorers when the match has no referee', async () => {
      matchReferee.assertCanOfficiate.mockResolvedValue(officiating({}, null));

      await expect(
        service.recordGoalScorer(matchId.toString(), ownerId.toString(), { team: 'teamOne', playerId, ...change() }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(matchRepository.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it.each([
      ['the scorer is not on that team', { team: 'teamTwo', playerId }],
      ['the assister is the scorer', { team: 'teamOne', playerId, assistedBy: playerId }],
      ['the assister is not a teammate', { team: 'teamOne', playerId, assistedBy: new Types.ObjectId().toString() }],
    ])('rejects a goal when %s', async (_label, goal: any) => {
      await expect(
        service.recordGoalScorer(matchId.toString(), ownerId.toString(), { ...goal, ...change() }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(matchRepository.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('undo removes the latest goal for that team and pulls its scorer', async () => {
      matchReferee.assertCanOfficiate.mockResolvedValue(
        officiating({
          scoreVersion: 3,
          teamOneScore: 1,
          events: [
            { eventId: 'g1', type: 'GOAL', team: 'teamOne' },
            { eventId: 'g2', type: 'GOAL', team: 'teamOne' },
            { eventId: 'u1', type: 'UNDO', team: 'teamOne', undoes: 'g2' },
          ],
        }),
      );

      await service.decrementMatchScore(matchId.toString(), 'teamOne', ownerId.toString(), change(3, 'u2'));

      expect(matchRepository.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ scoreVersion: 3, teamOneScore: { $gt: 0 }, 'events.eventId': { $ne: 'u2' } }),
        expect.objectContaining({
          $inc: { teamOneScore: -1, scoreVersion: 1 },
          $push: { events: expect.objectContaining({ type: 'UNDO', undoes: 'g1' }) },
          $pull: { goalScorers: { eventId: 'g1' } },
        }),
      );
    });

    it('refuses to undo when the team has no goals', async () => {
      matchReferee.assertCanOfficiate.mockResolvedValue(officiating({ teamOneScore: 0 }));

      await expect(
        service.decrementMatchScore(matchId.toString(), 'teamOne', ownerId.toString(), change()),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });
  });
});
