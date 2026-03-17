import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository, Match } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

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

  async viewMatchDetailsDeep(matchId: string): Promise<Match | null> {
    return this.model
      .findById(matchId)
      .populate([
        { path: 'teamOne', populate: { path: 'players', select: '-password' } },
        { path: 'teamTwo', populate: { path: 'players', select: '-password' } },
        { path: 'goalScorers.player', select: '-password' },
      ])
      .lean() as any;
  }

  async addGoalScorer(
    matchId: string,
    playerId: string,
    team: 'teamOne' | 'teamTwo',
  ): Promise<Match | null> {
    const scoreField = team === 'teamOne' ? 'teamOneScore' : 'teamTwoScore';
    return this.model
      .findByIdAndUpdate(
        matchId,
        {
          $inc: { [scoreField]: 1 },
          $push: { goalScorers: { player: new Types.ObjectId(playerId), team } },
        },
        { new: true },
      )
      .populate([
        { path: 'teamOne', populate: { path: 'players', select: '-password' } },
        { path: 'teamTwo', populate: { path: 'players', select: '-password' } },
        { path: 'goalScorers.player', select: '-password' },
      ])
      .lean() as any;
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