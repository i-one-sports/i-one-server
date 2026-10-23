import { Injectable, Logger } from '@nestjs/common';
import { AbstractRepository, Match } from '@app/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

// Score changes are versioned updates built in MatchesService (recordGoal /
// decrementMatchScore) — there is deliberately no blind +1/-1 here, so
// nothing can change a score without the scoreVersion check.
@Injectable()
export class MatchRepository extends AbstractRepository<Match> {
  protected readonly logger = new Logger(MatchRepository.name);

  constructor(@InjectModel(Match.name) MatchModel: Model<Match>) {
    super(MatchModel);
  }

  async viewMatchDetailsDeep(matchId: string): Promise<Match | null> {
    return this.model
      .findById(matchId)
      .populate([
        { path: 'teamOne', populate: { path: 'players', select: '-password' } },
        { path: 'teamTwo', populate: { path: 'players', select: '-password' } },
        { path: 'goalScorers.player', select: '-password' },
        { path: 'goalScorers.assistedBy', select: '-password' },
      ])
      .lean() as any;
  }
}
