import { Injectable, HttpStatus } from '@nestjs/common';
import { SetRepository } from './sets.repository';
import { SessionRepository } from '../sessions/sessions.repository';
import { CustomHttpException } from '@app/common';
import { Set, Session } from '@app/common';
import { Types } from 'mongoose';

@Injectable()
export class SetsService {
  private readonly setNames = [
    'Team 7',
    'Royal Knights',
    'Bouillon Fc',
    'Sepulcher FC',
    'Akatsuki',
    'Amapiano FC',
    'Grey Fc',
    'Dynasty',
    'Elon Musk Fc',
    'J-boys FC',
    'Sporty9ja',
    'Wizkidfc',
    '30BG',
    'Valdomites',
    'OV-Hoes',
    'Outsiders',
    'Celeboys',
    'Azonto FC',
    'Akara warriors',
    'Egusi FC',
  ];

  constructor(
    private readonly setRepository: SetRepository,
    private readonly sessionRepository: SessionRepository,
  ) {}

  private async allocateMembers(
  session: Session,
  createdSets: Set[],
): Promise<void> {
  const members = session.members || [];
  const pickedMembers = createdSets.flatMap((set) => (set.players || [])).map(String);
  const availablePlayers = members
    .map(String)
    .filter((m) => !pickedMembers.includes(m));

  if (availablePlayers.length === 0) return;

  const ops = availablePlayers.map((player, i) => ({
    updateOne: {
      filter: { _id: createdSets[i % createdSets.length]._id },
      update: { $addToSet: { players: new Types.ObjectId(player) } },
    },
  }));  

  if (ops.length > 0) {
    await this.setRepository.findRaw().bulkWrite(ops, { ordered: false });
  }
}

  async createSet(sessionId: string) {
    try {
      const session: Session = await this.sessionRepository.findOne({ _id: sessionId });
      if (!session) {
        throw new CustomHttpException(
          'Session not found',
          HttpStatus.NOT_FOUND,
        );
      }

      const existingSets = await this.setRepository.find({
        session: sessionId,
      });
      const usedNames = existingSets.map((set) => set.name);
      const availableNames = this.setNames.filter(
        (name) => !usedNames.includes(name),
      );

      if (availableNames.length < session.setNumber) {
        throw new CustomHttpException(
          'Not enough unique names available for the session',
          HttpStatus.BAD_REQUEST,
        );
      }

      const count = await this.setRepository.findRaw().countDocuments({ session: sessionId });

      if (count > 0) {
        throw new CustomHttpException('Set already created', HttpStatus.BAD_REQUEST);
      }

      const setData = Array(session.setNumber)
        .fill(null)
        .map(() => {
          const randomIndex = Math.floor(Math.random() * availableNames.length);
          const randomName = availableNames.splice(randomIndex, 1)[0];
          return {
            _id: new Types.ObjectId(),
            session: sessionId,
            name: randomName,
            players: [],
          };
        });

      const createdSets = await this.setRepository.insertMany(setData);
      await this.allocateMembers(session, createdSets);

      const updatedSets = await this.setRepository.findAndPopulate(
        { session: new Types.ObjectId(sessionId) },
        ['players'],
      );

      return {
        message: 'Sets created successfully',
        sets: updatedSets,
      };
    } catch (error: any) {
      console.error('Error creating sets:', error);
      throw new CustomHttpException(
        error.message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      
    }
  }

  async viewAllSets() {
    return this.setRepository.findAndPopulate({}, ['players']);
  }

  async viewSetForSession(sessionId: string) {
    return this.setRepository.findAndPopulate({ session: sessionId }, [
      'players',
    ]);
  }

  async viewSingleSet(setId: string) {
    const set = await this.setRepository.findAndPopulate({ _id: setId }, [
      'players',
    ]);

    if (!set) {
      throw new CustomHttpException('Set not found', HttpStatus.NOT_FOUND);
    }

    return set;
  }
}
