import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { MatchRepository } from './matches.repository';
import { SetRepository } from '../sets/sets.repository';
import { CustomHttpException, MatchI } from '@app/common';
import { Set } from '@app/common';
import { SessionRepository } from 'src/sessions/sessions.repository';
import { Types } from 'mongoose';
import { MatchEventService } from './match-event.service';
import { SessionPaymentService } from 'src/billing/services/session-payment.service';

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(
    private readonly matchRepository: MatchRepository,
    private readonly setRepository: SetRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly matchEventService: MatchEventService,
    private readonly sessionPaymentService: SessionPaymentService,
  ) {}

  private async viewSetForSession(sessionId: string): Promise<Set[]> {
    return await this.setRepository.find({
      session: new Types.ObjectId(sessionId),
    });
  }

  async matchUp(sessionId: string) {
    const sets = await this.viewSetForSession(sessionId);
    const session = await this.sessionRepository.findOne({ _id: sessionId });

    if (!session) {
      throw new CustomHttpException('Session not found', HttpStatus.NOT_FOUND);
    }

    if (session.paymentRequired) {
      const allPaid = await this.sessionPaymentService.areAllPaymentsCompleted(session._id);
      if (!allPaid) {
        throw new CustomHttpException(
          'Cannot start matchup: not all members have completed payment',
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
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
    const match = await this.matchRepository.viewMatchDetailsDeep(matchId);

    if (!match) {
      throw new CustomHttpException('Match not found', HttpStatus.NOT_FOUND);
    }

    return match;
  }

  async recordGoalScorer(matchId: string, playerId: string, team: 'teamOne' | 'teamTwo') {
    const match = await this.matchRepository.findOne({ _id: matchId });

    if (!match) {
      throw new CustomHttpException('Match not found', HttpStatus.NOT_FOUND);
    }

    if (!match.isStarted) {
      throw new CustomHttpException('Match has not started yet', HttpStatus.BAD_REQUEST);
    }

    const updated = await this.matchRepository.addGoalScorer(matchId, playerId, team);

    // broadcast to SSE clients with updated scores + scorer info
    this.matchEventService.emitMatchScoreUpdate({
      matchId: new Types.ObjectId(matchId),
      sessionId: updated.session,
      teamOne: {
        id: (updated.teamOne as any)._id,
        name: (updated.teamOne as any).name,
      },
      teamTwo: {
        id: (updated.teamTwo as any)._id,
        name: (updated.teamTwo as any).name,
      },
      teamOneScore: updated.teamOneScore,
      teamTwoScore: updated.teamTwoScore,
      latestScorer: { player: playerId, team },
    }).catch((err) => this.logger.error('Failed to emit goal scorer event', err));

    return updated;
  }

  async incrementMatchScore(
    matchId: string,
    team: 'teamOne' | 'teamTwo',
  ) {
    const updatedMatch = await this.matchRepository.IncrementMatchScore(
      matchId,
      team,
    );
    if (!updatedMatch) {
      throw new CustomHttpException(
        'Failed to increment match score',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    //broadcast to sse clients
    this.matchEventService.emitMatchScoreUpdate({
      matchId: new Types.ObjectId(matchId),
      sessionId: updatedMatch.session,
      teamOne: {
        id: (updatedMatch.teamOne as any)._id,
        name: (updatedMatch.teamOne as any).name,
      },
      teamTwo: {
        id: (updatedMatch.teamTwo as any)._id,
        name: (updatedMatch.teamTwo as any).name,
      },
      teamOneScore: updatedMatch.teamOneScore,
      teamTwoScore: updatedMatch.teamTwoScore,
    }).catch((err) => this.logger.error('Failed to emit increment score event', err));

    return updatedMatch;
  }

  async decrementMatchScore(
    matchId: string,
    team: 'teamOne' | 'teamTwo',
  ) {
    const updatedMatch = await this.matchRepository.RedecrementMatchScore(
      matchId,
      team,
    );
    if (!updatedMatch) {
      throw new CustomHttpException(
        'Failed to decrement match score',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    //broadcast to sse clients
    this.matchEventService.emitMatchScoreUpdate({
      matchId: new Types.ObjectId(matchId),
      sessionId: updatedMatch.session,
      teamOne: {
        id: (updatedMatch.teamOne as any)._id,
        name: (updatedMatch.teamOne as any).name,
      },
      teamTwo: {
        id: (updatedMatch.teamTwo as any)._id,
        name: (updatedMatch.teamTwo as any).name,
      },
      teamOneScore: updatedMatch.teamOneScore,
      teamTwoScore: updatedMatch.teamTwoScore,
    }).catch((err) => this.logger.error('Failed to emit decrement score event', err));
    return updatedMatch;
  }
}