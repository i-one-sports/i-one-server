import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  CustomHttpException,
  MATCH_STATUS,
  REFEREE_MODE,
  REFEREE_STATUS,
  SESSION_STATUS,
  SessionReferee,
  internationalisePhoneNumber,
} from '@app/common';
import { SessionRefereeRepository } from './referees.repository';
import { SessionRepository } from 'src/sessions/sessions.repository';
import { LocationRepository } from 'src/locations/locations.repository';
import { UserRepository } from 'src/users/users.repository';
import { MatchRepository } from 'src/matches/matches.repository';
import { CaptainsService } from 'src/captains/captains.service';
import { NotificationOutboxService } from 'src/notifications/notification-outbox.service';
import { NOTIFICATION_TYPE } from 'src/notifications/notification.types';

const CLOSED_SESSION_STATUSES = [SESSION_STATUS.CANCELLED, SESSION_STATUS.COMPLETED, SESSION_STATUS.REFUNDED];
const PUBLIC_USER_FIELDS = 'firstName lastName nickname avatar';

// The session's referee roster (screens 12–14). Assigning a roster entry to a
// particular match lives in MatchRefereeService, because that's where the
// per-match eligibility rule (not playing in that match) is checked.
@Injectable()
export class RefereesService {
  private readonly logger = new Logger(RefereesService.name);

  constructor(
    private readonly refereeRepository: SessionRefereeRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly locationRepository: LocationRepository,
    private readonly userRepository: UserRepository,
    private readonly matchRepository: MatchRepository,
    private readonly captainsService: CaptainsService,
    private readonly outbox: NotificationOutboxService,
  ) {}

  // Captain picks an i-One user to referee on their own phone.
  async invite(sessionId: string, captainId: string, userId: string) {
    const session = await this.getOpenSession(sessionId);
    await this.assertCaptain(session, captainId);

    const invitee = await this.userRepository.findOne({ _id: userId });
    if (!invitee) throw new CustomHttpException('User not found', HttpStatus.NOT_FOUND);

    const existing = await this.refereeRepository.findOne({ session: session._id, user: invitee._id });
    if (existing && existing.status !== REFEREE_STATUS.DECLINED) {
      throw new CustomHttpException('This person is already on the referee list for this session', HttpStatus.BAD_REQUEST);
    }

    const fields = {
      mode: REFEREE_MODE.OWN_PHONE,
      status: REFEREE_STATUS.INVITED,
      invitedBy: new Types.ObjectId(captainId),
    };
    let entry: SessionReferee;
    if (existing) {
      // Re-inviting someone who declined. Filter on DECLINED so a racing
      // accept/second invite can't be overwritten.
      entry = await this.refereeRepository.findOneAndUpdate(
        { _id: existing._id, status: REFEREE_STATUS.DECLINED },
        { ...fields, $unset: { respondedAt: 1, deviceOwner: 1 } },
      );
      if (!entry) throw new CustomHttpException('This person is already on the referee list for this session', HttpStatus.BAD_REQUEST);
    } else {
      entry = await this.createEntry({ session: session._id, user: invitee._id, ...fields });
    }

    const captain = await this.userRepository.findOne({ _id: captainId });
    // No dedupeKey: a re-invite after a decline should notify again, and the
    // duplicate-invite check above already stops repeats while one is open.
    this.outbox
      .enqueue({
        type: NOTIFICATION_TYPE.REFEREE_INVITE,
        targetUserId: userId,
        title: 'Referee invite',
        body: `${captain?.firstName ?? 'A captain'} picked you to referee a session. Tap to accept or decline.`,
        payload: { sessionId, refereeId: entry._id.toString() },
      })
      .catch((err) => this.logger.error('Failed to queue REFEREE_INVITE', err));

    return this.toPublic(entry);
  }

  async respond(refereeId: string, userId: string, accept: boolean) {
    const entry = await this.refereeRepository.findOne({ _id: refereeId });
    if (!entry || entry.user?.toString() !== userId) {
      throw new CustomHttpException('Invite not found', HttpStatus.NOT_FOUND);
    }
    await this.getOpenSession(entry.session.toString());

    const updated = await this.refereeRepository.findOneAndUpdate(
      { _id: refereeId, status: REFEREE_STATUS.INVITED },
      { status: accept ? REFEREE_STATUS.ACCEPTED : REFEREE_STATUS.DECLINED, respondedAt: new Date() },
    );
    if (!updated) {
      throw new CustomHttpException(`This invite was already ${entry.status.toLowerCase()}`, HttpStatus.BAD_REQUEST);
    }
    return this.toPublic(updated);
  }

