import { HttpStatus } from '@nestjs/common';
import { MATCH_DECIDED_BY, ROTATION_FORMAT, WINNING_DECIDER } from '@app/common';
import { FinishedGame, RotationService } from './rotation.service';

describe('RotationService', () => {
  const rotation = new RotationService();
  const { WINNER_STAYS, ROUND_ROBIN } = ROTATION_FORMAT;

  const game = (overrides: Partial<FinishedGame> = {}): FinishedGame => ({
    sequence: 1,
    teamOne: 'A',
    teamTwo: 'B',
    waiting: ['C', 'D'],
    teamOneScore: 0,
    teamTwoScore: 0,
    ...overrides,
  });

  describe('firstMatch', () => {
    it('puts two teams on and queues the rest (winner stays)', () => {
      const pairing = rotation.firstMatch(['A', 'B', 'C', 'D'], WINNER_STAYS);
      const all = [pairing.teamOne, pairing.teamTwo, ...pairing.waiting].sort();
      expect(all).toEqual(['A', 'B', 'C', 'D']);
      expect(pairing.waiting).toHaveLength(2);
    });

    it('needs at least 2 teams', () => {
      expect(() => rotation.firstMatch(['A'], WINNER_STAYS)).toThrow(
        expect.objectContaining({ status: HttpStatus.BAD_REQUEST }),
      );
    });

    it('starts round robin at the first fixture', () => {
      const [first] = rotation.roundRobinPairings(['A', 'B', 'C', 'D']);
      const pairing = rotation.firstMatch(['D', 'C', 'B', 'A'], ROUND_ROBIN);
      expect([pairing.teamOne, pairing.teamTwo]).toEqual(first);
    });
  });

  describe('resolveResult', () => {
    it('gives the win to the higher score', () => {
      expect(
        rotation.resolveResult(game({ teamOneScore: 1, teamTwoScore: 3 }), WINNER_STAYS, WINNING_DECIDER.PENALTY),
      ).toEqual({ winner: 'B', decidedBy: MATCH_DECIDED_BY.NORMAL_TIME });
    });

    it('rejects penaltyWinner when the game was not a draw', () => {
      expect(() =>
        rotation.resolveResult(game({ teamOneScore: 2 }), WINNER_STAYS, WINNING_DECIDER.PENALTY, 'teamTwo'),
      ).toThrow(expect.objectContaining({ status: HttpStatus.BAD_REQUEST }));
    });

    it('requires penaltyWinner on a draw settled by penalties', () => {
      expect(() => rotation.resolveResult(game(), WINNER_STAYS, WINNING_DECIDER.PENALTY)).toThrow(
        expect.objectContaining({ status: HttpStatus.BAD_REQUEST }),
      );
      expect(rotation.resolveResult(game(), WINNER_STAYS, WINNING_DECIDER.PENALTY, 'teamTwo')).toEqual({
        winner: 'B',
        decidedBy: MATCH_DECIDED_BY.PENALTIES,
        penaltyWinner: 'teamTwo',
      });
    });

    it('keeps a both-off draw as a draw and rejects penaltyWinner', () => {
      expect(rotation.resolveResult(game(), WINNER_STAYS, WINNING_DECIDER.BOTH_OFF)).toEqual({
        winner: null,
        decidedBy: MATCH_DECIDED_BY.DRAW,
      });
      expect(() =>
        rotation.resolveResult(game(), WINNER_STAYS, WINNING_DECIDER.BOTH_OFF, 'teamOne'),
      ).toThrow(expect.objectContaining({ status: HttpStatus.BAD_REQUEST }));
    });

    it('ignores the decider in round robin: draws stay draws', () => {
      expect(rotation.resolveResult(game(), ROUND_ROBIN, WINNING_DECIDER.PENALTY)).toEqual({
        winner: null,
        decidedBy: MATCH_DECIDED_BY.DRAW,
      });
    });
  });

  describe('nextMatch — winner stays on', () => {
    const won = (winner: string) => ({ winner, decidedBy: MATCH_DECIDED_BY.NORMAL_TIME });
    const draw = { winner: null, decidedBy: MATCH_DECIDED_BY.DRAW };
    const sets = ['A', 'B', 'C', 'D'];

    it('2 teams: the same two play again, winner as teamOne', () => {
      expect(rotation.nextMatch(game({ waiting: [] }), won('B'), ['A', 'B'], WINNER_STAYS)).toEqual({
        teamOne: 'B',
        teamTwo: 'A',
        waiting: [],
      });
    });

    it('3 teams: winner vs the waiting team, loser waits', () => {
      expect(rotation.nextMatch(game({ waiting: ['C'] }), won('A'), ['A', 'B', 'C'], WINNER_STAYS)).toEqual({
        teamOne: 'A',
        teamTwo: 'C',
        waiting: ['B'],
      });
    });

    it('4 teams: winner vs front of queue, loser to the back', () => {
      expect(rotation.nextMatch(game(), won('B'), sets, WINNER_STAYS)).toEqual({
        teamOne: 'B',
        teamTwo: 'C',
        waiting: ['D', 'A'],
      });
    });

    it('no cap: a team keeps winning and keeps staying on', () => {
      let pairing = { teamOne: 'A', teamTwo: 'B', waiting: ['C', 'D'] };
      for (let seq = 1; seq <= 6; seq++) {
        pairing = rotation.nextMatch({ ...game(), ...pairing, sequence: seq }, won('A'), sets, WINNER_STAYS);
        expect(pairing.teamOne).toBe('A');
      }
    });

    it('both off, 2 teams: they play again', () => {
      expect(rotation.nextMatch(game({ waiting: [] }), draw, ['A', 'B'], WINNER_STAYS)).toEqual({
        teamOne: 'A',
        teamTwo: 'B',
        waiting: [],
      });
    });

    it('both off, 3 teams: the team that stayed on leaves, the one that just came on stays', () => {
      expect(rotation.nextMatch(game({ waiting: ['C'] }), draw, ['A', 'B', 'C'], WINNER_STAYS)).toEqual({
        teamOne: 'B',
        teamTwo: 'C',
        waiting: ['A'],
      });
    });

    it('both off, 5 teams: next two come on, drawn teams to the back', () => {
      expect(
        rotation.nextMatch(game({ waiting: ['C', 'D', 'E'] }), draw, ['A', 'B', 'C', 'D', 'E'], WINNER_STAYS),
      ).toEqual({ teamOne: 'C', teamTwo: 'D', waiting: ['E', 'A', 'B'] });
    });
  });

  describe('round robin', () => {
    const pairKey = ([a, b]: [string, string]) => [a, b].sort().join('-');

    it.each([
      [['A', 'B'], 1],
      [['A', 'B', 'C'], 3],
      [['A', 'B', 'C', 'D'], 6],
      [['A', 'B', 'C', 'D', 'E'], 10],
    ])('%j: every pair plays exactly once per cycle', (ids: string[], expected: number) => {
      const pairings = rotation.roundRobinPairings(ids);
      expect(pairings).toHaveLength(expected);
      expect(new Set(pairings.map(pairKey)).size).toBe(expected);
    });

    it('follows the fixture list and wraps around when time allows', () => {
      const ids = ['A', 'B', 'C'];
      const fixtures = rotation.roundRobinPairings(ids);
      const draw = { winner: null, decidedBy: MATCH_DECIDED_BY.DRAW };

      for (let seq = 1; seq <= 5; seq++) {
        const next = rotation.nextMatch(game({ sequence: seq }), draw, ids, ROUND_ROBIN);
        expect([next.teamOne, next.teamTwo]).toEqual(fixtures[seq % fixtures.length]);
        expect(next.waiting).toEqual(ids.filter((id) => id !== next.teamOne && id !== next.teamTwo));
      }
    });
  });
});
