import { HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import { MATCH_RESULT_STATUS, MATCH_STATUS, REFEREE_MODE, REFEREE_STATUS } from '@app/common';
import { MatchRefereeService } from './match-referee.service';

describe('MatchRefereeService', () => {
  const id = () => new Types.ObjectId();
  const sessionId = id();
  const matchId = id();
  const teamOne = id();
  const teamTwo = id();
  const teamOnePlayer = id();
  const teamTwoPlayer = id();
  const spectator = id();
  const captain = id();

  let matchRepository: { findOne: jest.Mock; findOneAndUpdate: jest.Mock };
  let setRepository: { find: jest.Mock };
  let sessionRepository: { findOne: jest.Mock };
  let refereesService: { findById: jest.Mock; entryIdsFor: jest.Mock; isCaptain: jest.Mock; isOwner: jest.Mock };
  let matchStats: { postMatchStats: jest.Mock; voidMatchStats: jest.Mock };
  let outbox: { enqueueMany: jest.Mock };
  let matchEvents: { emitMatchEvent: jest.Mock };
  let service: MatchRefereeService;

  const ownPhone = (user: Types.ObjectId, overrides: Record<string, any> = {}) => ({
    _id: id(),
    session: sessionId,
    user,
    mode: REFEREE_MODE.OWN_PHONE,
    status: REFEREE_STATUS.ACCEPTED,
    ...overrides,
  });
  const captainDevice = (deviceOwner: Types.ObjectId, overrides: Record<string, any> = {}) => ({
    _id: id(),
    session: sessionId,
    guestName: 'Tola',
    mode: REFEREE_MODE.CAPTAIN_DEVICE,
    deviceOwner,
    status: REFEREE_STATUS.ACCEPTED,
    ...overrides,
  });
  const match = (overrides: Record<string, any> = {}) => ({
    _id: matchId,
    session: sessionId,
    teamOne,
    teamTwo,
    status: MATCH_STATUS.SCHEDULED,
    referee: null,
    ...overrides,
  });

  beforeEach(() => {
    matchRepository = { findOne: jest.fn(), findOneAndUpdate: jest.fn(async (_f, u) => ({ _id: matchId, ...u })) };
    setRepository = {
      find: jest.fn().mockResolvedValue([
        { _id: teamOne, players: [teamOnePlayer, captain] },
        { _id: teamTwo, players: [teamTwoPlayer] },
      ]),
    };
    sessionRepository = { findOne: jest.fn().mockResolvedValue({ _id: sessionId }) };
    refereesService = {
      findById: jest.fn(),
      entryIdsFor: jest.fn(async (entry) => [entry._id]),
      isCaptain: jest.fn(async (_s, userId) => userId === captain.toString()),
      isOwner: jest.fn().mockResolvedValue(false),
    };
    matchStats = { postMatchStats: jest.fn().mockResolvedValue(0), voidMatchStats: jest.fn().mockResolvedValue(undefined) };
    outbox = { enqueueMany: jest.fn().mockResolvedValue(0) };
    matchEvents = { emitMatchEvent: jest.fn().mockResolvedValue(undefined) };
    service = new MatchRefereeService(
      matchRepository as any,
      setRepository as any,
      sessionRepository as any,
      refereesService as any,
      matchStats as any,
      outbox as any,
      matchEvents as any,
    );
  });

  const loadMatch = (m: any) =>
    matchRepository.findOne.mockImplementation(async (filter) => (filter._id === matchId.toString() ? m : null));

  describe('assertCanOfficiate', () => {
    it('lets the referee record on their own phone, and nobody else', async () => {
      const ref = ownPhone(spectator);
      loadMatch(match({ referee: ref._id }));
      refereesService.findById.mockResolvedValue(ref);

      await expect(service.assertCanOfficiate(matchId.toString(), spectator.toString())).resolves.toMatchObject({
        referee: ref,
      });
      for (const other of [teamOnePlayer, captain]) {
        await expect(service.assertCanOfficiate(matchId.toString(), other.toString())).rejects.toMatchObject({
          status: HttpStatus.FORBIDDEN,
        });
      }
    });

    it("in Referee mode, accepts the captain's login the referee is using", async () => {
      const ref = captainDevice(captain, { user: spectator });
      loadMatch(match({ referee: ref._id }));
      refereesService.findById.mockResolvedValue(ref);

      await expect(service.assertCanOfficiate(matchId.toString(), captain.toString())).resolves.toMatchObject({
        referee: ref,
      });
      // The guest's own account isn't the device in use.
      await expect(service.assertCanOfficiate(matchId.toString(), spectator.toString())).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
      });
    });

    it('without a referee, only the two playing teams can run the scoreboard', async () => {
      loadMatch(match());

      await expect(service.assertCanOfficiate(matchId.toString(), teamTwoPlayer.toString())).resolves.toMatchObject({
        referee: null,
      });
      await expect(service.assertCanOfficiate(matchId.toString(), spectator.toString())).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
      });
    });

    it('gives the pitch owner no recording power of their own', async () => {
      const owner = id();
      refereesService.isOwner.mockResolvedValue(true);
      loadMatch(match());

      await expect(service.assertCanOfficiate(matchId.toString(), owner.toString())).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
      });
    });
  });

  describe('assertEligible', () => {
    it('accepts a spectator who is not busy elsewhere', async () => {
      matchRepository.findOne.mockResolvedValue(null);
      await expect(service.assertEligible(ownPhone(spectator) as any, match())).resolves.toBeUndefined();
    });

    it.each([
      ['has not accepted', () => ownPhone(spectator, { status: REFEREE_STATUS.INVITED })],
      ['is on another session', () => ownPhone(spectator, { session: id() })],
      ['plays in this match', () => ownPhone(teamTwoPlayer)],
    ])('rejects a referee who %s', async (_label, make) => {
      matchRepository.findOne.mockResolvedValue(null);
      await expect(service.assertEligible(make() as any, match())).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('rejects a referee already refereeing a live match', async () => {
      matchRepository.findOne.mockResolvedValue({ _id: id(), status: MATCH_STATUS.LIVE });
      await expect(service.assertEligible(ownPhone(spectator) as any, match())).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });
  });

  describe('assign / remove', () => {
    it('lets a captain assign an eligible referee, filtering on the referee read', async () => {
      const ref = ownPhone(spectator);
      loadMatch(match());
      refereesService.findById.mockResolvedValue(ref);

      await service.assign(matchId.toString(), captain.toString(), ref._id.toString());

      expect(matchRepository.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: matchId, status: { $ne: MATCH_STATUS.FINISHED }, referee: null },
        expect.objectContaining({
          referee: ref._id,
          $push: { refereeHistory: expect.objectContaining({ referee: ref._id, by: captain }) },
        }),
      );
    });

    it('lets the current referee hand off mid-match', async () => {
      const current = ownPhone(spectator);
      const next = ownPhone(id());
      loadMatch(match({ status: MATCH_STATUS.LIVE, referee: current._id }));
      refereesService.findById.mockImplementation(async (rid) =>
        rid.toString() === current._id.toString() ? current : next,
      );

      await service.assign(matchId.toString(), spectator.toString(), next._id.toString());

      expect(matchRepository.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ referee: current._id }),
        expect.objectContaining({ referee: next._id }),
      );
    });

    it('refuses anyone who is not a captain, the owner or the current referee', async () => {
      loadMatch(match());
      await expect(
        service.assign(matchId.toString(), teamTwoPlayer.toString(), id().toString()),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    });

    it('refuses changes once the match has finished', async () => {
      loadMatch(match({ status: MATCH_STATUS.FINISHED }));
      await expect(service.remove(matchId.toString(), captain.toString())).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('returns 409 when someone else changed the referee first', async () => {
      const ref = ownPhone(spectator);
      loadMatch(match());
      refereesService.findById.mockResolvedValue(ref);
      matchRepository.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.assign(matchId.toString(), captain.toString(), ref._id.toString()),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    });

    it('announces the change on the match streams', async () => {
      const ref = ownPhone(spectator);
      loadMatch(match());
      refereesService.findById.mockResolvedValue(ref);

      await service.assign(matchId.toString(), captain.toString(), ref._id.toString());

      expect(matchEvents.emitMatchEvent).toHaveBeenCalledWith({
        type: 'referee_changed',
        matchId,
        sessionId: undefined,
        referee: ref._id,
        by: captain,
      });
    });

    it('a refused change announces nothing', async () => {
      loadMatch(match());
      await expect(service.assign(matchId.toString(), teamTwoPlayer.toString(), id().toString())).rejects.toBeDefined();
      expect(matchEvents.emitMatchEvent).not.toHaveBeenCalled();
    });

    it('removing the referee records a null entry in the history', async () => {
      const ref = ownPhone(spectator);
      loadMatch(match({ referee: ref._id }));

      await service.remove(matchId.toString(), captain.toString());

      expect(matchRepository.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ referee: ref._id }),
        expect.objectContaining({ referee: null, $push: { refereeHistory: expect.objectContaining({ referee: null }) } }),
      );
    });
  });

  describe('carryOver', () => {
    it('keeps an eligible referee and drops one whose team is coming on', async () => {
      matchRepository.findOne.mockResolvedValue(null);
      const spectatorRef = ownPhone(spectator);
      const playerRef = ownPhone(teamTwoPlayer);
      const next = { session: sessionId, teamOne: teamOne.toString(), teamTwo: teamTwo.toString() };

      refereesService.findById.mockResolvedValue(spectatorRef);
      await expect(service.carryOver(spectatorRef._id, next)).resolves.toBe(spectatorRef._id);

      refereesService.findById.mockResolvedValue(playerRef);
      await expect(service.carryOver(playerRef._id, next)).resolves.toBeNull();

      await expect(service.carryOver(null, next)).resolves.toBeNull();
    });
  });

  it('maps the referee at the final whistle to a result status', () => {
    expect(service.resultStatusFor(null)).toBe(MATCH_RESULT_STATUS.UNOFFICIAL);
    expect(service.resultStatusFor(ownPhone(spectator) as any)).toBe(MATCH_RESULT_STATUS.CONFIRMED);
    expect(service.resultStatusFor(captainDevice(captain) as any)).toBe(MATCH_RESULT_STATUS.PENDING_CONFIRMATION);
  });

  describe('respondToResult', () => {
    const pending = (ref: any) =>
      loadMatch(match({ status: MATCH_STATUS.FINISHED, referee: ref._id, resultStatus: MATCH_RESULT_STATUS.PENDING_CONFIRMATION }));

    it("lets a player on the device owner's opposing team confirm", async () => {
      const ref = captainDevice(captain); // captain plays for teamOne
      pending(ref);
      refereesService.findById.mockResolvedValue(ref);

      await service.respondToResult(matchId.toString(), teamTwoPlayer.toString(), true);

      expect(matchRepository.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: matchId.toString(), resultStatus: MATCH_RESULT_STATUS.PENDING_CONFIRMATION },
        expect.objectContaining({ resultStatus: MATCH_RESULT_STATUS.CONFIRMED, confirmedBy: teamTwoPlayer }),
      );
    });

    it("refuses the device owner and their own teammates", async () => {
      const ref = captainDevice(captain);
      pending(ref);
      refereesService.findById.mockResolvedValue(ref);

      for (const who of [captain, teamOnePlayer, spectator]) {
        await expect(
          service.respondToResult(matchId.toString(), who.toString(), true),
        ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
      }
    });

    it('a dispute takes the result out of stats; a confirm keeps it', async () => {
      const ref = captainDevice(captain);
      pending(ref);
      refereesService.findById.mockResolvedValue(ref);

      await service.respondToResult(matchId.toString(), teamTwoPlayer.toString(), false);
      expect(matchStats.voidMatchStats).toHaveBeenCalledWith(matchId.toString());
      expect(matchStats.postMatchStats).not.toHaveBeenCalled();

      await service.respondToResult(matchId.toString(), teamTwoPlayer.toString(), true);
      expect(matchStats.postMatchStats).toHaveBeenCalledWith(matchId.toString());
    });

    it('refuses responses after the review window', async () => {
      const ref = captainDevice(captain);
      loadMatch(match({
        status: MATCH_STATUS.FINISHED,
        referee: ref._id,
        resultStatus: MATCH_RESULT_STATUS.PENDING_CONFIRMATION,
        reviewUntil: new Date(Date.now() - 1000),
      }));
      refereesService.findById.mockResolvedValue(ref);

      await expect(
        service.respondToResult(matchId.toString(), teamTwoPlayer.toString(), false),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(matchStats.voidMatchStats).not.toHaveBeenCalled();
    });

    it('pushes the review request only to players allowed to respond', async () => {
      const ref = captainDevice(captain);
      refereesService.findById.mockResolvedValue(ref);
      const reviewUntil = new Date(Date.now() + 1000);

      await service.notifyReviewers(match({ referee: ref._id, reviewUntil, teamOneScore: 2, teamTwoScore: 1 }));

      const items = outbox.enqueueMany.mock.calls[0][0];
      expect(items.map((i: any) => i.params.targetUserId)).toEqual([teamTwoPlayer.toString()]);
      expect(items[0].options).toEqual({ dedupeKey: `match-review:${matchId}:${teamTwoPlayer}`, deliverBefore: reviewUntil });
    });

    it("lets either team respond when the device owner's team wasn't playing", async () => {
      const ref = captainDevice(id());
      pending(ref);
      refereesService.findById.mockResolvedValue(ref);

      await service.respondToResult(matchId.toString(), teamOnePlayer.toString(), false);

      expect(matchRepository.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ resultStatus: MATCH_RESULT_STATUS.DISPUTED }),
      );
    });

    it('rejects results that are not waiting for confirmation', async () => {
      loadMatch(match({ status: MATCH_STATUS.FINISHED, resultStatus: MATCH_RESULT_STATUS.CONFIRMED }));
      await expect(
        service.respondToResult(matchId.toString(), teamTwoPlayer.toString(), true),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });
  });
});
