import { HttpStatus, Injectable } from '@nestjs/common';
import { SessionRepository } from '../sessions/sessions.repository';
import { LocationRepository } from '../locations/locations.repository';
import { MatchRepository } from '../matches/matches.repository';
import { UserRepository } from '../users/users.repository';
import { CustomHttpException, Session, SessionI, User } from '@app/common';
import { UpdateQuery, FilterQuery } from 'mongoose';
import { createSessionRequest } from './dto/sessions.dto';
import { MATCH_TYPE } from '@app/common';

@Injectable()
export class SessionsService {
  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly locationRepository: LocationRepository,
    private readonly matchRepository: MatchRepository,
    private readonly userRepository: UserRepository,
  ) {}

  async findNearbySessionMatches(lng: number, lat: number) {
try{
      const nearbyLocations = await this.locationRepository.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat],
          },
          // $maxDistance: 200000000,
        },
      },
    });

    console.log(nearbyLocations);
    const locationIds = nearbyLocations.map((loc) => loc._id);
    const locatedSessions = await this.sessionRepository.find({
      location: { $in: locationIds },
    });
    const sessionIds = locatedSessions.map((session) => session._id);

    return this.matchRepository.findAndPopulate(
      { session: { $in: sessionIds } },
      ['teamOne', 'teamTwo'],
    );

}catch(error){
console.error('Error Finding sessions:', error);
      throw new CustomHttpException(
        'Error Finding sessions: ' + (error?.message || error),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
}
  }

  async startSession(userId: string, locationId: string) {
    const user = await this.userRepository.findOne({ _id: userId });
    const location = await this.locationRepository.findOne({_id: locationId})

    if (!location) throw new CustomHttpException('Location not found', HttpStatus.NOT_FOUND);

    if (user == null) {
      throw new CustomHttpException('User not found', HttpStatus.NOT_FOUND);
    }

    await this.userRepository.findOneAndUpdate(
      {
        _id: userId,
      },
      { isCaptain: true },
    );

    const session = await this.sessionRepository.create({
      location: locationId,
      captain: userId,
    });

    await this.userRepository.findOneAndUpdate(
      { _id: userId },
      { currentSession: session._id },
    );

    return session;
  }

  async createSession(
    {
      setNumber,
      playersPerTeam,
      timeDuration,
      minsPerSet,
      startTime,
      winningDecider,
    }: createSessionRequest,
    userId: string,
    sessionId: string,
  ) {
    const user: User = await this.userRepository.findOne({ _id: userId });

    const session = await this.sessionRepository.findOne({ _id: sessionId });
    if (session === null) {
      throw new CustomHttpException(
        'Session does not exist',
        HttpStatus.NOT_FOUND,
      );
    }

    if (!user.isCaptain) {
      throw new CustomHttpException(
        'You are not a captain',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const addedStopTime = new Date(
      new Date(startTime).getTime() + timeDuration * 60000,
    );

    const existingSchedule = await this.sessionRepository.findOne({
      startTime,
      stopTime: addedStopTime,
    });

    if (existingSchedule !== null) {
      throw new CustomHttpException(
        'Session Time already exists',
        HttpStatus.CONFLICT,
      );
    }

    const overlappingSchedule = await this.sessionRepository.findOne({
      startTime: { $lt: new Date(addedStopTime) },
      stopTime: { $gt: new Date(startTime) },
    });

    if (overlappingSchedule !== null) {
      throw new CustomHttpException(
        'This session overlaps with another session',
        HttpStatus.CONFLICT,
      );
    }

    const maxNumber = playersPerTeam * setNumber;

    const newSession = await this.sessionRepository.findOneAndUpdate(
      {
        _id: sessionId,
      },
      {
        setNumber,
        playersPerTeam,
        minsPerSet,
        startTime,
        stopTime: addedStopTime,
        winningDecider,
        maxNumber,
      },
    );

    return newSession;
  }

  async endSession(sessionId: string) {
    const session: Session = await this.sessionRepository.findOne({
      _id: sessionId,
    });
    if (!session)
      throw new CustomHttpException('Session not found', HttpStatus.NOT_FOUND);

    await Promise.all(
      session.members.map(async (memberId) => {
        const user = await this.userRepository.findOne({
          _id: memberId.toString(),
        });
        if (user !== null) {
          await this.userRepository.findOneAndUpdate(
            { _id: memberId.toString() },
            { currentSession: null, isCaptain: false },
          );
        }
      }),
    );

    await this.sessionRepository.findOneAndUpdate(
      {
        _id: session._id.toString(),
      },
      { captain: null, inProgress: false },
    );

    return { message: 'Session ended successfully', session };
  }

  async joinSession(userId: string, sessionId: string) {
    const session = await this.sessionRepository.findOne({ _id: sessionId });
    if (!session)
      throw new CustomHttpException('Session not found', HttpStatus.NOT_FOUND);

    if (session.members.includes(userId)) {
      throw new CustomHttpException(
        'User is already in the session',
        HttpStatus.CONFLICT,
      );
    }

    if (session.isFull) {
      throw new CustomHttpException('Session is full', HttpStatus.BAD_REQUEST);
    }

    const updatedSession = await this.sessionRepository.findOneAndUpdate(
      { _id: sessionId },
      {
        $push: { members: userId },
        $set: { isFull: session.members.length + 1 >= session.maxNumber },
      },
    );

    await this.userRepository.findOneAndUpdate(
      { _id: userId },
      { currentSession: sessionId },
    );

    return {
      message: 'User successfully joined session',
      session: updatedSession,
    };
  }

  async leaveSession(userId: string, sessionId: string) {
    const session: Session = await this.sessionRepository.findOne({
      _id: sessionId,
    });
    if (!session)
      throw new CustomHttpException('Session not found', HttpStatus.NOT_FOUND);

    const user = await this.userRepository.findOne({ _id: userId });
    if (!user)
      throw new CustomHttpException('User not found', HttpStatus.NOT_FOUND);

    try {
      await this.sessionRepository.findOneAndUpdate(
        { _id: sessionId },
        {
          $pull: { members: userId },
          $set: { isFull: session.members.length - 1 >= session.maxNumber },
        },
      );

      await this.userRepository.findOneAndUpdate(
        { _id: userId },
        { currentSession: null },
      );

      const updatedSession = await this.sessionRepository.findOne({
        _id: sessionId,
      });
      return {
        message: 'User successfully left session',
        session: updatedSession,
      };
    } catch (error) {
      throw new CustomHttpException(
        'Failed to leave session',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async viewSessionMembers(sessionId: string) {
    const session: SessionI = await this.sessionRepository.findOneAndPopulate(
      {
        _id: sessionId,
      },
      ['members'],
    );

    if (session === null) {
      throw new CustomHttpException('Session not found', HttpStatus.NOT_FOUND);
    }

    if (!session.members || session.members.length === 0) {
      throw new CustomHttpException(
        'No members have joined yet',
        HttpStatus.NOT_FOUND,
      );
    }

    const nicknames = session.members.map((member) => member.nickname);
    return nicknames;
  }

  async viewSession(sessionId: string) {
    const verifySession = await this.sessionRepository.findOne({
      _id: sessionId,
    });

    if (verifySession === null) {
      throw new CustomHttpException(
        'Session does not exist',
        HttpStatus.NOT_FOUND,
      );
    }

    return await this.sessionRepository
      .findRaw()
      .findOne({
        _id: sessionId,
      })
      .populate({
        path: 'members',
        select: 'nickname -_id',
      })
      .populate({
        path: 'members',
        select: 'nickname -_id',
      });
  }

  async viewAllSessions() {
    return this.sessionRepository.findAndPopulate({ finished: false }, [
      'captain',
      'members',
      'location',
    ]);
  }

  async deleteSession(sessionId: string) {
    const session: Session = await this.sessionRepository.findOne({
      _id: sessionId,
    });
    if (!session)
      throw new CustomHttpException('Session not found', HttpStatus.NOT_FOUND);

    const updateQuery: UpdateQuery<User> = {
      $set: { currentSession: null, isCaptain: false },
    };

    await this.userRepository.updateMany(
      { _id: { $in: session.members } },
      updateQuery,
    );

    await this.sessionRepository.delete(session._id);

    return { message: 'Session deleted successfully' };
  }

  async recheduleSession(
    sessionId: string,
    startTime: Date,
    timeDuration: number,
  ) {
    const session = await this.sessionRepository.findOne({ _id: sessionId });
    if (!session) {
      throw new CustomHttpException('Session not found', HttpStatus.NOT_FOUND);
    }

    const addedStopTime = new Date(
      new Date(startTime).getTime() + timeDuration * 60000,
    );

    const existingSchedule = await this.sessionRepository.findOne({
      startTime,
      stopTime: addedStopTime,
    });

    if (existingSchedule) {
      throw new CustomHttpException(
        'Session Time already exists',
        HttpStatus.CONFLICT,
      );
    }

    const overlappingSchedule = await this.sessionRepository.findOne({
      _id: { $ne: sessionId },
      startTime: { $lt: addedStopTime },
      stopTime: { $gt: startTime },
    });

    if (overlappingSchedule) {
      throw new CustomHttpException(
        'This session overlaps with another one',
        HttpStatus.CONFLICT,
      );
    }

    const updatedSession = await this.sessionRepository.findOneAndUpdate(
      { _id: sessionId },
      {
        startTime,
        timeDuration,
        stopTime: addedStopTime,
      },
    );

    return {
      message: 'Session rescheduled successfully',
      session: updatedSession,
    };
  }

  async updateAllSessions() {
    try {
      const filter: FilterQuery<Session> = {};
      const update: UpdateQuery<Session> = {
        $set: { matchType: MATCH_TYPE.FRIENDLY },
      };

      const updatedResult = await this.sessionRepository.updateMany(
        filter,
        update,
      );
      console.log("Updating with filter:", filter);
console.log("Updating with update:", update);

      return updatedResult;
    } catch (error) {
      console.error('Error updating sessions:', error);
      throw new CustomHttpException(
        'Error updating sessions: ' + (error?.message || error),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
