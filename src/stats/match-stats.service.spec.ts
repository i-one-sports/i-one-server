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

  let statRepository: { insertMissing: jest.Mock; voidMatch: jest.Mock; totalsFor: jest.Mock };
  let matchRepository: { findOne: jest.Mock; markStatsPosted: jest.Mock };
  let setRepository: { playersOf: jest.Mock };
  let userRepository: { positionsOf: jest.Mock };
  let service: MatchStatsService;

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
    statRepository = {
      insertMissing: jest.fn().mockResolvedValue(undefined),
      voidMatch: jest.fn().mockResolvedValue(undefined),
      totalsFor: jest.fn().mockResolvedValue(undefined),
    };
    matchRepository = { findOne: jest.fn(), markStatsPosted: jest.fn().mockResolvedValue(undefined) };
    setRepository = {
      playersOf: jest.fn().mockResolvedValue([
        { _id: teamOne, players: [ada, bayo] },
        { _id: teamTwo, players: [chidi, dayo] },
      ]),
    };
    userRepository = {
      positionsOf: jest.fn().mockResolvedValue(
        new Map([
          [ada.toString(), 'ST'],
          [bayo.toString(), 'MF'],
          [chidi.toString(), 'DF'],
          [dayo.toString(), 'DF'],
        ]),
      ),
    };
    service = new MatchStatsService(statRepository as any, matchRepository as any, setRepository as any, userRepository as any);
  });

  describe('buildRows', () => {
    const by = (rows: any[], u: Types.ObjectId) => rows.find((r) => r.user.toString() === u.toString());

    it('one row per player with goals, assists, conceded, result and Lagos season', async () => {
      const rows = await service.buildRows(finished());

      expect(rows).toHaveLength(4);
      expect(by(rows, ada)).toMatchObject({ goals: 2, assists: 0, conceded: 1, result: MATCH_OUTCOME.WON, side: 'teamOne', season: 2027 });
      expect(by(rows, bayo)).toMatchObject({ goals: 0, assists: 1, result: MATCH_OUTCOME.WON });
      expect(by(rows, chidi)).toMatchObject({ goals: 1, assists: 0, conceded: 2, result: MATCH_OUTCOME.LOST });
      expect(by(rows, dayo)).toMatchObject({ assists: 1, result: MATCH_OUTCOME.LOST });
    });

    it('a penalty-shootout winner gets WON; shootout goals were never in the score', async () => {
      const rows = await service.buildRows(
        finished({ teamOneScore: 1, teamTwoScore: 1, winner: teamTwo, penaltyWinner: 'teamTwo', goalScorers: [] }),
      );
      expect(by(rows, chidi)).toMatchObject({ result: MATCH_OUTCOME.WON, goals: 0 });
      expect(by(rows, ada)).toMatchObject({ result: MATCH_OUTCOME.LOST });
    });

    it('clean sheets go to defenders only, and the position is frozen on the row', async () => {
      const rows = await service.buildRows(finished({ teamOneScore: 1, teamTwoScore: 0, goalScorers: [] }));

      // teamOne (ada ST, bayo MF) kept a clean sheet; teamTwo (chidi DF, dayo DF) conceded 1.
      expect(by(rows, ada)).toMatchObject({ position: 'ST', conceded: 0, cleanSheet: false });
      expect(by(rows, bayo)).toMatchObject({ position: 'MF', conceded: 0, cleanSheet: false });
      expect(by(rows, chidi)).toMatchObject({ position: 'DF', conceded: 1, cleanSheet: false });

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
    it('inserts missing rows, then marks the match posted', async () => {
      const match = finished();
      matchRepository.findOne
        .mockResolvedValueOnce(match)
        .mockResolvedValueOnce({ resultStatus: MATCH_RESULT_STATUS.CONFIRMED });

      await expect(service.postMatchStats(match._id)).resolves.toBe(4);

      expect(statRepository.insertMissing).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ user: ada })]));
      expect(matchRepository.markStatsPosted).toHaveBeenCalledWith(match._id);
      expect(statRepository.voidMatch).not.toHaveBeenCalled();
    });

    it.each([MATCH_RESULT_STATUS.UNOFFICIAL, MATCH_RESULT_STATUS.DISPUTED])('writes nothing for %s', async (resultStatus) => {
      matchRepository.findOne.mockResolvedValueOnce(finished({ resultStatus }));
      await expect(service.postMatchStats(id())).resolves.toBe(0);
      expect(statRepository.insertMissing).not.toHaveBeenCalled();
    });

    it('voids its rows if a dispute landed while it was writing', async () => {
      const match = finished({ resultStatus: MATCH_RESULT_STATUS.PENDING_CONFIRMATION });
      matchRepository.findOne
        .mockResolvedValueOnce(match)
        .mockResolvedValueOnce({ resultStatus: MATCH_RESULT_STATUS.DISPUTED });

      await service.postMatchStats(match._id);

      expect(statRepository.voidMatch).toHaveBeenCalledWith(match._id);
    });
  });

  describe('totals', () => {
    it('returns zeros for a player with no counted matches', async () => {
      const userId = id().toString();
      await expect(service.totals(userId)).resolves.toEqual({
        userId, season: null, totalMatches: 0, goals: 0, assists: 0, wins: 0, draws: 0, losses: 0, cleanSheets: 0,
      });
    });

    it('passes the season through and maps the sums', async () => {
      const userId = id().toString();
      statRepository.totalsFor.mockResolvedValue({ totalMatches: 3, goals: 4, assists: 1, cleanSheets: 2, wins: 2, draws: 0, losses: 1 });

      await expect(service.totals(userId, 2026)).resolves.toMatchObject({ season: 2026, totalMatches: 3, goals: 4, wins: 2, cleanSheets: 2 });
      expect(statRepository.totalsFor).toHaveBeenCalledWith(new Types.ObjectId(userId), 2026);
    });
  });
});