  // Captain hands their phone to a referee (Referee mode). Accepted straight
  // away — the referee is standing there. Results from these matches need the
  // opposing side's confirmation before they count (MatchRefereeService).
  async addOnCaptainDevice(sessionId: string, captainId: string, guestName: string, rawPhone: string) {
    const session = await this.getOpenSession(sessionId);
    await this.assertCaptain(session, captainId);

    // Strip spacing here too, not only in the DTO: internationalisePhoneNumber
    // works on digit counts, so "0803 412 7788" would come out wrong.
    const guestPhone = internationalisePhoneNumber(rawPhone.replace(/[\s-]/g, ''));
    const linked = await this.userRepository.findOne({ phoneNumber: guestPhone });

    const key = linked ? { session: session._id, user: linked._id } : { session: session._id, guestPhone };
    const existing = await this.refereeRepository.findOne(key);
    if (existing?.status === REFEREE_STATUS.ACCEPTED && existing.mode === REFEREE_MODE.OWN_PHONE) {
      throw new CustomHttpException(
        'This person is already refereeing this session on their own phone',
        HttpStatus.BAD_REQUEST,
      );
    }

    const fields = {
      guestName: guestName.trim(),
      guestPhone,
      mode: REFEREE_MODE.CAPTAIN_DEVICE,
      deviceOwner: new Types.ObjectId(captainId),
      status: REFEREE_STATUS.ACCEPTED,
      invitedBy: new Types.ObjectId(captainId),
      respondedAt: new Date(),
    };
    const entry = existing
      ? await this.refereeRepository.findOneAndUpdate({ _id: existing._id }, fields)
      : await this.createEntry({ ...key, ...fields });

    return this.toPublic(entry);
  }

  async roster(sessionId: string, userId: string) {
    const session = await this.sessionRepository.findOne({ _id: sessionId });
    if (!session) throw new CustomHttpException('Session not found', HttpStatus.NOT_FOUND);

    const entries: SessionReferee[] = await this.refereeRepository
      .findRaw()
      .find({ session: session._id })
      .populate('user', PUBLIC_USER_FIELDS)
      .sort({ createdAt: 1 })
      .lean();

    const isMember = (session.members ?? []).some((m: any) => m.toString() === userId);
    const isOnRoster = entries.some((e: any) => (e.user?._id ?? e.user)?.toString() === userId);
    if (!isMember && !isOnRoster && !(await this.isCaptain(session, userId)) && !(await this.isOwner(session, userId))) {
      throw new CustomHttpException('Only people in this session can see its referees', HttpStatus.FORBIDDEN);
    }

    return entries.map((e) => this.toPublic(e));
  }

  // "refereed 4 sessions": distinct sessions with a finished match this person
  // refereed, including matches they handed off part-way through.
  async history(userId: string) {
    if (!Types.ObjectId.isValid(userId)) throw new CustomHttpException('Invalid user id', HttpStatus.BAD_REQUEST);
    const entryIds = await this.refereeRepository.findRaw().distinct('_id', { user: new Types.ObjectId(userId) });
    const sessions = entryIds.length
      ? await this.matchRepository.findRaw().distinct('session', {
          status: MATCH_STATUS.FINISHED,
          $or: [{ referee: { $in: entryIds } }, { 'refereeHistory.referee': { $in: entryIds } }],
        })
      : [];
    return { userId, refereedSessions: sessions.length };
  }

  // ---- used by MatchRefereeService ----

  async findById(id: string | Types.ObjectId): Promise<SessionReferee | null> {
    return this.refereeRepository.findOne({ _id: id });
  }

  // Every roster entry belonging to this person — by account, or as the
  // phone a Referee-mode guest is recording on.
  async entryIdsFor(entry: SessionReferee): Promise<Types.ObjectId[]> {
    if (!entry.user) return [entry._id];
    return this.refereeRepository.findRaw().distinct('_id', { user: entry.user });
  }

  async isCaptain(session: any, userId: string): Promise<boolean> {
    if (session.captain?.toString() === userId) return true;
    return this.captainsService.isCaptain(userId, session._id.toString());
  }

  async isOwner(session: any, userId: string): Promise<boolean> {
    const location = await this.locationRepository.findOne({ _id: session.location });
    return location?.owner?.toString() === userId;
  }

  // ---- helpers ----

  private async getOpenSession(sessionId: string) {
    const session = await this.sessionRepository.findOne({ _id: sessionId });
    if (!session) throw new CustomHttpException('Session not found', HttpStatus.NOT_FOUND);
    if (CLOSED_SESSION_STATUSES.includes(session.status)) {
      throw new CustomHttpException('This session is no longer open', HttpStatus.BAD_REQUEST);
    }
    return session;
  }

  private async assertCaptain(session: any, userId: string) {
    if (!(await this.isCaptain(session, userId))) {
      throw new CustomHttpException('Only a captain of this session can pick referees', HttpStatus.FORBIDDEN);
    }
  }

  private async createEntry(doc: Partial<SessionReferee>) {
    try {
      return await this.refereeRepository.create(doc);
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new CustomHttpException('This person is already on the referee list for this session', HttpStatus.BAD_REQUEST);
      }
      throw err;
    }
  }

  // Never expose a guest's phone number.
  private toPublic(entry: any) {
    const plain = typeof entry?.toObject === 'function' ? entry.toObject() : entry;
    const { guestPhone, ...rest } = plain ?? {};
    return rest;
  }
}
