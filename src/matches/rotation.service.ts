import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CustomHttpException,
  MATCH_DECIDED_BY,
  ROTATION_FORMAT,
  WINNING_DECIDER,
} from '@app/common';

type TeamSide = 'teamOne' | 'teamTwo';

export interface Pairing {
  teamOne: string;
  teamTwo: string;
  waiting: string[];
}

export interface FinishedGame {
  sequence: number;
  teamOne: string;
  teamTwo: string;
  waiting: string[];
  teamOneScore: number;
  teamTwoScore: number;
}

export interface GameResult {
  winner: string | null;
  decidedBy: MATCH_DECIDED_BY;
  penaltyWinner?: TeamSide;
}

// Decides who plays each game of a session. Pure — no database access — so
// MatchesService owns persistence and every rule here is unit-testable.
@Injectable()
export class RotationService {
  firstMatch(setIds: string[], format: ROTATION_FORMAT): Pairing {
    if (setIds.length < 2) {
      throw new CustomHttpException('A session needs at least 2 teams to play', HttpStatus.BAD_REQUEST);
    }

    if (format === ROTATION_FORMAT.ROUND_ROBIN) {
      return this.roundRobinGame(setIds, 0);
    }

    const [teamOne, teamTwo, ...waiting] = this.shuffle(setIds);
    return { teamOne, teamTwo, waiting };
  }

  // Validates the request against the score before anything is written, so a
  // bad end request can't leave the match half-finished.
  resolveResult(
    game: FinishedGame,
    format: ROTATION_FORMAT,
    decider: WINNING_DECIDER,
    penaltyWinner?: TeamSide,
  ): GameResult {
    const isDraw = game.teamOneScore === game.teamTwoScore;

    if (!isDraw) {
      if (penaltyWinner) {
        throw new CustomHttpException('penaltyWinner is only allowed when the game is a draw', HttpStatus.BAD_REQUEST);
      }
      const winner = game.teamOneScore > game.teamTwoScore ? game.teamOne : game.teamTwo;
      return { winner, decidedBy: MATCH_DECIDED_BY.NORMAL_TIME };
    }

    const decidedOnPenalties =
      format === ROTATION_FORMAT.WINNER_STAYS && decider === WINNING_DECIDER.PENALTY;

    if (!decidedOnPenalties) {
      if (penaltyWinner) {
        throw new CustomHttpException('This session does not settle draws on penalties', HttpStatus.BAD_REQUEST);
      }
      return { winner: null, decidedBy: MATCH_DECIDED_BY.DRAW };
    }

    if (!penaltyWinner) {
      throw new CustomHttpException(
        'The game is a draw — send penaltyWinner (teamOne or teamTwo) with the shootout result',
        HttpStatus.BAD_REQUEST,
      );
    }
    return { winner: game[penaltyWinner], decidedBy: MATCH_DECIDED_BY.PENALTIES, penaltyWinner };
  }

  nextMatch(game: FinishedGame, result: GameResult, setIds: string[], format: ROTATION_FORMAT): Pairing {
    if (format === ROTATION_FORMAT.ROUND_ROBIN) {
      // `game.sequence` is 1-based, so it is already the 0-based index of the next game.
      return this.roundRobinGame(setIds, game.sequence);
    }

    const { teamOne, teamTwo, waiting } = game;

    if (result.winner) {
      const loser = result.winner === teamOne ? teamTwo : teamOne;
      if (waiting.length === 0) return { teamOne: result.winner, teamTwo: loser, waiting: [] };
      const [challenger, ...rest] = waiting;
      return { teamOne: result.winner, teamTwo: challenger, waiting: [...rest, loser] };
    }

    // Draw with BOTH_OFF. teamOne stayed on, so it leaves first.
    if (waiting.length >= 2) {
      const [a, b, ...rest] = waiting;
      return { teamOne: a, teamTwo: b, waiting: [...rest, teamOne, teamTwo] };
    }
    if (waiting.length === 1) {
      // Three teams: both can't leave, so the team that stayed on goes and the
      // one that only just came on stays to face the waiting team.
      return { teamOne: teamTwo, teamTwo: waiting[0], waiting: [teamOne] };
    }
    return { teamOne, teamTwo, waiting: [] };
  }

  // Circle method: fix the first team, rotate the rest one step per round.
  // Odd counts get a bye (null) so one team sits out each round. Sorted first
  // so every call for the same session produces the same fixture list.
  roundRobinPairings(setIds: string[]): [string, string][] {
    const teams: (string | null)[] = [...setIds].sort();
    if (teams.length % 2 === 1) teams.push(null);

    const n = teams.length;
    const pairings: [string, string][] = [];
    for (let round = 0; round < n - 1; round++) {
      for (let i = 0; i < n / 2; i++) {
        const home = teams[i];
        const away = teams[n - 1 - i];
        if (home && away) pairings.push([home, away]);
      }
      teams.splice(1, 0, teams.pop());
    }
    return pairings;
  }

  private roundRobinGame(setIds: string[], index: number): Pairing {
    const pairings = this.roundRobinPairings(setIds);
    const [teamOne, teamTwo] = pairings[index % pairings.length];
    return { teamOne, teamTwo, waiting: setIds.filter((id) => id !== teamOne && id !== teamTwo) };
  }

  private shuffle(ids: string[]): string[] {
    const out = [...ids];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}
