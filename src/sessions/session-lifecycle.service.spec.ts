import { Types } from 'mongoose';
import { SESSION_CANCEL_REASON } from '@app/common';
import { LocationRepository } from 'src/locations/locations.repository';
import { UserRepository } from 'src/users/users.repository';
import { NotificationOutboxService } from 'src/notifications/notification-outbox.service';
import { NotificationService } from 'src/notifications/notification.service';
import { NOTIFICATION_TYPE } from 'src/notifications/notification.types';
import {
  AT_RISK_WARNING_AFTER_KICKOFF_MS,
  AUTO_CANCEL_AFTER_KICKOFF_MS,
  CLOSE_OUT_AFTER_END_MS,
  DRAFT_TTL_MS,
  SessionLifecycleService,
} from './session-lifecycle.service';
import { SessionRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';

const MIN = 60_000;

describe('SessionLifecycleService', () => {
  const now = new Date('2026-11-24T16:08:00.000Z'); // 17:08 Lagos
  const pitchId = new Types.ObjectId();
  const [ada, bayo, chi] = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];

  const paidSession = (minutesAfterKickoff: number, members = [ada, bayo]) => ({
    _id: new Types.ObjectId(),
    location: pitchId,
    members,
    startTime: new Date(now.getTime() - minutesAfterKickoff * MIN),
    paymentMode: 'POOL',
  });

  let sessions: Record<string, jest.Mock>;
  let sessionsService: Record<string, jest.Mock>;
  let users: { findRaw: jest.Mock };
  let locations: { findRaw: jest.Mock };
  let outbox: Record<string, jest.Mock>;
  let notifications: { sendEmailBatch: jest.Mock };
  let service: SessionLifecycleService;
  const lean = <T>(rows: T) => ({ select: () => ({ lean: () => Promise.resolve(rows) }) });

  beforeEach(() => {
    sessions = {
      findPaidNotReady: jest.fn().mockResolvedValue([]),
      findOverdueForCloseOut: jest.fn().mockResolvedValue([]),
      findStaleDrafts: jest.fn().mockResolvedValue([]),
      markEndedManyIfOpen: jest.fn().mockResolvedValue(0),
      cancelManyIfOpen: jest.fn().mockResolvedValue(0),
      isPaidNotReady: jest.fn(),
    };
    sessionsService = {
      cancelAndRefund: jest.fn(),
      clearCurrentSessionPointers: jest.fn().mockResolvedValue(undefined),
    };
    users = {
      findRaw: jest.fn(() => ({
        find: () =>
          lean([
            { _id: ada, email: 'ada@example.com', firstName: 'Ada' },
            { _id: bayo, email: 'bayo@example.com', firstName: '' },
            { _id: chi, email: 'chi@example.com', firstName: 'Chi' },
          ]),
      })),
    };
    locations = { findRaw: jest.fn(() => ({ find: () => lean([{ _id: pitchId, name: 'Lekki Turf' }]) })) };
    outbox = {
      registerRelevanceCheck: jest.fn(),
      // Every push is new unless a test says otherwise.
      enqueueManyReturningKeys: jest.fn((items: Array<{ options: { dedupeKey: string } }>) =>
        Promise.resolve(new Set(items.map((i) => i.options.dedupeKey))),
      ),
    };
    notifications = { sendEmailBatch: jest.fn().mockResolvedValue({ sent: 0, failed: 0 }) };
    service = new SessionLifecycleService(
      sessions as unknown as SessionRepository,
      sessionsService as unknown as SessionsService,
      users as unknown as UserRepository,
      locations as unknown as LocationRepository,
      outbox as unknown as NotificationOutboxService,
      notifications as unknown as NotificationService,
    );
  });

  describe('warning at kick-off + 7 min', () => {
    it('looks only at paid sessions 7–10 minutes past kick-off', async () => {
      await service.warnAtRisk(now);
      expect(sessions.findPaidNotReady).toHaveBeenCalledWith(
        new Date(now.getTime() - AUTO_CANCEL_AFTER_KICKOFF_MS),
        new Date(now.getTime() - AT_RISK_WARNING_AFTER_KICKOFF_MS),
        200,
      );
    });

    it('pushes and emails every member, in one outbox write and one email batch', async () => {
      const s1 = paidSession(8);
      const s2 = paidSession(9, [chi]);
      sessions.findPaidNotReady.mockResolvedValue([s1, s2]);

      await service.warnAtRisk(now);

      expect(outbox.enqueueManyReturningKeys).toHaveBeenCalledTimes(1);
      const pushes = outbox.enqueueManyReturningKeys.mock.calls[0][0];
      expect(pushes).toHaveLength(3);
      expect(pushes[0]).toMatchObject({
        params: { type: NOTIFICATION_TYPE.SESSION_AT_RISK, targetUserId: ada.toString(), title: 'Your game is about to be cancelled' },
        options: { deliverBefore: new Date(s1.startTime.getTime() + AUTO_CANCEL_AFTER_KICKOFF_MS) },
      });
      expect(pushes[0].params.body).toContain('Lekki Turf');

      expect(notifications.sendEmailBatch).toHaveBeenCalledTimes(1);
      const batch = notifications.sendEmailBatch.mock.calls[0][0];
      expect(batch.type).toBe(NOTIFICATION_TYPE.SESSION_AT_RISK);
      expect(batch.recipients.map((r: { to: string }) => r.to)).toEqual(['ada@example.com', 'bayo@example.com', 'chi@example.com']);
      expect(batch.recipients[0].variables).toEqual({ firstName: 'Ada', pitchName: 'Lekki Turf', startTimeLabel: expect.any(String), minutesLeft: '3' });
      expect(batch.recipients[1].variables.firstName).toBe('there'); // no first name on file
    });

    it('a repeat tick emails nobody again (their pushes were already queued)', async () => {
      sessions.findPaidNotReady.mockResolvedValue([paidSession(8)]);
      outbox.enqueueManyReturningKeys.mockResolvedValue(new Set());
      await service.warnAtRisk(now);
      expect(notifications.sendEmailBatch).not.toHaveBeenCalled();
    });

    it('only the people whose push was newly queued get an email', async () => {
      const s = paidSession(8);
      sessions.findPaidNotReady.mockResolvedValue([s]);
      outbox.enqueueManyReturningKeys.mockImplementation((items: Array<{ options: { dedupeKey: string }; params: { targetUserId: string } }>) =>
        Promise.resolve(new Set(items.filter((i) => i.params.targetUserId === bayo.toString()).map((i) => i.options.dedupeKey))),
      );
      await service.warnAtRisk(now);
      expect(notifications.sendEmailBatch.mock.calls[0][0].recipients.map((r: { to: string }) => r.to)).toEqual(['bayo@example.com']);
    });

    it('drops a queued warning if the session got paid or cancelled before it went out', async () => {
      service.onModuleInit();
      const check = outbox.registerRelevanceCheck.mock.calls[0][1] as (row: unknown) => Promise<boolean>;
      sessions.isPaidNotReady.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      await expect(check({ payload: { sessionId: new Types.ObjectId().toString() } })).resolves.toBe(false);
      await expect(check({ payload: { sessionId: new Types.ObjectId().toString() } })).resolves.toBe(true);
    });
  });

  describe('auto-cancel at kick-off + 10 min', () => {
    it('cancels only while still not ready, then tells every member (refund line by who paid)', async () => {
      const s = paidSession(11);
      sessions.findPaidNotReady.mockResolvedValue([s]);
      sessionsService.cancelAndRefund.mockResolvedValue({
        session: s,
        refunds: { allInitiated: true, totalPaid: 1, results: [{ userId: ada.toString(), success: true }] },
      });

      await expect(service.autoCancel(now)).resolves.toBe(1);

      expect(sessions.findPaidNotReady).toHaveBeenCalledWith(null, new Date(now.getTime() - AUTO_CANCEL_AFTER_KICKOFF_MS), 50);
      expect(sessionsService.cancelAndRefund).toHaveBeenCalledWith(s._id, SESSION_CANCEL_REASON.NOT_READY, {
        paymentRequired: true,
        paymentStatus: { $ne: 'COMPLETED' },
      });
      const batch = notifications.sendEmailBatch.mock.calls[0][0];
      expect(batch.type).toBe(NOTIFICATION_TYPE.SESSION_AUTO_CANCELLED);
      const line = (to: string) => batch.recipients.find((r: { to: string }) => r.to === to).variables.refundLine;
      expect(line('ada@example.com')).toContain('being refunded');
      expect(line('bayo@example.com')).toContain("nothing to refund");
    });

    it('a session paid at the last second (cancel no longer matches) is left alone and nobody is told', async () => {
      sessions.findPaidNotReady.mockResolvedValue([paidSession(11)]);
      sessionsService.cancelAndRefund.mockResolvedValue(null);
      await expect(service.autoCancel(now)).resolves.toBe(0);
      expect(outbox.enqueueManyReturningKeys).not.toHaveBeenCalled();
    });

    it('one failing session does not stop the others', async () => {
      const [bad, good] = [paidSession(12), paidSession(11)];
      sessions.findPaidNotReady.mockResolvedValue([bad, good]);
      sessionsService.cancelAndRefund
        .mockRejectedValueOnce(new Error('Paystack down'))
        .mockResolvedValueOnce({ session: good, refunds: { allInitiated: true, totalPaid: 0, results: [] } });
      await expect(service.autoCancel(now)).resolves.toBe(1);
    });
  });

  describe('close-out and drafts (one write each)', () => {
    it('closes sessions 30 min past their end and clears pointers to them', async () => {
      const ids = [new Types.ObjectId(), new Types.ObjectId()];
      sessions.findOverdueForCloseOut.mockResolvedValue(ids.map((_id) => ({ _id })));
      sessions.markEndedManyIfOpen.mockResolvedValue(2);

      await expect(service.closeOut(now)).resolves.toBe(2);

      expect(sessions.findOverdueForCloseOut).toHaveBeenCalledWith(new Date(now.getTime() - CLOSE_OUT_AFTER_END_MS), 200);
      expect(sessions.markEndedManyIfOpen).toHaveBeenCalledWith(ids);
      expect(sessionsService.clearCurrentSessionPointers).toHaveBeenCalledWith(ids);
      expect(sessionsService.cancelAndRefund).not.toHaveBeenCalled(); // never cancels, never refunds
    });

    it('cancels drafts older than 24 h that still have no date', async () => {
      const ids = [new Types.ObjectId()];
      sessions.findStaleDrafts.mockResolvedValue(ids.map((_id) => ({ _id })));
      sessions.cancelManyIfOpen.mockResolvedValue(1);

      await expect(service.cancelStaleDrafts(now)).resolves.toBe(1);

      expect(sessions.findStaleDrafts).toHaveBeenCalledWith(new Date(now.getTime() - DRAFT_TTL_MS), 200);
      expect(sessions.cancelManyIfOpen).toHaveBeenCalledWith(ids, SESSION_CANCEL_REASON.NEVER_CONFIGURED, { startTime: null });
      expect(sessionsService.clearCurrentSessionPointers).toHaveBeenCalledWith(ids);
    });
  });

  describe('the tick', () => {
    it('runs every step even if one fails', async () => {
      sessions.findPaidNotReady.mockRejectedValue(new Error('db hiccup'));
      await service.run(now);
      expect(sessions.findOverdueForCloseOut).toHaveBeenCalled();
      expect(sessions.findStaleDrafts).toHaveBeenCalled();
    });

    it('a slow tick never overlaps the next one', async () => {
      let release: () => void = () => undefined;
      sessions.findPaidNotReady.mockReturnValueOnce(new Promise((resolve) => { release = () => resolve([]); }));
      const first = service.tick();
      await service.tick(); // returns straight away: the first is still running
      expect(sessions.findPaidNotReady).toHaveBeenCalledTimes(1);
      release();
      await first;
    });
  });
});
