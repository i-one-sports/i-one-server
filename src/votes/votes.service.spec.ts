import { HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import { SESSION_POLL_OUTCOME, SESSION_POLL_STATUS } from '@app/common';
import { MIN_TURNOUT, VotesService } from './votes.service';

describe('VotesService', () => {
  const id = () => new Types.ObjectId();
  const sessionId = id();
  const [ada, bayo, chidi, dayo, emeka] = [id(), id(), id(), id(), id()];
  const eligible = [ada, bayo, chidi, dayo, emeka];

  let pollRepository: { findOne: jest.Mock; close: jest.Mock };
  let voteRepository: { create: jest.Mock; voteOf: jest.Mock; countFor: jest.Mock; tally: jest.Mock };
  let outbox: { enqueueMany: jest.Mock };
  let service: VotesService;

  const openPoll = (overrides: Record<string, any> = {}) => ({
    _id: id(),
    session: sessionId,
    eligible,
    status: SESSION_POLL_STATUS.OPEN,
    opensAt: new Date(Date.now() - 60_000),
    closesAt: new Date(Date.now() + 60 * 60_000),
    ...overrides,
  });

  beforeEach(() => {
    pollRepository = { findOne: jest.fn(), close: jest.fn().mockResolvedValue(true) };
    voteRepository = {
      create: jest.fn().mockResolvedValue({}),
      voteOf: jest.fn().mockResolvedValue(null),
      countFor: jest.fn().mockResolvedValue(0),
      tally: jest.fn().mockResolvedValue([]),
    };
    outbox = { enqueueMany: jest.fn().mockResolvedValue(0) };
    service = new VotesService(
      pollRepository as any,
      voteRepository as any,
      {} as any,
      {} as any,
      {} as any,
      { sessionTotals: jest.fn().mockResolvedValue([]) } as any,
      { publicProfiles: jest.fn().mockResolvedValue([]) } as any,
      outbox as any,
      { checkSession: jest.fn().mockResolvedValue(0) } as any,
    );
  });

  describe('vote', () => {
    beforeEach(() => pollRepository.findOne.mockResolvedValue(openPoll()));

    it('accepts one vote from a player for another player', async () => {
      await service.vote(sessionId.toString(), ada.toString(), bayo.toString());
      expect(voteRepository.create).toHaveBeenCalledWith(expect.objectContaining({ voter: ada, candidate: bayo }));
    });

    it.each([
      ['voting for yourself', () => [ada, ada], HttpStatus.BAD_REQUEST],
      ['a non-player voting', () => [id(), ada], HttpStatus.FORBIDDEN],
      ['voting for someone who did not play', () => [ada, id()], HttpStatus.BAD_REQUEST],
    ])('refuses %s', async (_label, pair, status) => {
      const [voter, candidate] = pair();
      await expect(service.vote(sessionId.toString(), voter.toString(), candidate.toString())).rejects.toMatchObject({ status });
      expect(voteRepository.create).not.toHaveBeenCalled();
    });

    it('refuses votes after closesAt, even before the poll is counted', async () => {
      pollRepository.findOne.mockResolvedValue(openPoll({ closesAt: new Date(Date.now() - 1000) }));
      await expect(service.vote(sessionId.toString(), ada.toString(), bayo.toString())).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('the same vote again is a harmless retry; a different one is refused', async () => {
      voteRepository.create.mockRejectedValue({ code: 11000 });
      voteRepository.voteOf.mockResolvedValue({ candidate: bayo });

      await expect(service.vote(sessionId.toString(), ada.toString(), bayo.toString())).resolves.toBeDefined();
      await expect(service.vote(sessionId.toString(), ada.toString(), chidi.toString())).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
    });
  });

  describe('view', () => {
    it('shows turnout and your own vote while open, never the tally', async () => {
      pollRepository.findOne.mockResolvedValue(openPoll({ result: { tallies: [{ candidate: bayo, votes: 3 }] } }));
      voteRepository.countFor.mockResolvedValue(3);
      voteRepository.voteOf.mockResolvedValue({ candidate: bayo });

      const view = await service.view(sessionId.toString(), ada.toString());

      expect(view).toMatchObject({ status: 'OPEN', eligibleCount: 5, votesCast: 3, myVote: bayo, canVote: false, result: null });
    });
  });

  describe('closePoll', () => {
    const tally = (...rows: [Types.ObjectId, number][]) => rows.map(([c, votes]) => ({ _id: c, votes }));

    it('awards the most-voted player, with percentages of votes cast', async () => {
      voteRepository.tally.mockResolvedValue(tally([chidi, 2], [ada, 1]));
      const poll = openPoll();

      await service.closePoll(poll, new Date());

      expect(pollRepository.close.mock.calls[0][0]).toBe(poll._id);
      expect(pollRepository.close.mock.calls[0][1]).toMatchObject({ outcome: SESSION_POLL_OUTCOME.AWARDED, winners: [chidi], votesCast: 3 });
      expect(outbox.enqueueMany.mock.calls[0][0]).toHaveLength(5);
    });

    it('a tie shares the award', async () => {
      voteRepository.tally.mockResolvedValue(tally([chidi, 2], [ada, 2]));
      await service.closePoll(openPoll(), new Date());
      expect(pollRepository.close.mock.calls[0][1].winners).toEqual([chidi, ada]);
    });

    it(`no award under ${MIN_TURNOUT * 100}% turnout`, async () => {
      voteRepository.tally.mockResolvedValue(tally([chidi, 1])); // 1 of 5 = 20%
      await service.closePoll(openPoll(), new Date());
      expect(pollRepository.close.mock.calls[0][1]).toMatchObject({
        outcome: SESSION_POLL_OUTCOME.NO_AWARD,
        winners: [],
      });
    });

    it('exactly 40% is enough', async () => {
      voteRepository.tally.mockResolvedValue(tally([chidi, 2])); // 2 of 5
      await service.closePoll(openPoll(), new Date());
      expect(pollRepository.close.mock.calls[0][1].outcome).toBe(SESSION_POLL_OUTCOME.AWARDED);
    });

    it('a second close changes nothing and sends no pushes', async () => {
      pollRepository.close.mockResolvedValue(false);
      await expect(service.closePoll(openPoll(), new Date())).resolves.toBe(false);
      expect(outbox.enqueueMany).not.toHaveBeenCalled();
    });
  });
});
