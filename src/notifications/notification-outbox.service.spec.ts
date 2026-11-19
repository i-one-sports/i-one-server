import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { OUTBOX_PUSH_RESULT, OUTBOX_STATUS } from '@app/common';
import { NotificationOutboxService } from './notification-outbox.service';

describe('NotificationOutboxService', () => {
  let service: NotificationOutboxService;
  let model: { create: jest.Mock; updateOne: jest.Mock; findOneAndUpdate: jest.Mock; collection: { insertMany: jest.Mock } };
  let redis: { publish: jest.Mock };
  let push: { deliver: jest.Mock };
  let users: { findOne: jest.Mock };

  const userId = new Types.ObjectId();
  const row = (overrides: any = {}) => ({
    _id: new Types.ObjectId(),
    targetUserId: userId,
    type: 'SESSION_REMINDER',
    title: 'Kick-off in 15 min',
    body: 'Get ready',
    payload: { sessionId: 'abc' },
    status: OUTBOX_STATUS.SENDING,
    attempts: 1,
    deliveredVia: [],
    ...overrides,
  });
  const deliver = (r: any) => (service as any).deliverRow(r);
  const lastSet = () => model.updateOne.mock.calls[model.updateOne.mock.calls.length - 1][1].$set;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  beforeEach(() => {
    model = {
      create: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({}),
      findOneAndUpdate: jest.fn(),
      collection: { insertMany: jest.fn() },
    };
    redis = { publish: jest.fn().mockResolvedValue(undefined) };
    push = { deliver: jest.fn() };
    users = { findOne: jest.fn().mockResolvedValue({ _id: userId, fcmToken: 'tok' }) };
    service = new NotificationOutboxService(model as any, redis as any, push as any, users as any);
  });

  describe('enqueue', () => {
    it('inserts a PENDING row and returns true', async () => {
      model.create.mockResolvedValue({});
      await expect(
        service.enqueue({ type: 'X' as any, targetUserId: userId.toString(), title: 't', body: 'b' }, { dedupeKey: 'k1' }),
      ).resolves.toBe(true);
      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({ _id: expect.any(Types.ObjectId), status: OUTBOX_STATUS.PENDING, dedupeKey: 'k1' }),
      );
    });

    it('treats a duplicate dedupeKey as already queued', async () => {
      model.create.mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000 }));
      await expect(
        service.enqueue({ type: 'X' as any, targetUserId: userId.toString(), title: 't', body: 'b' }, { dedupeKey: 'k1' }),
      ).resolves.toBe(false);
    });
  });

  describe('enqueueMany', () => {
    const item = (key: string) => ({
      params: { type: 'X' as any, targetUserId: userId.toString(), title: 't', body: 'b' },
      options: { dedupeKey: key },
    });

    it('writes every row in ONE unordered insert, with timestamps', async () => {
      model.collection.insertMany.mockResolvedValue({ insertedCount: 3 });
      await expect(service.enqueueMany([item('a'), item('b'), item('c')])).resolves.toBe(3);
      expect(model.collection.insertMany).toHaveBeenCalledTimes(1);
      const [docs, opts] = model.collection.insertMany.mock.calls[0];
      expect(opts).toEqual({ ordered: false });
      expect(docs[0]).toMatchObject({ status: OUTBOX_STATUS.PENDING, createdAt: expect.any(Date), _id: expect.any(Types.ObjectId) });
    });

    it('counts only new rows when some were already queued', async () => {
      model.collection.insertMany.mockRejectedValue(
        Object.assign(new Error('E11000'), { writeErrors: [{ code: 11000 }, { code: 11000 }], result: { insertedCount: 1 } }),
      );
      await expect(service.enqueueMany([item('a'), item('b'), item('c')])).resolves.toBe(1);
    });

    it('still throws real errors', async () => {
      model.collection.insertMany.mockRejectedValue(Object.assign(new Error('disk full'), { writeErrors: [{ code: 14 }] }));
      await expect(service.enqueueMany([item('a')])).rejects.toThrow('disk full');
    });

    it('does nothing for an empty list', async () => {
      await expect(service.enqueueMany([])).resolves.toBe(0);
      expect(model.collection.insertMany).not.toHaveBeenCalled();
    });
  });

  describe('delivery outcomes', () => {
    it('pushed: SENT, in_app + push, FCM message id kept', async () => {
      push.deliver.mockResolvedValue({ ok: true, messageId: 'msg-1' });
      await expect(deliver(row())).resolves.toBe('pushed');
      expect(redis.publish).toHaveBeenCalledTimes(1);
      expect(lastSet()).toMatchObject({ status: OUTBOX_STATUS.SENT, pushResult: OUTBOX_PUSH_RESULT.PUSHED, fcmMessageId: 'msg-1' });
      expect(model.updateOne.mock.calls.at(-1)[1].$addToSet).toEqual({ deliveredVia: 'push' });
    });

    it('no device: SENT in-app only, push never attempted', async () => {
      users.findOne.mockResolvedValue({ _id: userId });
      await expect(deliver(row())).resolves.toBe('inAppOnly');
      expect(push.deliver).not.toHaveBeenCalled();
      expect(lastSet()).toMatchObject({ status: OUTBOX_STATUS.SENT, pushResult: OUTBOX_PUSH_RESULT.NO_DEVICE });
    });

    it('invalid token: SENT in-app only', async () => {
      push.deliver.mockResolvedValue({ ok: false, reason: 'INVALID_TOKEN', code: 'messaging/registration-token-not-registered' });
      await expect(deliver(row())).resolves.toBe('inAppOnly');
      expect(lastSet()).toMatchObject({ status: OUTBOX_STATUS.SENT, pushResult: OUTBOX_PUSH_RESULT.INVALID_TOKEN });
    });

    it('push disabled: FAILED (config problem must be visible)', async () => {
      push.deliver.mockResolvedValue({ ok: false, reason: 'PUSH_DISABLED', message: 'not configured' });
      await expect(deliver(row())).resolves.toBe('failed');
      expect(lastSet()).toMatchObject({ status: OUTBOX_STATUS.FAILED, pushResult: OUTBOX_PUSH_RESULT.PUSH_DISABLED });
    });

    it('permanent error: FAILED immediately, error recorded', async () => {
      push.deliver.mockResolvedValue({ ok: false, reason: 'PERMANENT', code: 'messaging/invalid-argument', message: 'bad payload' });
      await expect(deliver(row())).resolves.toBe('failed');
      expect(lastSet()).toMatchObject({
        status: OUTBOX_STATUS.FAILED,
        pushResult: OUTBOX_PUSH_RESULT.PERMANENT,
        lastError: 'messaging/invalid-argument: bad payload',
      });
    });

    it('temporary error: back to PENDING with backoff', async () => {
      push.deliver.mockResolvedValue({ ok: false, reason: 'RETRYABLE', code: 'messaging/unavailable', message: 'try later' });
      const before = Date.now();
      await expect(deliver(row({ attempts: 1 }))).resolves.toBe('retrying');
      const set = lastSet();
      expect(set.status).toBe(OUTBOX_STATUS.PENDING);
      expect(set.nextAttemptAt.getTime() - before).toBeGreaterThanOrEqual(30 * 1000);
      expect(set.lastError).toBe('messaging/unavailable: try later');
    });

    it('temporary error on the 3rd attempt: FAILED', async () => {
      push.deliver.mockResolvedValue({ ok: false, reason: 'RETRYABLE', code: 'messaging/unavailable', message: 'x' });
      await expect(deliver(row({ attempts: 3 }))).resolves.toBe('failed');
      expect(lastSet()).toMatchObject({ status: OUTBOX_STATUS.FAILED, pushResult: OUTBOX_PUSH_RESULT.RETRYABLE });
    });

    it("a retry doesn't repeat the in-app message", async () => {
      push.deliver.mockResolvedValue({ ok: true, messageId: 'm' });
      await deliver(row({ attempts: 2, deliveredVia: ['in_app'] }));
      expect(redis.publish).not.toHaveBeenCalled();
    });

    it('in-app publish failing is retried', async () => {
      redis.publish.mockRejectedValue(new Error('redis down'));
      await expect(deliver(row())).resolves.toBe('retrying');
      expect(push.deliver).not.toHaveBeenCalled();
    });

    it('past deliverBefore: SKIPPED as EXPIRED, nothing sent', async () => {
      await expect(deliver(row({ deliverBefore: new Date(Date.now() - 1000) }))).resolves.toBe('skipped');
      expect(redis.publish).not.toHaveBeenCalled();
      expect(lastSet()).toMatchObject({ status: OUTBOX_STATUS.SKIPPED, pushResult: OUTBOX_PUSH_RESULT.EXPIRED });
    });

    it('no longer relevant: SKIPPED as OBSOLETE, nothing sent', async () => {
      service.registerRelevanceCheck('SESSION_REMINDER', async () => false);
      await expect(deliver(row())).resolves.toBe('skipped');
      expect(redis.publish).not.toHaveBeenCalled();
      expect(lastSet()).toMatchObject({ status: OUTBOX_STATUS.SKIPPED, pushResult: OUTBOX_PUSH_RESULT.OBSOLETE });
    });

    it('keeps SENT rows 30 days and FAILED rows 90 days', async () => {
      push.deliver.mockResolvedValueOnce({ ok: true, messageId: 'm' });
      await deliver(row());
      const sentKeep = lastSet().expireAt.getTime() - Date.now();
      push.deliver.mockResolvedValueOnce({ ok: false, reason: 'PERMANENT', message: 'x' });
      await deliver(row());
      const failedKeep = lastSet().expireAt.getTime() - Date.now();
      expect(Math.round(sentKeep / 86400000)).toBe(30);
      expect(Math.round(failedKeep / 86400000)).toBe(90);
    });
  });

  it('claims due PENDING rows and stale SENDING rows atomically, with a lease', async () => {
    model.findOneAndUpdate.mockReturnValue({ lean: () => Promise.resolve(null) });
    await (service as any).claimNext();
    const [filter, update] = model.findOneAndUpdate.mock.calls[0];
    expect(filter.$or).toEqual([
      { status: OUTBOX_STATUS.PENDING, nextAttemptAt: { $lte: expect.any(Date) } },
      { status: OUTBOX_STATUS.SENDING, lockedUntil: { $lt: expect.any(Date) } },
    ]);
    expect(update.$set.status).toBe(OUTBOX_STATUS.SENDING);
    expect(update.$inc).toEqual({ attempts: 1 });
  });

  describe('parallel dispatch', () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    it('delivers with up to 10 workers at once, and drains the queue', async () => {
      let queue = 25;
      let active = 0;
      let peak = 0;
      jest.spyOn(service as any, 'claimNext').mockImplementation(async () => (queue-- > 0 ? row() : null));
      jest.spyOn(service as any, 'deliverRow').mockImplementation(async () => {
        active++;
        peak = Math.max(peak, active);
        await sleep(5);
        active--;
        return 'pushed';
      });

      await service.dispatchDue();

      expect(peak).toBe(10);
      expect((service as any).deliverRow).toHaveBeenCalledTimes(25);
    });

    it('stops at 200 rows per run, leaving the rest for the next run', async () => {
      jest.spyOn(service as any, 'claimNext').mockImplementation(async () => row());
      jest.spyOn(service as any, 'deliverRow').mockResolvedValue('pushed');

      await service.dispatchDue();

      expect((service as any).claimNext).toHaveBeenCalledTimes(200);
    });

    it('one crashing delivery does not stop the others', async () => {
      let queue = 5;
      jest.spyOn(service as any, 'claimNext').mockImplementation(async () => (queue-- > 0 ? row() : null));
      jest
        .spyOn(service as any, 'deliverRow')
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValue('pushed');

      await service.dispatchDue();

      expect((service as any).deliverRow).toHaveBeenCalledTimes(5);
      expect((service as any).dispatching).toBe(false);
    });

    it('does not start a second run on this server while one is still going', async () => {
      (service as any).dispatching = true;
      const claim = jest.spyOn(service as any, 'claimNext');
      await service.dispatchDue();
      expect(claim).not.toHaveBeenCalled();
    });
  });
});
