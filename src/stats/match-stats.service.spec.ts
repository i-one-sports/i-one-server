import { Types } from 'mongoose';
import { MATCH_OUTCOME, MATCH_RESULT_STATUS, MATCH_STATUS } from '@app/common';
import { MatchStatsService } from './match-stats.service';

describe('MatchStatsService', () => {
  const id = () => new Types.ObjectId();
  const teamOne = id();
  const teamTwo = id();
  const ada = id();
  const bayo = id();
  const chidi = id();
  const dayo = id();

  let statModel: { bulkWrite: jest.Mock; updateMany: jest.Mock; aggregate: jest.Mock };
  let matchModel: { findById: jest.Mock; updateOne: jest.Mock; updateMany: jest.Mock; find: jest.Mock };
  let setModel: { find: jest.Mock };
  let userModel: { find: jest.Mock };
  let service: MatchStatsService;

  const lean = (value: any) => ({ lean: jest.fn().mockResolvedValue(value), select: jest.fn().mockReturnThis() });

  const finished = (overrides: Record<string, any> = {}) => ({
    _id: id(),
    session: id(),
    status: MATCH_STATUS.FINISHED,
    resultStatus: MATCH_RESULT_STATUS.CONFIRMED,
    teamOne,
    teamTwo,
    teamOneScore: 2,
    teamTwoScore: 1,
    winner: teamOne,
    endedAt: new Date('2026-12-31T23:30:00Z'), // 00:30 on 1 Jan 2027 in Lagos
    goalScorers: [
      { player: ada, team: 'teamOne', assistedBy: bayo },
      { player: ada, team: 'teamOne' },
      { player: chidi, team: 'teamTwo', assistedBy: dayo },
    ],
    ...overrides,
  });

  beforeEach(() => {
    statModel = {
      bulkWrite: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue([]),
    };
    matchModel = { findById: jest.fn(), updateOne: jest.fn(), updateMany: jest.fn(), find: jest.fn() };
    setModel = {
      find: jest.fn().mockReturnValue(
        lean([
          { _id: teamOne, players: [ada, bayo] },
          { _id: teamTwo, players: [chidi, dayo] },
        ]),
      ),
    };
    userModel = { find: jest.fn().mockReturnValue(lean([{ _id: ada, position: 'ST' }, { _id: bayo, position: 'MF' }, { _id: chidi, position: 'DF' }, { _id: dayo, position: 'DF' }])) };
    service = new MatchStatsService(statModel as any, matchModel as any, setModel as any, userModel as any);
  });

  describe('buildRows', () => {
    it('one row per player with goals, assists, conceded, result and Lagos season', async () => {
      const rows = await service.buildRows(finished());
      const by = (u: Types.ObjectId) => rows.find((r) => r.user.toString() === u.toString());

      expect(rows).toHaveLength(4);
      expect(by(ada)).toMatchObject({ goals: 2, assists: 0, conceded: 1, result: MATCH_OUTCOME.WON, side: 'teamOne', season: 2027 });
      expect(by(bayo)).toMatchObject({ goals: 0, assists: 1, result: MATCH_OUTCOME.WON });
      expect(by(chidi)).toMatchObject({ goals: 1, assists: 0, conceded: 2, result: MATCH_OUTCOME.LOST });
      expect(by(dayo)).toMatchObject({ assists: 1, result: MATCH_OUTCOME.LOST });
    });

    it('a penalty-shootout winner gets WON; shootout goals were never in the score', async () => {
      const rows = await service.buildRows(
        finished({ teamOneScore: 1, teamTwoScore: 1, winner: teamTwo, penaltyWinner: 'teamTwo', goalScorers: [] }),
      );
      expect(rows.find((r) => r.user.toString() === chidi.toString())).toMatchObject({ result: MATCH_OUTCOME.WON, goals: 0 });
      expect(rows.find((r) => r.user.toString() === ada.toString())).toMatchObject({ result: MATCH_OUTCOME.LOST });
    });

    it('clean sheets go to defenders only, and the position is frozen on the row', async () => {
      const rows = await service.buildRows(finished({ teamOneScore: 1, teamTwoScore: 0, goalScorers: [] }));
      const by = (u: Types.ObjectId) => rows.find((r) => r.user.toString() === u.toString());

      // teamOne (ada ST, bayo MF) kept a clean sheet; teamTwo (chidi DF, dayo DF) conceded 1.
      expect(by(ada)).toMatchObject({ position: 'ST', conceded: 0, cleanSheet: false });
      expect(by(bayo)).toMatchObject({ position: 'MF', conceded: 0, cleanSheet: false });
      expect(by(chidi)).toMatchObject({ position: 'DF', conceded: 1, cleanSheet: false });

      const zeroZero = await service.buildRows(finished({ teamOneScore: 0, teamTwoScore: 0, winner: null, goalScorers: [] }));
      expect(zeroZero.filter((r) => r.cleanSheet).map((r) => r.user.toString()).sort()).toEqual(
        [chidi.toString(), dayo.toString()].sort(),
      );
    });

    it('a draw that stayed a draw is DRAWN for everyone', async () => {
      const rows = await service.buildRows(finished({ teamOneScore: 0, teamTwoScore: 0, winner: null, goalScorers: [] }));
      expect(rows.every((r) => r.result === MATCH_OUTCOME.DRAWN && r.conceded === 0)).toBe(true);
    });
  });

  describe('postMatchStats', () => {
    it('inserts missing rows only, never touching existing ones, then marks the match posted', async () => {
      const match = finished();
      matchModel.findById
        .mockReturnValueOnce(lean(match))
        .mockReturnValueOnce(lean({ resultStatus: MATCH_RESULT_STATUS.CONFIRMED }));

      await expect(service.postMatchStats(match._id)).resolves.toBe(4);

      const ops = statModel.bulkWrite.mock.calls[0][0];
      expect(ops[0].updateOne).toMatchObject({ upsert: true, update: { $setOnInsert: expect.any(Object) } });
      expect(Object.keys(ops[0].updateOne.update)).toEqual(['$setOnInsert']);
      expect(matchModel.updateOne).toHaveBeenCalledWith({ _id: match._id }, { $set: { statsPostedAt: expect.any(Date) } });
      expect(statModel.updateMany).not.toHaveBeenCalled();
    });

    it.each([MATCH_RESULT_STATUS.UNOFFICIAL, MATCH_RESULT_STATUS.DISPUTED])('writes nothing for %s', async (resultStatus) => {
      matchModel.findById.mockReturnValueOnce(lean(finished({ resultStatus })));
      await expect(service.postMatchStats(id())).resolves.toBe(0);
      expect(statModel.bulkWrite).not.toHaveBeenCalled();
    });

    it('voids its rows if a dispute landed while it was writing', async () => {
      const match = finished({ resultStatus: MATCH_RESULT_STATUS.PENDING_CONFIRMATION });
      matchModel.findById
        .mockReturnValueOnce(lean(match))
        .mockReturnValueOnce(lean({ resultStatus: MATCH_RESULT_STATUS.DISPUTED }));

      await service.postMatchStats(match._id);

      expect(statModel.updateMany).toHaveBeenCalledWith({ match: match._id }, { $set: { void: true } });
    });
  });

  describe('totals', () => {
    it('returns zeros for a player with no counted matches', async () => {
      const userId = id().toString();
      await expect(service.totals(userId)).resolves.toEqual({
        userId, season: null, totalMatches: 0, goals: 0, assists: 0, wins: 0, draws: 0, losses: 0, cleanSheets: 0,
      });
    });

    it('sums only non-void rows, filtered by season when given', async () => {
      const userId = id().toString();
      statModel.aggregate.mockResolvedValue([{ totalMatches: 3, goals: 4, assists: 1, wins: 2, draws: 0, losses: 1 }]);

      await expect(service.totals(userId, 2026)).resolves.toMatchObject({ season: 2026, totalMatches: 3, goals: 4, wins: 2 });
      expect(statModel.aggregate.mock.calls[0][0][0].$match).toEqual({
        user: new Types.ObjectId(userId),
        void: false,
        season: 2026,
      });
    });
  });
});
