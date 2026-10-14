import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { SESSION_PAYMENT_MODE, SESSION_STATUS } from '@app/common';
import { PaymentStatus } from '@app/common/schemas/session-payment.schema';
import { SessionReminderService } from './session-reminder.service';

describe('SessionReminderService', () => {
  const MIN = 60 * 1000;
  const sessionId = new Types.ObjectId();
  const locationId = new Types.ObjectId();
  const ownerId = new Types.ObjectId();
  const [captain, ada, tunde] = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
  // 5:00 PM Lagos = 16:00 UTC
  const startTime = new Date('2026-05-03T16:00:00.000Z');
  const now = startTime.getTime() - 14 * MIN;

  let service: SessionReminderService;
  let enqueued: any[];
  let outbox: { enqueueMany: jest.Mock; findQueuedPayloads: jest.Mock; registerRelevanceCheck: jest.Mock };
  let payments: { getPaymentSummaries: jest.Mock; areAllPaymentsCompleted: jest.Mock };
  let sessionModel: { find: jest.Mock; findById: jest.Mock };
  let locationFind: jest.Mock;
  // Payment rows per session, as getPaymentSummaries returns them.
  const summary = (paidBase: number, statusByUser: Array<[Types.ObjectId, string]> = []) => ({
    paidBase,
    rowCount: statusByUser.length,
    unpaidCount: statusByUser.filter(([, st]) => st !== PaymentStatus.PAID).length,
    statusByUser: new Map(statusByUser.map(([u, st]) => [u.toString(), st])),
  });

  const session = (overrides: any = {}) => ({
    _id: sessionId,
    location: locationId,
    captain,
    members: [captain, ada, tunde],
    maxNumber: 3,
    startTime,
    paymentTarget: 2000000,
    paymentRequired: true,
    paymentMode: SESSION_PAYMENT_MODE.POOL,
    paymentStatus: 'PENDING',
    status: SESSION_STATUS.OPEN,
    ...overrides,
  });
  const to = (userId: Types.ObjectId, role = 'member') =>
    enqueued.find((e) => e.params.targetUserId === userId.toString() && e.params.payload.role === role);

  beforeAll(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));

  beforeEach(() => {
    enqueued = [];
    outbox = {
      enqueueMany: jest.fn(async (items) => {
        enqueued.push(...items);
        return items.length;
      }),
      findQueuedPayloads: jest.fn().mockResolvedValue([]),
      registerRelevanceCheck: jest.fn(),
    };
    payments = {
      getPaymentSummaries: jest.fn().mockResolvedValue(new Map()),
      areAllPaymentsCompleted: jest.fn().mockResolvedValue(true),
    };
    sessionModel = { find: jest.fn(), findById: jest.fn() };
    locationFind = jest.fn(() => ({
      lean: () => Promise.resolve([{ _id: locationId, name: 'Lekki Pitch', owner: ownerId }]),
    }));
    service = new SessionReminderService(
      { findRaw: () => sessionModel } as any,
      { findRaw: () => ({ find: locationFind }) } as any,
      payments as any,
      outbox as any,
    );
  });

  it('fully paid: every member gets "get ready", nobody else is told', async () => {
    await service.remind(session({ paymentStatus: 'COMPLETED' }), 15, now);

    expect(enqueued).toHaveLength(3);
    expect(to(ada).params).toMatchObject({
      type: 'SESSION_REMINDER',
      title: 'Kick-off in 14 min',
      body: 'Your game at Lekki Pitch starts at 5:00 PM — get ready!',
    });
    expect(to(captain, 'captain')).toBeUndefined();
    expect(enqueued.find((e) => e.params.targetUserId === ownerId.toString())).toBeUndefined();
  });

  it('unpaid pool: members asked to pay, captain told to act, owner warned', async () => {
    payments.getPaymentSummaries.mockResolvedValue(new Map([[sessionId.toString(), summary(1200000)]]));

    await service.remind(session(), 5, startTime.getTime() - 4 * MIN);

    expect(to(tunde).params.body).toBe(
      "₦8,000 still needed for your 5:00 PM game at Lekki Pitch. Pay now or it can't start.",
    );
    expect(to(captain).params.title).toBe('Payment needed — kick-off in 4 min'); // captain is a player too
    expect(to(captain, 'captain').params.body).toBe(
      '₦8,000 still needed for your game at Lekki Pitch (starts in 4 min). Collect payment, reschedule or cancel.',
    );
    expect(to(ownerId, 'owner').params.body).toBe(
      "The 5:00 PM session starts in 4 min and isn't fully paid (₦8,000 still needed).",
    );
  });

  it('unpaid per-person: payers wait, non-payers are asked to pay', async () => {
    payments.getPaymentSummaries.mockResolvedValue(
      new Map([
        [
          sessionId.toString(),
          summary(300000, [
            [captain, PaymentStatus.PAID],
            [ada, PaymentStatus.PAID],
            [tunde, PaymentStatus.PENDING],
          ]),
        ],
      ]),
    );

    await service.remind(session({ paymentMode: SESSION_PAYMENT_MODE.PER_PERSON }), 15, now);

    expect(to(ada).params.body).toBe("You're paid — waiting on 1 player before kick-off at 5:00 PM.");
    expect(to(tunde).params.body).toBe("You haven't paid for your 5:00 PM game at Lekki Pitch. Pay now or it can't start.");
    expect(to(captain, 'captain').params.body).toContain("1 player hasn't paid");
  });

  it("not full yet: asks for players, not money (payment hasn't opened)", async () => {
    await service.remind(session({ paymentStatus: 'NOT_INITIATED', maxNumber: 10 }), 15, now);

    expect(to(ada).params.body).toBe(
      'Your 5:00 PM game at Lekki Pitch still needs 7 more players before payment opens. Invite friends to join.',
    );
    expect(to(captain, 'captain').params.body).toContain('Invite players, reschedule or cancel');
    expect(payments.getPaymentSummaries).toHaveBeenCalledWith([]); // no payment rows needed
  });

  it('free sessions count as paid', async () => {
    await service.remind(session({ paymentRequired: false }), 15, now);
    expect(to(ada).params.body).toContain('get ready');
  });

  it('dedupe key pins session, reminder, start time, user and role; expires at kick-off', async () => {
    await service.remind(session({ paymentStatus: 'COMPLETED' }), 15, now);
    expect(to(ada).options).toEqual({
      dedupeKey: `reminder:${sessionId}:15:2026-05-03T16:00:00.000Z:${ada}:member`,
      deliverBefore: startTime,
    });
  });

  it('a rescheduled session gets new keys, so its reminders fire again', async () => {
    await service.remind(session(), 15, now);
    const moved = new Date(startTime.getTime() + 60 * MIN);
    await service.remind(session({ startTime: moved }), 15, moved.getTime() - 14 * MIN);
    const keys = enqueued.filter((e) => e.params.targetUserId === ada.toString()).map((e) => e.options.dedupeKey);
    expect(new Set(keys).size).toBe(2);
  });

  describe('the minute job', () => {
    const t = Date.now();
    const upcoming = (minutes: number, overrides: any = {}) =>
      session({ _id: new Types.ObjectId(), startTime: new Date(t + minutes * MIN), ...overrides });

    it('picks 15 vs 5 by time left and only looks at active upcoming sessions', async () => {
      const in12 = upcoming(12);
      const in3 = upcoming(3);
      sessionModel.find.mockReturnValue({ lean: () => Promise.resolve([in12, in3]) });
      const remindMany = jest.spyOn(service, 'remindMany').mockResolvedValue(1);

      await service.sendStartReminders();

      const [filter] = sessionModel.find.mock.calls[0];
      expect(filter.status).toEqual({ $nin: [SESSION_STATUS.CANCELLED, SESSION_STATUS.REFUNDED, SESSION_STATUS.COMPLETED] });
      expect(filter.startTime.$lte.getTime() - filter.startTime.$gt.getTime()).toBe(15 * MIN);
      expect(remindMany).toHaveBeenCalledWith(
        [
          { session: in12, kind: 15 },
          { session: in3, kind: 5 },
        ],
        expect.any(Number),
      );
    });

    it('uses a fixed number of queries however many sessions are due (no N+1)', async () => {
      const many = Array.from({ length: 40 }, (_, i) =>
        upcoming(6 + (i % 9), { location: new Types.ObjectId(), paymentStatus: i % 2 ? 'COMPLETED' : 'PENDING' }),
      );
      sessionModel.find.mockReturnValue({ lean: () => Promise.resolve(many) });

      await service.sendStartReminders();

      expect(sessionModel.find).toHaveBeenCalledTimes(1); // sessions
      expect(outbox.findQueuedPayloads).toHaveBeenCalledTimes(1); // already queued?
      expect(locationFind).toHaveBeenCalledTimes(1); // all pitches, one $in
      expect(payments.getPaymentSummaries).toHaveBeenCalledTimes(1); // all payments, one query
      expect(outbox.enqueueMany).toHaveBeenCalledTimes(1); // all reminders, one insert
      expect(payments.areAllPaymentsCompleted).not.toHaveBeenCalled();
    });

    it('skips sessions whose reminders are already queued (repeat ticks are cheap)', async () => {
      const s1 = upcoming(12);
      const s2 = upcoming(10);
      sessionModel.find.mockReturnValue({ lean: () => Promise.resolve([s1, s2]) });
      outbox.findQueuedPayloads.mockResolvedValue([
        { sessionId: s1._id.toString(), minutesBefore: 15, startTime: s1.startTime.toISOString() },
        { sessionId: s2._id.toString(), minutesBefore: 15, startTime: s2.startTime.toISOString() },
      ]);

      await service.sendStartReminders();

      expect(locationFind).not.toHaveBeenCalled();
      expect(payments.getPaymentSummaries).not.toHaveBeenCalled();
      expect(outbox.enqueueMany).not.toHaveBeenCalled();
    });

    it('still sends the 5-min reminder after the 15-min one was queued', async () => {
      const s1 = upcoming(4);
      sessionModel.find.mockReturnValue({ lean: () => Promise.resolve([s1]) });
      outbox.findQueuedPayloads.mockResolvedValue([
        { sessionId: s1._id.toString(), minutesBefore: 15, startTime: s1.startTime.toISOString() },
      ]);

      await service.sendStartReminders();

      expect(outbox.enqueueMany).toHaveBeenCalledTimes(1);
      expect(enqueued.every((e) => e.params.payload.minutesBefore === 5)).toBe(true);
    });
  });

  describe('relevance check before delivery', () => {
    const check = (payload: any, current: any) => {
      sessionModel.findById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(current) }) });
      return (service as any).isStillRelevant({ payload });
    };
    const payload = { sessionId: sessionId.toString(), startTime: startTime.toISOString(), fullyPaid: true };

    it('still relevant when nothing changed', async () => {
      await expect(check(payload, session())).resolves.toBe(true);
    });

    it('drops reminders for cancelled sessions', async () => {
      await expect(check(payload, session({ status: SESSION_STATUS.CANCELLED }))).resolves.toBe(false);
    });

    it('drops reminders for sessions that moved', async () => {
      await expect(check(payload, session({ startTime: new Date(startTime.getTime() + MIN) }))).resolves.toBe(false);
    });

    it('drops a "please pay" reminder once the session is fully paid', async () => {
      payments.areAllPaymentsCompleted.mockResolvedValue(true);
      await expect(check({ ...payload, fullyPaid: false }, session())).resolves.toBe(false);
    });
  });
});
