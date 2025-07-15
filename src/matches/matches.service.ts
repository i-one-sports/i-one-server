import { Injectable, HttpStatus } from '@nestjs/common';
import { MatchRepository } from './matches.repository';
import { SetRepository } from '../sets/sets.repository';
import { CustomHttpException, MatchI } from '@app/common';
import { Set } from '@app/common';
import { SessionRepository } from 'src/sessions/sessions.repository';
import { Model } from 'mongoose';
import { Session } from 'inspector/promises';

@Injectable()
export class MatchesService {
  constructor(
    private readonly matchRepository: MatchRepository,
    private readonly setRepository: SetRepository,
    private readonly sessionRepository: SessionRepository,
  ) {}

  private async viewSetForSession(sessionId: string): Promise<Set[]> {
    return await this.setRepository.find({ session: sessionId });
  }

  async matchUp(sessionId: string) {
    const sets = await this.viewSetForSession(sessionId);
    const session = await this.sessionRepository.findOne({ _id: sessionId });

    if (!session) {
      throw new CustomHttpException('Session not found', HttpStatus.NOT_FOUND);
    }

    const sessionMatchType = session.matchType;

    if (!sets || sets.length === 0) {
      throw new CustomHttpException(
        'No sets found for this session',
        HttpStatus.NOT_FOUND,
      );
    }

    const expectedLength = sets.length / 2;
    const availableSets = sets.map((set) => set._id);

    if (availableSets.length % 2 !== 0) {
      throw new CustomHttpException(
        'Cannot create pairs with an odd number of sets',
        HttpStatus.BAD_REQUEST,
      );
    }

    const existingMatchUp = await this.matchRepository.find({
      session: sessionId,
    });
    const alreadyMatched = existingMatchUp.length >= expectedLength;

    if (alreadyMatched) {
      throw new CustomHttpException(
        'Teams already matched for this session',
        HttpStatus.BAD_REQUEST,
      );
    }

    const matchUps = [];
    while (availableSets.length > 0) {
      const randomIndex1 = Math.floor(Math.random() * availableSets.length);
      const randomTeam1 = availableSets[randomIndex1];
      availableSets.splice(randomIndex1, 1);

      const randomIndex2 = Math.floor(Math.random() * availableSets.length);
      const randomTeam2 = availableSets[randomIndex2];
      availableSets.splice(randomIndex2, 1);

      matchUps.push({
        teamOne: randomTeam1,
        teamTwo: randomTeam2,
        matchType: sessionMatchType,
      });
    }

    return await this.matchRepository.insertMany(matchUps);
  }

  async viewSessionMatchUps(sessionId: string) {
    const matches = await this.matchRepository.findAndPopulate(
      { session: sessionId },
      ['teamOne', 'teamTwo'],
    );

    if (!matches || matches.length === 0) {
      throw new CustomHttpException(
        'No matchups exist in this session yet',
        HttpStatus.NOT_FOUND,
      );
    }

    return matches;
  }

  async startMatch(matchId: string) {
    const match: MatchI = await this.matchRepository.findOneAndPopulate(
      { _id: matchId },
      ['teamOne', 'teamTwo'],
    );

    if (!match) {
      throw new CustomHttpException('Match not found', HttpStatus.NOT_FOUND);
    }

    const updatedMatch = await this.matchRepository.findOneAndUpdate(
      { _id: matchId },
      { isStarted: true },
    );

    return {
      message: `${match.teamOne.name} vs ${match.teamTwo.name} is underway`,
      match: updatedMatch,
    };
  }

  async endMatch(matchId: string) {
    const match: MatchI = await this.matchRepository.findOneAndPopulate(
      { _id: matchId },
      ['teamOne', 'teamTwo'],
    );

    if (!match) {
      throw new CustomHttpException('Match not found', HttpStatus.NOT_FOUND);
    }

    const updatedMatch = await this.matchRepository.findOneAndUpdate(
      { _id: matchId },
      { isStarted: false },
    );

    return {
      message: `Final Score- ${match.teamOne.name}:${match.teamOneScore} vs ${match.teamTwo.name}:${match.teamTwoScore}`,
      match: updatedMatch,
    };
  }

  async viewMatchDetails(matchId: string) {
    const match = await this.matchRepository.findOneAndPopulate(
      { _id: matchId },
      ['teamOne', 'teamTwo'],
    );

    if (!match) {
      throw new CustomHttpException('Match not found', HttpStatus.NOT_FOUND);
    }

    return match;
  }
}
