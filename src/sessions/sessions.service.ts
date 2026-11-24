import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { roomForExpr, SessionRepository } from '../sessions/sessions.repository';
import { MonthlyPassService } from 'src/billing/services/monthly-pass.service';
import type { MonthlyPassRow } from 'src/billing/repositories/monthly-pass.repository';
import { LocationRepository } from '../locations/locations.repository';
import { MatchRepository } from '../matches/matches.repository';
import { UserRepository } from '../users/users.repository';
import {
  CustomHttpException,
  LOCATION_PRICING_OPTION,
  LOCATION_TIER,
  ROTATION_FORMAT,
  Location,
  SESSION_PAYMENT_MODE,
  lagosDateKey,
  lagosMidnight,
  lagosParts,
  PUBLIC_USER_FIELDS,
  SESSION_CANCEL_REASON,
  SESSION_STATUS,
  Session,
  SessionI,
  User,
} from '@app/common';
import { ClientSession, Connection, UpdateQuery, Types } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { createSessionRequest } from './dto/sessions.dto';
import { CaptainsService } from 'src/captains/captains.service';
import { CreateCaptainDto } from 'src/captains/dto/captains.dto';
import { SessionPaymentService } from 'src/billing/services/session-payment.service';
import { PaymentStatus } from '@app/common/schemas/session-payment.schema';
import { NotificationService } from 'src/notifications/notification.service';
import { NOTIFICATION_CHANNEL, NOTIFICATION_TYPE } from 'src/notifications/notification.types';
import { CacheService } from 'src/cache/cache.service';
import { SetsService } from 'src/sets/sets.service';
import { SessionEmailInput, sessionEmailDetails, sessionWhen } from './session-email-details';

@Injectable()
export class SessionsService implements OnModuleInit {
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

  // Opening hours are Lagos wall-clock times (never the server's timezone —
  // UTC in production). A pitch's daily window opens at openingHour and runs
  // to closingHour, rolling into the next day when closing is earlier than
  // opening (23:00–05:00 is open overnight). Same opening and closing time
  // means open 24 hours. A session must fit inside one window: the one that
  // opened on its start day, or the one that opened the day before (a 02:00
  // game is part of the previous night's 23:00–05:00 window).
  private validateSessionWithinOperatingHours(location: any, startTime: Date, stopTime: Date) {
    const openingMinutes = this.parseHourToMinutes(location?.openingHour);
    const closingMinutes = this.parseHourToMinutes(location?.closingHour);

    if (openingMinutes === null || closingMinutes === null) {
      return;
    }

    if (openingMinutes === closingMinutes) {
      return; // open 24 hours
    }

    const windowMinutes =
      closingMinutes > openingMinutes
        ? closingMinutes - openingMinutes
        : closingMinutes + 24 * 60 - openingMinutes;

    const { year, month, day } = lagosParts(startTime);
    for (const dayOffset of [0, -1]) {
      const windowOpen = lagosMidnight(year, month, day + dayOffset).getTime() + openingMinutes * 60000;
      const windowClose = windowOpen + windowMinutes * 60000;
      if (startTime.getTime() >= windowOpen && stopTime.getTime() <= windowClose) {
        return;
      }
    }

    throw new CustomHttpException(
      'Session time is outside location opening and closing hours',
      HttpStatus.BAD_REQUEST,
    );
  }

  // Books a time slot at a pitch: "is the slot free?" + "save the time" as
  // one all-or-nothing step. Without this, two captains booking 17:00–18:00
  // at the same moment would both pass the overlap check and both save.
  //
  // Every booking at a pitch first bumps that pitch's Location.bookingVersion
  // inside the transaction, so concurrent bookings write the same document
  // and MongoDB lets only one commit. connection.transaction() retries the
  // loser from the start; its overlap check then sees the winner → 409.
  // Bookings at different pitches touch different documents and don't wait
  // on each other. Requires a replica set (Atlas is one).
  //
  // Keep side effects (notifications etc.) out of here — a retried
  // transaction would repeat them. Do them after this returns.
  private async bookSlot(
    session: Session,
    startTime: Date,
    stopTime: Date,
    update: UpdateQuery<Session>,
  ) {
    try {
      return await this.connection.transaction(async (tx) => {
        await this.locationRepository
          .findRaw()
          .updateOne({ _id: session.location }, { $inc: { bookingVersion: 1 } }, { session: tx });

        await this.assertSlotAvailable(session.location, session._id, startTime, stopTime, tx);

        return this.sessionRepository
          .findRaw()
          .findOneAndUpdate({ _id: session._id }, update, { session: tx, new: true, lean: true });
      });
    } catch (error: any) {
      if (/replica set|Transaction numbers/i.test(error?.message ?? '')) {
        this.logger.error(
          'Booking needs MongoDB transactions, which require a replica set. ' +
            'Atlas works; a local standalone mongod must be started with --replSet.',
        );
      }
      throw error;
    }
  }

