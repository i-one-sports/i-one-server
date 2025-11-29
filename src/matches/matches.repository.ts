import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository, Match } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class MatchRepository extends AbstractRepository<Match> {
  protected readonly logger = new Logger(MatchRepository.name);

  constructor(@InjectModel(Match.name) MatchModel: Model<Match>) {
    super(MatchModel);
  }

  async IncrementMatchScore(
    matchId: string,
    team: 'teamOne' | 'teamTwo',
  ): Promise<Match | null> {
    try {
      const updatedMatch = await this.model.findByIdAndUpdate(
        matchId,
        team === 'teamOne'
          ? { $inc: { teamOneScore: 1 } }
          : { $inc: { teamTwoScore: 1 } },
        { new: true },
      );
      return updatedMatch.populate(['teamOne', 'teamTwo']);
    } catch (error) {
      this.logger.error(
        `Failed to increment match score for matchId ${matchId}`,
        error.stack,
      );
      return null;
    }
  }

  async RedecrementMatchScore(
    matchId: string,
    team: 'teamOne' | 'teamTwo',
  ): Promise<Match | null> {
    try {
      const updatedMatch = await this.model.findByIdAndUpdate(
        matchId,
        team === 'teamOne'
          ? { $inc: { teamOneScore: -1 } }
          : { $inc: { teamTwoScore: -1 } },
        { new: true },
      );
      return updatedMatch.populate(['teamOne', 'teamTwo']);
    } catch (error) {
      this.logger.error(
        `Failed to decrement match score for matchId ${matchId}`,
        error.stack,
      );
      return null;
    }
  }
}