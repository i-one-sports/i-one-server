import { HttpStatus, Injectable } from '@nestjs/common';
import { CaptainRepository } from './captains.repository';
import { CreateCaptainDto } from './dto/captains.dto';
import { Captain } from '@app/common/schemas/captains.schema';
import { CustomHttpException } from '@app/common';
import { handleError } from 'src/helpers/errorHandler';


@Injectable()
export class CaptainsService {
  constructor(private readonly captainRepository: CaptainRepository) {}

  public async isCaptain(userId: string, id: string): Promise<boolean> {
    const exists = await this.captainRepository.findOne({
      userId: userId,
      $or: [{ teamId: id }, { sessionId: id }],
    });
    if (exists) {
      return true;
    }
    return false;
  }

  async createCaptain(data: CreateCaptainDto): Promise<Captain> {
    try {
      const captainedTeams: Captain[] = await this.captainRepository.find({
        userId: data.userId,
      });

      const isAlreadyCaptain = captainedTeams.some((captain) => {
        if (data.teamId) {
          return captain.teamId?.toString() === data.teamId;
        } else if (data.sessionId) {
          return captain.sessionId?.toString() === data.sessionId;
        }
        return false;
      });

      if (isAlreadyCaptain) {
        throw new CustomHttpException(
          'User is already a captain for the specified team or set.',
          HttpStatus.CONFLICT,
        );
      }

      const newCaptain = await this.captainRepository.create(data);
      return newCaptain;
    } catch (error) {
      handleError(error, 'Failed to create captain.');
    }
  }

  async getTeamCaptain(id: string): Promise<any> {
    try {
      const captain: Captain[] = await this.captainRepository.findAndPopulate(
        {
          $or: [{ teamId: id }, { setId: id }],
        },
        ['userId'],
      );
      if (!captain || captain.length === 0) {
        throw new CustomHttpException(
          'Captain not found. ',
          HttpStatus.NOT_FOUND,
        );
      }
      return captain[0].userId;
    } catch (error) {
      handleError(error, 'Failed to retrieve captain.');
    }
  }
}