  // A pitch can only host one session at a time. Scoped to this pitch, and
  // ignores the session being (re)configured itself and sessions that were
  // cancelled/refunded — those no longer hold the slot. An exact time match
  // is just an overlap, so one query covers both. Runs inside bookSlot's
  // transaction.
  private async assertSlotAvailable(
    locationId: any,
    sessionId: any,
    startTime: Date,
    stopTime: Date,
    tx: ClientSession,
  ) {
    const clash = await this.sessionRepository
      .findRaw()
      .findOne(
        {
          _id: { $ne: new Types.ObjectId(sessionId.toString()) },
          location: new Types.ObjectId(locationId.toString()),
          status: { $nin: [SESSION_STATUS.CANCELLED, SESSION_STATUS.REFUNDED] },
          startTime: { $lt: stopTime },
          stopTime: { $gt: startTime },
        },
        { _id: 1 },
        { session: tx },
      )
      .lean();

    if (clash) {
      throw new CustomHttpException(
        'This time overlaps with another session at this pitch',
        HttpStatus.CONFLICT,
      );
    }
  }

  // Hourly pitches are POOL: the owner's pricePerHour × hours is the total the
  // whole session pays, split however members choose. Monthly pitches have
  // no session bill at all: every member needs a monthly pass covering the
  // session (requiresPass).
  private buildPaymentConfig(location: any, timeDurationMins: number) {
    if (location?.tier !== LOCATION_TIER.PAID) {
      return {
        paymentRequired: false,
        paymentAmount: 0,
        paymentMode: SESSION_PAYMENT_MODE.POOL,
        paymentTarget: 0,
        requiresPass: false,
      };
    }

    if (location.pricingOption === LOCATION_PRICING_OPTION.HOURLY) {
      if (!location.pricePerHour || location.pricePerHour <= 0) {
        throw new CustomHttpException(
          'This pitch has no total hourly price set yet — the owner must set pricePerHour before paid bookings',
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
        paymentAmount: 0,
        paymentMode: SESSION_PAYMENT_MODE.POOL,
        paymentTarget: location.pricePerHour * hourUnits,
        requiresPass: false,
      };
    }

    if (location.pricingOption === LOCATION_PRICING_OPTION.MONTHLY) {
      if (!location.paymentPerPersonMonthly || location.paymentPerPersonMonthly <= 0) {
        throw new CustomHttpException(
          'Monthly pricing is selected but paymentPerPersonMonthly is missing',
          HttpStatus.BAD_REQUEST,
        );
      }

      return {
        paymentRequired: false,
        paymentAmount: 0,
        paymentMode: SESSION_PAYMENT_MODE.PER_PERSON,
        paymentTarget: 0,
        requiresPass: true,
      };
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
    private readonly cacheService: CacheService,
    @InjectConnection() private readonly connection: Connection,
    private readonly setsService: SetsService,
    private readonly monthlyPassService: MonthlyPassService,
  ) {}

  onModuleInit() {
    // Buy-to-join: once the pass is paid, add the player to the session
    // whose spot was held for them.
    this.monthlyPassService.onActivated((pass) => this.completeHeldJoin(pass));
  }

  // 402 for a player without a pass covering the session, with what the app
  // needs to offer one (price, or that the pitch isn't selling right now).
  private async passRequired(locationId: Types.ObjectId | string, sessionId: string) {
    const offer = await this.monthlyPassService.passOffer(new Types.ObjectId(locationId.toString()));
    return new CustomHttpException(
      offer.price
        ? 'You need a monthly pass for this pitch to join'
        : "You need a monthly pass to play here, but this pitch isn't selling passes right now",
      HttpStatus.PAYMENT_REQUIRED,
      { code: 'PASS_REQUIRED', sessionId, pass: offer },
    );
  }

  private async completeHeldJoin(pass: MonthlyPassRow): Promise<void> {
    if (!pass.holdSessionId) return;
    const sessionId = pass.holdSessionId.toString();
    try {
      await this.joinSession(pass.userId.toString(), sessionId);
      this.logger.log(`Buy-to-join: ${pass.userId} joined ${sessionId} with pass ${pass._id}`);
    } catch (error: unknown) {
      // Paid and kept (MP-6): the pass is for the pitch, not this session.
      this.logger.warn(
        `Buy-to-join: ${pass.userId} has pass ${pass._id} but couldn't be added to ${sessionId}: ` +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }

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
      this.notificationService
        .send(NOTIFICATION_CHANNEL.PUSH, {
          type: NOTIFICATION_TYPE.SESSION_CREATED,
          targetUserId: location.owner.toString(),
          title: 'New Session Created',
          body: `A session has been created at ${location.name}`,
          payload: { sessionId: session._id.toString(), locationId },
        })
        .catch((err) => this.logger.error('Failed to send SESSION_CREATED push', err));
      // The owner's email waits for createSession: only then does the
      // session have a date, time and format worth telling them about.
    }

    return session;
  }

  // Emails the pitch owner a session's details (booked / rescheduled).
  // Fire-and-forget: a mail failure must never fail the booking.
  private emailOwnerAboutSession(
    type: NOTIFICATION_TYPE.SESSION_CREATED | NOTIFICATION_TYPE.SESSION_RESCHEDULED,
    location: Location,
    captainId: string,
    details: SessionEmailInput,
    extra: (owner: User, captainName: string) => Record<string, string> = () => ({}),
  ): void {
    Promise.all([
      this.userRepository.findOne({ _id: location.owner }),
      this.userRepository.findOne({ _id: captainId }),
    ])
      .then(([owner, captain]) => {
        if (!owner?.email) return;
        const captainName =
          captain?.nickname || [captain?.firstName, captain?.lastName].filter(Boolean).join(' ') || '';
        return this.notificationService.send(NOTIFICATION_CHANNEL.EMAIL, {
          type,
          to: owner.email,
          variables: {
            firstName: owner.firstName ?? 'there',
            locationName: location.name,
            captainName,
            ...sessionEmailDetails(details),
            ...extra(owner, captainName),
          },
        });
      })
      .catch((err: unknown) =>
        this.logger.error(`Failed to send ${type} email: ${err instanceof Error ? err.message : String(err)}`),
      );
  }

  async createSession(
    {
      setNumber,
      playersPerTeam,
      timeDuration,
      minsPerSet,
      startTime,
      winningDecider,
      rotationFormat,
    }: createSessionRequest,
    userId: string,
    sessionId: string,
  ) {

    if (sessionId === "" || sessionId === null || sessionId === undefined){
      throw new CustomHttpException(
        'Id is missing in route,  ',
        HttpStatus.BAD_REQUEST
      )
    }
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

    // At a monthly pitch the captain plays too, so they need a pass as well.
    const captainPass = paymentConfig.requiresPass
      ? await this.monthlyPassService.findCoveringPass(new Types.ObjectId(userId), location._id, new Date(startTime))
      : null;
    if (paymentConfig.requiresPass && !captainPass) {
      throw await this.passRequired(location._id, sessionId);
    }

    const maxNumber = playersPerTeam * setNumber;

    const newSession = await this.bookSlot(
      session,
      new Date(startTime),
      addedStopTime,
      {
        setNumber,
        playersPerTeam,
        minsPerSet,
        timeDuration,
        startTime,
        stopTime: addedStopTime,
        winningDecider,
        rotationFormat: rotationFormat ?? ROTATION_FORMAT.WINNER_STAYS,
        maxNumber,
        members: [userId],
        isFull: maxNumber <= 1,
        paymentRequired: paymentConfig.paymentRequired,
        paymentAmount: paymentConfig.paymentAmount,
        paymentMode: paymentConfig.paymentMode,
        paymentTarget: paymentConfig.paymentTarget,
        amountPaid: 0,
        amountReserved: 0,
        paymentStatus: paymentConfig.paymentRequired ? 'NOT_INITIATED' : 'COMPLETED',
        allPaymentsCompleted: !paymentConfig.paymentRequired,
        requiresPass: paymentConfig.requiresPass,
        ...(location.tier === LOCATION_TIER.PAID && location.pricingOption && { pricingOption: location.pricingOption }),
        passHolders: captainPass ? [{ userId: new Types.ObjectId(userId), passId: captainPass._id }] : [],
        passHolds: [],
      },
    );

    if (location.owner) {
      this.notificationService
        .send(NOTIFICATION_CHANNEL.PUSH, {
          type: NOTIFICATION_TYPE.SESSION_CONFIGURED,
          targetUserId: location.owner.toString(),
          title: 'Session Configured',
          body: `A session at ${location.name} has been configured and is ready`,
          payload: { sessionId, locationId: session.location.toString() },
        })
        .catch((err) => this.logger.error('Failed to send SESSION_CONFIGURED push', err));

      this.emailOwnerAboutSession(NOTIFICATION_TYPE.SESSION_CREATED, location, userId, {
        startTime: new Date(startTime),
        stopTime: addedStopTime,
        timeDuration,
        playersPerTeam,
        setNumber,
        rotationFormat: rotationFormat ?? ROTATION_FORMAT.WINNER_STAYS,
        winningDecider,
        paymentRequired: paymentConfig.paymentRequired,
        paymentMode: paymentConfig.paymentMode,
        paymentAmount: paymentConfig.paymentAmount,
        paymentTarget: paymentConfig.paymentTarget,
        pricingOption: location.pricingOption,
      });
    }

    return newSession;
  }

  // `location` can be passed in when the caller already fetched it (e.g.
  // recheduleSession, which needs it for other checks too) to avoid a
  // redundant lookup; otherwise it's fetched here.
  private async verifyCaptainOrOwner(
    session: Session,
    userId: string,
    actionLabel: string,
    location?: Location | null,
  ): Promise<void> {
    const loc = location !== undefined ? location : await this.locationRepository.findOne({ _id: session.location });
    const isCaptain = session.captain?.toString() === userId;
    const isOwner = loc?.owner?.toString() === userId;
    if (!isCaptain && !isOwner) {
      throw new CustomHttpException(
        `Only the captain or location owner can ${actionLabel} this session`,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  async notifySessionMembers(
    sessionId: string,
    userId: string,
    title: string,
    body: string,
  ): Promise<{ message: string }> {
    const session = await this.sessionRepository.findOne({ _id: sessionId });
    if (!session) throw new CustomHttpException('Session not found', HttpStatus.NOT_FOUND);

    await this.verifyCaptainOrOwner(session, userId, 'send a broadcast for');

    const cooldownKey = `broadcast-cooldown:${sessionId}`;
    if (await this.cacheService.get(cooldownKey)) {
      throw new CustomHttpException(
        'A broadcast was already sent for this session recently — please wait a few minutes before sending another',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const memberIds = session.members.map((m) => m.toString());
    await Promise.all(
      memberIds.map((targetUserId) =>
        this.notificationService
          .send(NOTIFICATION_CHANNEL.PUSH, {
            type: NOTIFICATION_TYPE.SESSION_BROADCAST,
            targetUserId,
            title,
            body,
            payload: { sessionId },
          })
          .catch((err) => this.logger.error(`Failed to send broadcast to ${targetUserId}`, err)),
      ),
    );

    await this.cacheService.set(cooldownKey, '1', 300); // 5 min TTL

    return { message: 'Broadcast sent to all session members' };
  }

  async endSession(sessionId: string, userId: string) {
    const session: Session = await this.sessionRepository.findOne({
      _id: sessionId,
    });
    if (!session)
      throw new CustomHttpException('Session not found', HttpStatus.NOT_FOUND);

    await this.verifyCaptainOrOwner(session, userId, 'end');
    await this.markEnded(new Types.ObjectId(session._id.toString()));

    return { message: 'Session ended successfully', session };
  }

  // What the End button does — also used by the lifecycle job's close-out.
  // Only acts on a session that isn't closed yet. Returns false if it was.
  async markEnded(sessionId: Types.ObjectId): Promise<boolean> {
    const ended = await this.sessionRepository.markEndedIfOpen(sessionId);
    if (!ended) return false;
    await this.clearCurrentSessionPointers([sessionId]);
    return true;
  }

  // Cancels a still-open session and refunds every payment on it. Shared by
  // the Cancel button (after its permission checks) and the lifecycle job's
  // auto-cancel. `extra` narrows the conditional update (e.g. "still not
  // paid"), so a payment completing in the same instant wins. Returns null
  // if the session was already closed or no longer matched.
  async cancelAndRefund(
    sessionId: Types.ObjectId,
    reason: SESSION_CANCEL_REASON | null,
    extra: Record<string, unknown> = {},
  ) {
    const cancelled = await this.sessionRepository.cancelIfOpen(sessionId, reason, extra);
    if (!cancelled) return null;

    const id = sessionId.toString();
    const refunds = await this.sessionPaymentService.refundAllForSession(id);
    await this.clearCurrentSessionPointers([sessionId]);
    await this.sessionPaymentService.publishSessionUpdate(id, 'cancelled');

    if (!refunds.allInitiated) {
      const failedCount = refunds.results.filter((r) => !r.success).length;
      this.logger.error(
        `Session ${id} cancelled but ${failedCount}/${refunds.totalPaid} refund requests were rejected by Paystack — needs manual follow-up`,
      );
    }
    return { session: cancelled, refunds };
  }

  // user.currentSession is kept for the app's profile, but never trusted for
  // decisions (see findCurrentForUser). Clear any that point at these.
  async clearCurrentSessionPointers(sessionIds: Types.ObjectId[]): Promise<void> {
    if (sessionIds.length === 0) return;
    await this.userRepository.updateMany(
      { currentSession: { $in: sessionIds } },
      { $set: { currentSession: null } },
    );
  }

  async joinSession(userId: string, sessionId: string) {
    const session = await this.sessionRepository.findOne({ _id: sessionId });
    if (!session)
      throw new CustomHttpException('Session not found', HttpStatus.NOT_FOUND);

    if (!session.maxNumber || session.maxNumber <= 0) {
      throw new CustomHttpException(
        'Session has not been configured yet',
        HttpStatus.BAD_REQUEST,
      );
    }

    const exists = session.members.some((id) => id.equals(userId));

    if (exists)
      throw new CustomHttpException(
        'User already in this session',
        HttpStatus.CONFLICT,
      );

    if (session.isFull) {
      throw new CustomHttpException('Session is full', HttpStatus.BAD_REQUEST);
    }

    // At a monthly pitch the player needs a pass covering the session's start
    // (MP-5). The pass used is recorded on the session now and never
    // recomputed, so a later expiry or pricing change can't un-cover them.
    const userObjectId = new Types.ObjectId(userId);
    let pass: MonthlyPassRow | null = null;
    if (session.requiresPass) {
      pass = await this.monthlyPassService.findCoveringPass(userObjectId, new Types.ObjectId(session.location.toString()), new Date(session.startTime));
      if (!pass) throw await this.passRequired(session.location, sessionId);
    }

    // Add the player only if there's still room and they aren't in yet —
    // checked inside the update, so two players racing for the last spot
    // can't both get in (the earlier read above is just for clear errors).
    // Spots held for players buying a pass count as taken (their own doesn't).
    const joined: Session | null = await this.sessionRepository.findOneAndUpdate(
      {
        _id: sessionId,
        isFull: { $ne: true },
        members: { $ne: userId },
        $expr: roomForExpr(userObjectId, new Date()),
      },
      {
        $push: { members: userId, ...(pass && { passHolders: { userId: userObjectId, passId: pass._id } }) },
        $pull: { passHolds: { userId: userObjectId } },
      },
    );
    if (!joined) {
      const now: Session | null = await this.sessionRepository.findOne({ _id: sessionId });
      if (now?.members.some((id) => String(id) === String(userId))) {
        throw new CustomHttpException('User already in this session', HttpStatus.CONFLICT);
      }
      throw new CustomHttpException('Session is full', HttpStatus.BAD_REQUEST);
    }

    await this.userRepository.findOneAndUpdate(
      { _id: userId },
      { currentSession: sessionId },
    );
    await this.sessionPaymentService.publishSessionUpdate(sessionId, 'joined');

    // Only the join that took the last spot flips isFull, so "session full"
    // (open payment / make teams) runs exactly once.
    let updatedSession = joined;
    if (joined.members.length >= joined.maxNumber) {
      const filled: Session | null = await this.sessionRepository.findOneAndUpdate(
        { _id: sessionId, isFull: { $ne: true } },
        { $set: { isFull: true } },
      );
      if (filled) {
        updatedSession = filled;
        if (filled.paymentRequired) {
          await this.onSessionFull(filled);
        } else {
          this.allocateTeams(sessionId);
        }
      }
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

    // A member who already paid can't just leave and let the owner keep the
    // money — a refund must at least be *requested* first (Paystack refunds
    // are asynchronous, so we can't wait for it to actually settle here —
    // see SessionPaymentService.refundPayment). Only relevant before the
    // session has been played; skip for free sessions or once it's finished
    // (that's not a "leave", that's just... it happened).
    const isPool = session.paymentMode === SESSION_PAYMENT_MODE.POOL;

    if (isPool && session.paymentRequired && !session.finished) {
      // Before the pot is full: their contributions are refunded. After:
      // they leave with no refund (see handlePoolMemberLeave).
      try {
        await this.sessionPaymentService.handlePoolMemberLeave(sessionId, userId);
      } catch (error: any) {
        this.logger.error(
          `Refund request failed while ${userId} tried to leave pool session ${sessionId}: ${error.message}`,
        );
        throw new CustomHttpException(
          'Could not start your refund, so you cannot leave yet. Please try again shortly.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    } else if (session.paymentRequired && !session.finished) {
      let payment: any = null;
      try {
        payment = await this.sessionPaymentService.getUserSessionPayment(sessionId, userId);
      } catch {
        // No payment record for this user on this session — nothing to refund.
      }

      if (payment && payment.status === PaymentStatus.PAID) {
        try {
          await this.sessionPaymentService.refundPayment(payment._id.toString(), 'Player left session');
        } catch (error: any) {
          this.logger.error(
            `Refund request failed while ${userId} tried to leave session ${sessionId}: ${error.message}`,
          );
          throw new CustomHttpException(
            'Could not start your refund, so you cannot leave yet. Please try again shortly.',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      }
    }

    try {
      const [updatedSession] = await Promise.all([
        this.sessionRepository.findOneAndUpdate(
          { _id: sessionId },
          {
            // A pass is never refunded for leaving a session (MP-6); the
            // player just stops being one of its pass holders.
            $pull: {
              members: userId,
              passHolders: { userId: new Types.ObjectId(userId) },
              passHolds: { userId: new Types.ObjectId(userId) },
            },
            $set: { isFull: false },
          },
        ),
        this.userRepository.findOneAndUpdate({ _id: userId }, { currentSession: null }),
      ]);

      if (isPool && session.paymentRequired) {
        // Also sends the session update.
        await this.sessionPaymentService.publishPoolUpdate(sessionId, 'member_left');
      } else {
        await this.sessionPaymentService.publishSessionUpdate(sessionId, 'member_left');
      }

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

  // The player's current or next session, worked out from the sessions
  // themselves (never stale, and right when they're in several).
  async getMyCurrentSession(userId: string) {
    const current = await this.sessionRepository.findCurrentForUser(new Types.ObjectId(userId), new Date());
    if (!current) return null;
    return this.viewSession(current._id.toString());
  }

  async viewSession(sessionId: string) {
    const session = await this.sessionRepository
      .findRaw()
      .findOne({ _id: sessionId })
      .populate({ path: 'members', select: PUBLIC_USER_FIELDS })
      .populate('location')
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
    // `date` is a Lagos calendar day: 00:00–24:00 Lagos time, not UTC.
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const key = ymd ? date : lagosDateKey(new Date(date));
    const [y, m, d] = key.split('-').map(Number);
    const start = lagosMidnight(y, m, d);
    const end = new Date(lagosMidnight(y, m, d + 1).getTime() - 1);

    const sessions = await this.sessionRepository
      .findRaw()
      .find({
        location: new Types.ObjectId(locationId),
        startTime: { $gte: start, $lte: end },
      })
      .populate('captain', PUBLIC_USER_FIELDS)
      .populate('members', PUBLIC_USER_FIELDS)
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
        .populate('captain', PUBLIC_USER_FIELDS)
        .populate('members', PUBLIC_USER_FIELDS)
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

    await this.verifyCaptainOrOwner(session, userId, 'delete');

    if (session.paymentRequired) {
      const hasUnresolvedPayments = await this.sessionPaymentService.hasUnresolvedPayments(sessionId);
      if (hasUnresolvedPayments) {
        throw new CustomHttpException(
          'This session has paid members whose refunds have not cleared yet — cancel it first (if not already) and wait for refunds to settle before deleting',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

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

  // Cancels a session and requests a refund for every member who paid.
  // Captain/owner only, same guard pattern as end/delete/reschedule.
  //
  // Paystack refunds are asynchronous (can take up to 10 business days to
  // settle), so this can only ever report that refunds were *requested*,
  // not completed. The session stays CANCELLED — SessionPaymentService
  // flips it to REFUNDED on its own once every payment's refund.processed
  // webhook has actually arrived (see maybeCompleteSessionRefund there).
  // A request that Paystack itself rejects immediately (bad reference,
  // already refunded, etc.) shows up in refunds.results and needs manual
  // follow-up — it will not be retried automatically.
  async cancelSession(sessionId: string, userId: string) {
    const session: Session = await this.sessionRepository.findOne({
      _id: sessionId,
    });
    if (!session)
      throw new CustomHttpException('Session not found', HttpStatus.NOT_FOUND);

    await this.verifyCaptainOrOwner(session, userId, 'cancel');

    if (session.status === SESSION_STATUS.CANCELLED || session.status === SESSION_STATUS.REFUNDED) {
      throw new CustomHttpException('Session is already cancelled', HttpStatus.BAD_REQUEST);
    }

    if (session.status === SESSION_STATUS.COMPLETED || session.finished) {
      throw new CustomHttpException('Cannot cancel a completed session', HttpStatus.BAD_REQUEST);
    }

    const result = await this.cancelAndRefund(new Types.ObjectId(session._id.toString()), null);
    if (!result) {
      throw new CustomHttpException('Session is already cancelled', HttpStatus.BAD_REQUEST);
    }
    const { session: updatedSession, refunds: refundSummary } = result;

    return {
      message:
        refundSummary.totalPaid === 0
          ? 'Session cancelled'
          : refundSummary.allInitiated
            ? 'Session cancelled — refunds have been requested and will settle over the next few days'
            : 'Session cancelled — some refund requests failed and need manual follow-up',
      session: updatedSession,
      refunds: refundSummary,
    };
  }

  private notifyOwnerRescheduled(
    before: Session,
    after: Session,
    startTime: Date,
    stopTime: Date,
    location: Location,
    rescheduledById: string,
  ): void {
    const previous = before.startTime && before.stopTime ? sessionWhen(before.startTime, before.stopTime) : null;
    const now = sessionWhen(startTime, stopTime);

    this.notificationService
      .send(NOTIFICATION_CHANNEL.PUSH, {
        type: NOTIFICATION_TYPE.SESSION_RESCHEDULED,
        targetUserId: location.owner.toString(),
        title: 'Session Rescheduled',
        body: `A session at ${location.name} moved to ${now.date}, ${now.time}`,
        payload: { sessionId: after._id.toString(), locationId: location._id.toString() },
      })
      .catch((err) => this.logger.error('Failed to send SESSION_RESCHEDULED push', err));

    const captainId = (after.captain ?? before.captain)?.toString() ?? rescheduledById;
    this.emailOwnerAboutSession(
      NOTIFICATION_TYPE.SESSION_RESCHEDULED,
      location,
      captainId,
      {
        startTime,
        stopTime,
        timeDuration: after.timeDuration,
        playersPerTeam: after.playersPerTeam,
        setNumber: after.setNumber,
        rotationFormat: after.rotationFormat,
        winningDecider: after.winningDecider,
        paymentRequired: after.paymentRequired,
        paymentMode: after.paymentMode,
        paymentAmount: after.paymentAmount,
        paymentTarget: after.paymentTarget,
        pricingOption: location.pricingOption,
      },
      (owner, captainName) => ({
        previousDate: previous?.date ?? '',
        previousTime: previous?.time ?? '',
        rescheduledBy: owner._id.toString() === rescheduledById ? 'you' : captainName || 'the captain',
      }),
    );
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

    await this.verifyCaptainOrOwner(session, userId, 'reschedule', location);

    this.validateSessionWithinOperatingHours(location, new Date(startTime), addedStopTime);
    const paymentConfig = this.buildPaymentConfig(location, timeDuration);

    // Once payment has opened (or anyone has money in the pot), the payment
    // terms are frozen: changing the price, or flipping a legacy
    // PER_PERSON session to POOL, under existing payment rows would leave
    // players paying against terms that no longer match.
    const paymentsStarted =
      ['PENDING', 'COMPLETED'].includes(session.paymentStatus) ||
      (session.amountPaid ?? 0) + (session.amountReserved ?? 0) > 0;

    const currentMode = session.paymentMode ?? SESSION_PAYMENT_MODE.PER_PERSON;
    const termsChanged =
      paymentConfig.paymentMode !== currentMode ||
      (paymentConfig.paymentTarget ?? 0) !== (session.paymentTarget ?? 0) ||
      (paymentConfig.paymentAmount ?? 0) !== (session.paymentAmount ?? 0);

    if (paymentsStarted && termsChanged) {
      throw new CustomHttpException(
        'Payment has already started for this session — keep the same duration, or cancel it and create a new one',
        HttpStatus.CONFLICT,
      );
    }

    const paymentFields = paymentsStarted
      ? {}
      : {
          paymentRequired: paymentConfig.paymentRequired,
          paymentAmount: paymentConfig.paymentAmount,
          paymentMode: paymentConfig.paymentMode,
          paymentTarget: paymentConfig.paymentTarget,
          paymentStatus: paymentConfig.paymentRequired ? 'NOT_INITIATED' : 'COMPLETED',
          allPaymentsCompleted: !paymentConfig.paymentRequired,
        };

    const updatedSession = await this.bookSlot(session, new Date(startTime), addedStopTime, {
      startTime,
      timeDuration,
      stopTime: addedStopTime,
      ...paymentFields,
    });

    if (location.owner && updatedSession) {
      try {
        this.notifyOwnerRescheduled(session, updatedSession, new Date(startTime), addedStopTime, location, userId);
      } catch (err: unknown) {
        // Telling the owner must never fail the reschedule itself.
        this.logger.error(`Failed to notify owner of reschedule: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return {
      message: 'Session rescheduled successfully',
      session: updatedSession,
    };
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

  // Free sessions and pass sessions (monthly pitches) have no payment to
  // wait for, so their teams are made the moment they fill (paid sessions get theirs when the last payment lands, in
  // SessionPaymentService). Fire-and-forget like the paid path: a failure
  // must never fail the join, and POST /sets/create/:sessionId is the manual
  // fallback. createSet refuses if teams already exist, so a repeat is harmless.
  private allocateTeams(sessionId: string): void {
    this.setsService
      .createSet(sessionId)
      .then(() => this.sessionPaymentService.publishSessionUpdate(sessionId, 'teams_ready'))
      .catch((error: unknown) =>
        this.logger.error(
          `Auto set-allocation failed for unpaid session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
  }

  async onSessionFull(session: Session) {
    const isPool = session.paymentMode === SESSION_PAYMENT_MODE.POOL;
    if (isPool ? !(session.paymentTarget > 0) : !(session.paymentAmount > 0)) return;

    const location = await this.locationRepository.findOne({ _id: session.location });
    if (!location || !location.owner) {
      throw new CustomHttpException('Location owner not found', HttpStatus.BAD_REQUEST);
    }

    if (location.tier !== LOCATION_TIER.PAID) {
      // The pitch went free after this session was booked: nothing to pay,
      // so it gets its teams straight away like any free session.
      await this.sessionRepository.findOneAndUpdate(
        { _id: session._id },
        { paymentRequired: false, paymentStatus: 'COMPLETED', allPaymentsCompleted: true },
      );
      this.allocateTeams(session._id.toString());
      return;
    }

    const paymentDeadline = new Date();
    paymentDeadline.setHours(paymentDeadline.getHours() + 24);

    if (isPool) {
      // Open the pot. No rows are pre-created — each contribution creates
      // its own at checkout. Only from NOT_INITIATED, so a session that
      // fills up again after someone leaves can't reset a funded pot.
      const opened = await this.sessionRepository.findOneAndUpdate(
        { _id: session._id, paymentStatus: 'NOT_INITIATED' },
        { paymentStatus: 'PENDING', paymentDeadline, allPaymentsCompleted: false },
      );
      if (opened) {
        await this.sessionPaymentService.publishPoolUpdate(session._id.toString(), 'pool_opened');
      }
      return;
    }

    // PER_PERSON: only sessions created before pooling (monthly sessions no
    // longer bill — they need passes instead). Billed at the session's own
    // price, never the pitch's current settings.
    const memberIds = session.members.map((m) => new Types.ObjectId(m));

    await Promise.all([
      this.sessionPaymentService.initializeSessionPayments(
        session._id,
        new Types.ObjectId(session.location.toString()),
        new Types.ObjectId(location.owner.toString()),
        memberIds,
        session.paymentAmount,
        paymentDeadline,
        session.pricingOption,
      ),
      this.sessionRepository.findOneAndUpdate(
        { _id: session._id },
        { paymentStatus: 'PENDING', paymentDeadline, allPaymentsCompleted: false },
      ),
    ]);
    await this.sessionPaymentService.publishSessionUpdate(session._id.toString(), 'billing_opened');
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
