import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { SessionRepository } from '../sessions/sessions.repository';
import { LocationRepository } from '../locations/locations.repository';
import { MatchRepository } from '../matches/matches.repository';
import { UserRepository } from '../users/users.repository';
import {
  CustomHttpException,
  LOCATION_PRICING_OPTION,
  LOCATION_TIER,
  Session,
  SessionI,
  User,
} from '@app/common';
import { UpdateQuery, FilterQuery, Types } from 'mongoose';
import { createSessionRequest } from './dto/sessions.dto';
import { MATCH_TYPE } from '@app/common';
import { CaptainsService } from 'src/captains/captains.service';
import { CreateCaptainDto } from 'src/captains/dto/captains.dto';
import { SessionPaymentService } from 'src/billing/services/session-payment.service';
import { NotificationService } from 'src/notifications/notification.service';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  private parseHourToMinutes(time?: string): number | null {
    if (!time) return null;

    const match = /^(\d{2}):(\d{2})$/.exec(time);
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

    return hours * 60 + minutes;
  }

  private validateSessionWithinOperatingHours(location: any, startTime: Date, stopTime: Date) {
    const openingMinutes = this.parseHourToMinutes(location?.openingHour);
    const closingMinutes = this.parseHourToMinutes(location?.closingHour);

    if (openingMinutes === null || closingMinutes === null) {
      return;
    }

    if (startTime.toDateString() !== stopTime.toDateString()) {
      throw new CustomHttpException(
        'Session time is outside location opening and closing hours',
        HttpStatus.BAD_REQUEST,
      );
    }

    const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
    const stopMinutes = stopTime.getHours() * 60 + stopTime.getMinutes();

    if (startMinutes < openingMinutes || stopMinutes > closingMinutes) {
      throw new CustomHttpException(
        'Session time is outside location opening and closing hours',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private buildPaymentConfig(location: any, timeDurationMins: number) {
    if (location?.tier !== LOCATION_TIER.PAID) {
      return { paymentRequired: false, paymentAmount: 0 };
    }

    if (location.pricingOption === LOCATION_PRICING_OPTION.HOURLY) {
      if (!location.paymentPerPersonHourly || location.paymentPerPersonHourly <= 0) {
        throw new CustomHttpException(
          'Hourly pricing is selected but paymentPerPersonHourly is missing',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!Number.isFinite(timeDurationMins) || timeDurationMins <= 0) {
        throw new CustomHttpException(
          'timeDuration must be a positive number of minutes',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (timeDurationMins % 60 !== 0) {
        throw new CustomHttpException(
          'Hourly pricing requires timeDuration in full-hour blocks (60, 120, 180...)',
          HttpStatus.BAD_REQUEST,
        );
      }

      const hourUnits = Math.max(1, Math.ceil(timeDurationMins / 60));
      return {
        paymentRequired: true,
        paymentAmount: location.paymentPerPersonHourly * hourUnits,
      };
    }

    if (location.pricingOption === LOCATION_PRICING_OPTION.MONTHLY) {
      if (!location.paymentPerPersonMonthly || location.paymentPerPersonMonthly <= 0) {
        throw new CustomHttpException(
          'Monthly pricing is selected but paymentPerPersonMonthly is missing',
          HttpStatus.BAD_REQUEST,
        );
      }

      return { paymentRequired: true, paymentAmount: location.paymentPerPersonMonthly };
    }

    throw new CustomHttpException(
      'Location pricing option is missing for paid tier',
      HttpStatus.BAD_REQUEST,
    );
  }

  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly locationRepository: LocationRepository,
    private readonly matchRepository: MatchRepository,
    private readonly userRepository: UserRepository,
    private readonly CaptainService: CaptainsService,
    private readonly sessionPaymentService: SessionPaymentService,
    private readonly notificationService: NotificationService,
  ) {}

  async findNearbySessionMatches(lng: number, lat: number) {
    try {
      const nearbyLocations = await this.locationRepository.find({
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [lng, lat],
            },
            // $maxDistance: 20000000, // ~20,000km - covers entire Earth
          },
        },
      });

      if (!nearbyLocations.length) {
        return [];
      }

      const locationIds = nearbyLocations.map((loc) => loc._id);

      const locatedSessions = await this.sessionRepository.find({
        location: { $in: locationIds },
      });

      if (!locatedSessions.length) {
        return [];
      }

      const sessionIds = locatedSessions.map((s) => s._id);

      // 3️⃣ Get matches in those sessions (with teamOne + teamTwo populated)
      const matches = await this.matchRepository.findRaw().aggregate([
        {
          $match: {
            session: { $in: sessionIds },
          },
        },
        {
          $lookup: {
            from: 'sets',
            localField: 'teamOne',
            foreignField: '_id',
            as: 'teamOne',
          },
        },
        { $unwind: { path: '$teamOne', preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: 'sets',
            localField: 'teamTwo',
            foreignField: '_id',
            as: 'teamTwo',
          },
        },
        { $unwind: { path: '$teamTwo', preserveNullAndEmptyArrays: true } },

        // Attach session details directly to each match
        {
          $lookup: {
            from: 'sessions',
            localField: 'session',
            foreignField: '_id',
            as: 'session',
          },
        },
        { $unwind: { path: '$session', preserveNullAndEmptyArrays: true } },

        // Attach location details to the session
        {
          $lookup: {
            from: 'locations',
            localField: 'session.location',
            foreignField: '_id',
            as: 'session.location',
          },
        },
        {
          $unwind: {
            path: '$session.location',
            preserveNullAndEmptyArrays: true,
          },
        },
      ]);

      return matches;
    } catch (error: any) {
      console.error('Error Finding sessions:', error);
      throw new CustomHttpException(
        'Error Finding sessions: ' + (error?.message || error),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async startSession(userId: string, locationId: string) {
    const [user, location] = await Promise.all([
      this.userRepository.findOne({ _id: userId }),
      this.locationRepository.findOne({ _id: locationId }),
    ]);

    if (!location)
      throw new CustomHttpException('Location not found', HttpStatus.NOT_FOUND);
    if (!user)
      throw new CustomHttpException('User not found', HttpStatus.NOT_FOUND);

    if (!user.emailVerified) {
      throw new CustomHttpException(
        'Please verify your email before starting a session.',
        HttpStatus.FORBIDDEN,
      );
    }

    const session = await this.sessionRepository.create({
      location: locationId,
      captain: userId,
    });

    await Promise.all([
      this.userRepository.findOneAndUpdate({ _id: userId }, { currentSession: session._id }),
      this.CaptainService.createCaptain({ userId, sessionId: session._id.toString() }),
    ]);

    if (location.owner) {
      this.notificationService.emit({
        targetUserId: location.owner.toString(),
        type: 'SESSION_CREATED',
        title: 'New Session Created',
        body: `A session has been created at ${location.name}`,
        payload: { sessionId: session._id.toString(), locationId },
        timestamp: Date.now(),
      }).catch((err) => this.logger.error('Failed to emit SESSION_CREATED notification', err));
    }

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
    const session = await this.sessionRepository.findOne({ _id: sessionId });
    if (session === null) {
      throw new CustomHttpException(
        'Session does not exist',
        HttpStatus.NOT_FOUND,
      );
    }

    const isCaptain = await this.CaptainService.isCaptain(userId, sessionId);
    if (!isCaptain) {
      throw new CustomHttpException(
        'You are not a captain',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const addedStopTime = new Date(
      new Date(startTime).getTime() + timeDuration * 60000,
    );

    const location = await this.locationRepository.findOne({ _id: session.location });
    if (!location) {
      throw new CustomHttpException('Location not found', HttpStatus.NOT_FOUND);
    }

    this.validateSessionWithinOperatingHours(location, new Date(startTime), addedStopTime);
    const paymentConfig = this.buildPaymentConfig(location, timeDuration);

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
      location: session.location,
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
        members: [userId],
        paymentRequired: paymentConfig.paymentRequired,
        paymentAmount: paymentConfig.paymentAmount,
        paymentStatus: paymentConfig.paymentRequired ? 'NOT_INITIATED' : 'COMPLETED',
        allPaymentsCompleted: !paymentConfig.paymentRequired,
      },
    );

    this.locationRepository.findOne({ _id: session.location }).then((location) => {
      if (location?.owner) {
        this.notificationService.emit({
          targetUserId: location.owner.toString(),
          type: 'SESSION_CONFIGURED',
          title: 'Session Configured',
          body: `A session at ${location.name} has been configured and is ready`,
          payload: { sessionId, locationId: session.location.toString() },
          timestamp: Date.now(),
        }).catch((err) => this.logger.error('Failed to emit SESSION_CONFIGURED notification', err));
      }
    }).catch((err) => this.logger.error('Failed to fetch location for notification', err));

    return newSession;
  }

  async endSession(sessionId: string, userId: string) {
    const session: Session = await this.sessionRepository.findOne({
      _id: sessionId,
    });
    if (!session)
      throw new CustomHttpException('Session not found', HttpStatus.NOT_FOUND);

    const location = await this.locationRepository.findOne({ _id: session.location });
    const isCaptain = session.captain?.toString() === userId;
    const isOwner = location?.owner?.toString() === userId;
    if (!isCaptain && !isOwner)
      throw new CustomHttpException('Only the captain or location owner can end this session', HttpStatus.FORBIDDEN);

    await Promise.all([
      this.userRepository.updateMany(
        { _id: { $in: session.members } },
        { $set: { currentSession: null } },
      ),
      this.sessionRepository.findOneAndUpdate(
        { _id: session._id.toString() },
        { captain: null, inProgress: false },
      ),
    ]);

    return { message: 'Session ended successfully', session };
  }

  async joinSession(userId: string, sessionId: string) {
    const session = await this.sessionRepository.findOne({ _id: sessionId });
    if (!session)
      throw new CustomHttpException('Session not found', HttpStatus.NOT_FOUND);

    const exists = session.members.some((id) => id.equals(userId));

    if (exists)
      throw new CustomHttpException(
        'User already in this session',
        HttpStatus.CONFLICT,
      );

    if (session.isFull) {
      throw new CustomHttpException('Session is full', HttpStatus.BAD_REQUEST);
    }

    const willBeFull = session.members.length + 1 >= session.maxNumber;

    const updatedSession = await this.sessionRepository.findOneAndUpdate(
      { _id: sessionId },
      {
        $push: { members: userId },
        $set: { isFull: willBeFull },
      },
    );

    await this.userRepository.findOneAndUpdate(
      { _id: userId },
      { currentSession: sessionId },
    );

    if (willBeFull && updatedSession.paymentRequired) {
      await this.onSessionFull(updatedSession);
    }

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
      const [updatedSession] = await Promise.all([
        this.sessionRepository.findOneAndUpdate(
          { _id: sessionId },
          {
            $pull: { members: userId },
            $set: { isFull: false },
          },
        ),
        this.userRepository.findOneAndUpdate({ _id: userId }, { currentSession: null }),
      ]);

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
    try {
      const session = await this.sessionRepository
        .findRaw()
        .find({
          _id: sessionId,
        })
        .populate('members', 'firstName lastName nickname');

      if (session === null) {
        throw new CustomHttpException(
          'Session not found',
          HttpStatus.NOT_FOUND,
        );
      }

      // if (!session.members || session.members.length === 0) {
      //   throw new CustomHttpException(
      //     'No members have joined yet',
      //     HttpStatus.NOT_FOUND,
      //   );
      // }

      // const nicknames = session.members.map((member) => member.nickname);
      return session;
    } catch (error: any) {
      console.log(error.message);
    }
  }

  async viewSession(sessionId: string) {
    const session = await this.sessionRepository
      .findRaw()
      .findOne({ _id: sessionId })
      .populate({ path: 'members', select: 'firstName lastName nickname avatar' })
      .lean() as any;

    if (!session) {
      throw new CustomHttpException('Session does not exist', HttpStatus.NOT_FOUND);
    }

    if (session.paymentRequired && session.members?.length) {
      const paymentMap = await this.sessionPaymentService.getSessionMemberPaymentMap(sessionId);
      session.members = session.members.map((member: any) => ({
        ...member,
        paymentStatus: paymentMap.get(member._id.toString()) ?? 'PENDING',
      }));
    }

    return session;
  }

  async getSessionsByLocationAndDate(locationId: string, date: string) {
    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setUTCHours(23, 59, 59, 999);

    const sessions = await this.sessionRepository
      .findRaw()
      .find({
        location: new Types.ObjectId(locationId),
        startTime: { $gte: start, $lte: end },
      })
      .populate('captain', '-password')
      .populate('members', '-password')
      .populate('location')
      .sort({ startTime: 1 });

    return sessions;
  }

  async viewAllSessions(page: number = 1, limit: number = 6) {
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 6;
    const skip = (pageNum - 1) * limitNum;

    const [sessions, total] = await Promise.all([
      this.sessionRepository
        .findRaw()
        .find({ finished: false })
        .populate('captain', '-password')
        .populate('members', '-password')
        .populate('location')
        .skip(skip)
        .limit(limitNum)
        .sort({ createdAt: -1 }),
      this.sessionRepository.findRaw().countDocuments({ finished: false }),
    ]);

    return {
      sessions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  async deleteSession(sessionId: string, userId: string) {
    const session: Session = await this.sessionRepository.findOne({
      _id: sessionId,
    });
    if (!session)
      throw new CustomHttpException('Session not found', HttpStatus.NOT_FOUND);

    const location = await this.locationRepository.findOne({ _id: session.location });
    const isCaptain = session.captain?.toString() === userId;
    const isOwner = location?.owner?.toString() === userId;
    if (!isCaptain && !isOwner)
      throw new CustomHttpException('Only the captain or location owner can delete this session', HttpStatus.FORBIDDEN);

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
    userId: string,
  ) {
    const session = await this.sessionRepository.findOne({ _id: sessionId });
    if (!session) {
      throw new CustomHttpException('Session not found', HttpStatus.NOT_FOUND);
    }

    const addedStopTime = new Date(
      new Date(startTime).getTime() + timeDuration * 60000,
    );

    const location = await this.locationRepository.findOne({ _id: session.location });
    if (!location) {
      throw new CustomHttpException('Location not found', HttpStatus.NOT_FOUND);
    }

    const isCaptain = session.captain?.toString() === userId;
    const isOwner = location.owner?.toString() === userId;
    if (!isCaptain && !isOwner)
      throw new CustomHttpException('Only the captain or location owner can reschedule this session', HttpStatus.FORBIDDEN);

    this.validateSessionWithinOperatingHours(location, new Date(startTime), addedStopTime);
    const paymentConfig = this.buildPaymentConfig(location, timeDuration);

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
        paymentRequired: paymentConfig.paymentRequired,
        paymentAmount: paymentConfig.paymentAmount,
        paymentStatus: paymentConfig.paymentRequired ? 'NOT_INITIATED' : 'COMPLETED',
        allPaymentsCompleted: !paymentConfig.paymentRequired,
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
      console.log('Updating with filter:', filter);
      console.log('Updating with update:', update);

      return updatedResult;
    } catch (error: any) {
      console.error('Error updating sessions:', error);
      throw new CustomHttpException(
        'Error updating sessions: ' + (error?.message || error),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async isCaptain(userId: string, sessionId: string): Promise<boolean> {
    try {
      const session: Session = await this.sessionRepository.findOne({
        _id: new Types.ObjectId(sessionId),
      });

      if (!session) {
        return false;
      }
      const sessionCaptainId = session.captain?.toString();

      if (sessionCaptainId === userId) {
        return true;
      }
      return false;
    } catch (error: any) {
      console.error('Error checking captain status:', error);
      throw new CustomHttpException(
        'Error checking captain status: ' + (error?.message || error),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async onSessionFull(session: Session) {
    if (!session.paymentAmount || session.paymentAmount <= 0) return;

    const location = await this.locationRepository.findOne({ _id: session.location });
    if (!location || !location.owner) {
      throw new CustomHttpException('Location owner not found', HttpStatus.BAD_REQUEST);
    }

    if (location.tier !== LOCATION_TIER.PAID) {
      await this.sessionRepository.findOneAndUpdate(
        { _id: session._id },
        { paymentRequired: false, paymentStatus: 'COMPLETED', allPaymentsCompleted: true },
      );
      return;
    }

    const paymentDeadline = new Date();
    paymentDeadline.setHours(paymentDeadline.getHours() + 24);

    const memberIds = session.members.map((m) => new Types.ObjectId(m));
    let payableMemberIds = memberIds;

    if (location.pricingOption === LOCATION_PRICING_OPTION.MONTHLY) {
      const activePaidUsers = await this.sessionPaymentService.getUsersWithActiveRecurringPayment(
        session.location as any,
        memberIds,
        location.pricingOption,
      );

      payableMemberIds = memberIds.filter((memberId) => !activePaidUsers.has(memberId.toString()));
    }

    if (payableMemberIds.length === 0) {
      await this.sessionRepository.findOneAndUpdate(
        { _id: session._id },
        { paymentStatus: 'COMPLETED', allPaymentsCompleted: true },
      );
      return;
    }

    await Promise.all([
      this.sessionPaymentService.initializeSessionPayments(
        session._id,
        session.location as any,
        location.owner as any,
        payableMemberIds,
        session.paymentAmount,
        paymentDeadline,
        location.pricingOption,
      ),
      this.sessionRepository.findOneAndUpdate(
        { _id: session._id },
        { paymentStatus: 'PENDING', paymentDeadline, allPaymentsCompleted: false },
      ),
    ]);
  }

  async canSessionStart(sessionId: string): Promise<boolean> {
    const session = await this.sessionRepository.findOne({ _id: new Types.ObjectId(sessionId) });
    if (!session) {
      return false;
    }

    if (!session.paymentRequired) {
      return true;
    }

    return await this.sessionPaymentService.areAllPaymentsCompleted(session._id);
  }
}
