import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { BADGE, CustomHttpException } from '@app/common';
import { UserBadgeRepository } from './user-badge.repository';
import { PlayerMatchStatRepository } from 'src/stats/player-match-stat.repository';
import { NotificationOutboxService } from 'src/notifications/notification-outbox.service';
import { NOTIFICATION_TYPE } from 'src/notifications/notification.types';

export const DROUGHT_SESSIONS = 7;

// Badges are checked when something happens, never on a timer that scans
// users: once per session, when it's over, for that session's players only.
@Injectable()
export class BadgesService {
  private readonly logger = new Logger(BadgesService.name);

  constructor(
    private readonly badgeRepository: UserBadgeRepository,
    private readonly statRepository: PlayerMatchStatRepository,
    private readonly outbox: NotificationOutboxService,
  ) {}

  // Called when a session is over (VotesService opens its vote). Only
  // players with no goal and no assist in this session's counted matches can
  // have just reached a drought, so only they are checked. Returns how many
  // badges were unlocked. Safe to repeat: unlocking is once ever per player.
  async checkSession(sessionId: Types.ObjectId): Promise<number> {
    const blanks = await this.statRepository.blankPlayersInSession(sessionId);

    let unlocked = 0;
    for (const user of blanks) {
      try {
        if (await this.checkDrought(user)) unlocked++;
      } catch (err: any) {
        this.logger.error(`Badge check failed for user ${user}: ${err.message}`);
        throw err; // leave the session unmarked so the votes job retries it
      }
    }
    return unlocked;
  }

  // Walks the player's counted matches newest first and stops at the first
  // goal or assist, or as soon as 7 whole sessions are known to be blank —
  // usually a handful of index entries. A player's sessions don't overlap, so
  // a session is complete once the walk has moved past it (or run out).
  async checkDrought(user: Types.ObjectId): Promise<boolean> {
    if (await this.badgeRepository.has(user, BADGE.LICENCE_TO_MISS)) return false;

    const blankSessions: Types.ObjectId[] = [];
    const cursor = this.statRepository.historyNewestFirst(user);
    try {
      for await (const row of cursor as any) {
        const last = blankSessions[blankSessions.length - 1];
        const newSession = !last || last.toString() !== row.session.toString();
        // Reaching an 8th session proves the 7th was blank all the way —
        // checked before this row's goals, which belong to that older session.
        if (newSession && blankSessions.length === DROUGHT_SESSIONS) break;
        if ((row.goals ?? 0) + (row.assists ?? 0) > 0) return false;
        if (newSession) blankSessions.push(row.session);
      }
    } finally {
      await cursor.close();
    }
    if (blankSessions.length < DROUGHT_SESSIONS) return false;
    return this.unlock(user, BADGE.LICENCE_TO_MISS, blankSessions);
  }

  // Once ever: the unique {user, badge} index makes a second unlock (a retry,
  // or two servers at once) a no-op, and only the first one notifies.
  private async unlock(user: Types.ObjectId, badge: BADGE, sessions: Types.ObjectId[]): Promise<boolean> {
    let created;
    try {
      created = await this.badgeRepository.create({ user, badge, unlockedAt: new Date(), sessions });
    } catch (err: any) {
      if (err?.code === 11000) return false;
      throw err;
    }

    // In-app over SSE + push, with retries (the outbox).
    await this.outbox
      .enqueue(
        {
          type: NOTIFICATION_TYPE.BADGE_UNLOCKED,
          targetUserId: user.toString(),
          title: 'New badge unlocked: 007',
          body: 'Licence to Miss. Seven sessions, no goal, no assist. Next game, na you!',
          payload: { badgeId: created._id.toString(), badge, sessions: sessions.length, goals: 0, assists: 0 },
        },
        { dedupeKey: `badge:${badge}:${user}` },
      )
      .catch((err) => this.logger.error(`Queuing ${badge} for ${user} failed`, err));
    return true;
  }

  // ---------------------------------------------------------------- API

  async mine(userId: string) {
    return this.badgeRepository.listFor(new Types.ObjectId(userId));
  }

  // Someone else's profile: shared badges only.
  async forProfile(userId: string, viewerId: string) {
    if (!Types.ObjectId.isValid(userId)) throw new CustomHttpException('Invalid user id', HttpStatus.BAD_REQUEST);
    if (userId === viewerId) return this.mine(userId);
    return this.badgeRepository.listFor(new Types.ObjectId(userId), true);
  }

  async markSeen(badgeId: string, userId: string) {
    return this.updateOwn(badgeId, userId, { seenAt: new Date() });
  }

  async setShared(badgeId: string, userId: string, shared: boolean) {
    return this.updateOwn(badgeId, userId, { shared });
  }

  private async updateOwn(badgeId: string, userId: string, set: Record<string, unknown>) {
    if (!Types.ObjectId.isValid(badgeId)) throw new CustomHttpException('Badge not found', HttpStatus.NOT_FOUND);
    const badge = await this.badgeRepository.findOneAndUpdate(
      { _id: badgeId, user: new Types.ObjectId(userId) },
      { $set: set },
    );
    if (!badge) throw new CustomHttpException('Badge not found', HttpStatus.NOT_FOUND);
    return badge;
  }
}
