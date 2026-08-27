import { Injectable, HttpStatus } from '@nestjs/common';
import { SetRepository } from './sets.repository';
import { SessionRepository } from '../sessions/sessions.repository';
import { CustomHttpException } from '@app/common';
import { Set, Session } from '@app/common';
import { Types } from 'mongoose';

@Injectable()
export class SetsService {
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
      update: { $addToSet: { players: new Types.ObjectId(player) } } as any,
    },
  }));  

  if (ops.length > 0) {
    await this.setRepository.findRaw().bulkWrite(ops, { ordered: false });
  }
}

  // Called by the controller — same as createSet but first verifies the
  // caller is actually a member of the session. This is exposed as a
  // user-facing "retry" action for when auto-allocation (triggered from
  // maybeCompleteSessionPayments once everyone's paid) is slow or fails,
  // so it needs its own guard beyond just JwtAuthGuard.
  async createSetForMember(sessionId: string, userId: string) {
    const session = await this.sessionRepository.findOne({ _id: sessionId });
    if (!session) {
      throw new CustomHttpException('Session not found', HttpStatus.NOT_FOUND);
    }

    const isMember = (session.members || []).map(String).includes(userId);
    if (!isMember) {
      throw new CustomHttpException('You are not a member of this session', HttpStatus.FORBIDDEN);
    }

    return this.createSet(sessionId);
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

      const count = await this.setRepository.findRaw().countDocuments({ session: sessionId });

      if (count > 0) {
        throw new CustomHttpException('Set already created', HttpStatus.BAD_REQUEST);
      }

      if (!session.setNumber || session.setNumber <= 0) {
        throw new CustomHttpException(
          'Session has no setNumber configured',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!session.isFull) {
        throw new CustomHttpException(
          'Session is not full yet',
          HttpStatus.BAD_REQUEST,
        );
      }

      const setData = Array(session.setNumber)
        .fill(null)
        .map((_, index) => ({
          _id: new Types.ObjectId(),
          session: new Types.ObjectId(sessionId),
          name: `Team ${index + 1}`,
          players: [],
        }));

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
      if (error instanceof CustomHttpException) {
        throw error;
      }
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
