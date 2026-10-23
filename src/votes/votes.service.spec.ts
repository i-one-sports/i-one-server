import { HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import { SESSION_POLL_OUTCOME, SESSION_POLL_STATUS } from '@app/common';
import { MIN_TURNOUT, VotesService } from './votes.service';

describe('VotesService', () => {
  const id = () => new Types.ObjectId();
  const sessionId = id();
  const [ada, bayo, chidi, dayo, emeka] = [id(), id(), id(), id(), id()];
  const eligible = [ada, bayo, chidi, dayo, emeka];

  let pollModel: any;
  let voteModel: any;
  let outbox: { enqueueMany: jest.Mock };
  let service: VotesService;

  const lean = (value: any) => ({ lean: jest.fn().mockResolvedValue(value), select: jest.fn().mockReturnThis() });
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
    pollModel = { findOne: jest.fn(), updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }) };
    voteModel = {
      create: jest.fn().mockResolvedValue({}),
      findOne: jest.fn().mockReturnValue(lean(null)),
      countDocuments: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue([]),
    };
    outbox = { enqueueMany: jest.fn().mockResolvedValue(0) };
    service = new VotesService(
      pollModel,
      voteModel,
      {} as any,
      {} as any,
      {} as any,
      { aggregate: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockReturnValue(lean([])) } as any,
      outbox as any,
    );
  });

  describe('vote', () => {
    beforeEach(() => pollModel.findOne.mockReturnValue(lean(openPoll())));

    it('accepts one vote from a player for another player', async () => {
      await service.vote(sessionId.toString(), ada.toString(), bayo.toString());
      expect(voteModel.create).toHaveBeenCalledWith(expect.objectContaining({ voter: ada, candidate: bayo }));
    });

    it.each([
      ['voting for yourself', () => [ada, ada], HttpStatus.BAD_REQUEST],
      ['a non-player voting', () => [id(), ada], HttpStatus.FORBIDDEN],
      ['voting for someone who did not play', () => [ada, id()], HttpStatus.BAD_REQUEST],
    ])('refuses %s', async (_label, pair, status) => {
      const [voter, candidate] = pair();
      await expect(service.vote(sessionId.toString(), voter.toString(), candidate.toString())).rejects.toMatchObject({ status });
      expect(voteModel.create).not.toHaveBeenCalled();
    });

    it('refuses votes after closesAt, even before the poll is counted', async () => {
      pollModel.findOne.mockReturnValue(lean(openPoll({ closesAt: new Date(Date.now() - 1000) })));
      await expect(service.vote(sessionId.toString(), ada.toString(), bayo.toString())).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('the same vote again is a harmless retry; a different one is refused', async () => {
      voteModel.create.mockRejectedValue({ code: 11000 });
      voteModel.findOne.mockReturnValue(lean({ candidate: bayo }));

      await expect(service.vote(sessionId.toString(), ada.toString(), bayo.toString())).resolves.toBeDefined();
      await expect(service.vote(sessionId.toString(), ada.toString(), chidi.toString())).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
    });
  });

  describe('view', () => {
    it('shows turnout and your own vote while open, never the tally', async () => {
      pollModel.findOne.mockReturnValue(lean(openPoll({ result: { tallies: [{ candidate: bayo, votes: 3 }] } })));
      voteModel.countDocuments.mockResolvedValue(3);
      voteModel.findOne.mockReturnValue(lean({ candidate: bayo }));

      const view = await service.view(sessionId.toString(), ada.toString());

      expect(view).toMatchObject({ status: 'OPEN', eligibleCount: 5, votesCast: 3, myVote: bayo, canVote: false, result: null });
    });
  });

  describe('closePoll', () => {
    const tally = (...rows: [Types.ObjectId, number][]) => rows.map(([c, votes]) => ({ _id: c, votes }));

    it('awards the most-voted player, with percentages of votes cast', async () => {
      voteModel.aggregate.mockResolvedValue(tally([chidi, 2], [ada, 1]));
      const poll = openPoll();

      await service.closePoll(poll, new Date());

      const set = pollModel.updateOne.mock.calls[0][1].$set;
      expect(pollModel.updateOne.mock.calls[0][0]).toEqual({ _id: poll._id, status: SESSION_POLL_STATUS.OPEN });
      expect(set.result).toMatchObject({ outcome: SESSION_POLL_OUTCOME.AWARDED, winners: [chidi], votesCast: 3 });
      expect(outbox.enqueueMany.mock.calls[0][0]).toHaveLength(5);
    });

    it('a tie shares the award', async () => {
      voteModel.aggregate.mockResolvedValue(tally([chidi, 2], [ada, 2]));
      await service.closePoll(openPoll(), new Date());
      expect(pollModel.updateOne.mock.calls[0][1].$set.result.winners).toEqual([chidi, ada]);
    });

    it(`no award under ${MIN_TURNOUT * 100}% turnout`, async () => {
      voteModel.aggregate.mockResolvedValue(tally([chidi, 1])); // 1 of 5 = 20%
      await service.closePoll(openPoll(), new Date());
      expect(pollModel.updateOne.mock.calls[0][1].$set.result).toMatchObject({
        outcome: SESSION_POLL_OUTCOME.NO_AWARD,
        winners: [],
      });
    });

    it('exactly 40% is enough', async () => {
      voteModel.aggregate.mockResolvedValue(tally([chidi, 2])); // 2 of 5
      await service.closePoll(openPoll(), new Date());
      expect(pollModel.updateOne.mock.calls[0][1].$set.result.outcome).toBe(SESSION_POLL_OUTCOME.AWARDED);
    });

    it('a second close changes nothing and sends no pushes', async () => {
      pollModel.updateOne.mockResolvedValue({ modifiedCount: 0 });
      await expect(service.closePoll(openPoll(), new Date())).resolves.toBe(false);
      expect(outbox.enqueueMany).not.toHaveBeenCalled();
    });
  });
});
