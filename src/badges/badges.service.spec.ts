import { Types } from 'mongoose';
import { BADGE } from '@app/common';
import { BadgesService } from './badges.service';

describe('BadgesService', () => {
  const user = new Types.ObjectId();
  const s = Array.from({ length: 9 }, () => new Types.ObjectId()); // s[0] newest

  let badgeRepository: { has: jest.Mock; create: jest.Mock };
  let rowsRead: number;
  let statRepository: { historyNewestFirst: jest.Mock; blankPlayersInSession: jest.Mock };
  let outbox: { enqueue: jest.Mock };
  let service: BadgesService;

  // Rows newest first, served through a cursor that counts how many were read.
  const history = (rows: Array<[Types.ObjectId, number, number]>) => {
    rowsRead = 0;
    const docs = rows.map(([session, goals, assists]) => ({ session, goals, assists }));
    const cursor = {
      close: jest.fn().mockResolvedValue(undefined),
      async *[Symbol.asyncIterator]() {
        for (const d of docs) {
          rowsRead++;
          yield d;
        }
      },
    };
    statRepository.historyNewestFirst.mockReturnValue(cursor);
  };
  const blank = (session: Types.ObjectId, games = 2) => Array.from({ length: games }, () => [session, 0, 0] as [Types.ObjectId, number, number]);

  beforeEach(() => {
    badgeRepository = { has: jest.fn().mockResolvedValue(false), create: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }) };
    statRepository = { historyNewestFirst: jest.fn(), blankPlayersInSession: jest.fn() };
    outbox = { enqueue: jest.fn().mockResolvedValue(true) };
    service = new BadgesService(badgeRepository as any, statRepository as any, outbox as any);
  });

  it('unlocks after 7 whole sessions with no goal or assist, and notifies once', async () => {
    history([...s.slice(0, 7).flatMap((x) => blank(x)), [s[7], 1, 0]]);

    await expect(service.checkDrought(user)).resolves.toBe(true);

    expect(badgeRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ user, badge: BADGE.LICENCE_TO_MISS, sessions: s.slice(0, 7) }),
    );
    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'BADGE_UNLOCKED',
        targetUserId: user.toString(),
        payload: expect.objectContaining({ badgeId: expect.any(String), badge: BADGE.LICENCE_TO_MISS }),
      }),
      { dedupeKey: `badge:LICENCE_TO_MISS:${user}` },
    );
  });

  it('6 blank sessions is not enough', async () => {
    history([...s.slice(0, 6).flatMap((x) => blank(x)), [s[6], 0, 1]]);
    await expect(service.checkDrought(user)).resolves.toBe(false);
    expect(badgeRepository.create).not.toHaveBeenCalled();
  });

  it('a goal earlier in the 7th session breaks it (sessions must be blank all the way)', async () => {
    history([...s.slice(0, 6).flatMap((x) => blank(x)), [s[6], 0, 0], [s[6], 1, 0]]);
    await expect(service.checkDrought(user)).resolves.toBe(false);
  });

  it('stops reading at the first goal or assist', async () => {
    history([[s[0], 0, 0], [s[0], 0, 1], ...s.slice(1).flatMap((x) => blank(x))]);
    await service.checkDrought(user);
    expect(rowsRead).toBe(2);
  });

  it('stops reading once an 8th session proves the 7th was blank', async () => {
    history([...s.slice(0, 9).flatMap((x) => blank(x))]);
    await expect(service.checkDrought(user)).resolves.toBe(true);
    expect(rowsRead).toBe(15); // 7 sessions × 2 games + the first row of the 8th
  });

  it('once ever: skips players who already have it without reading history', async () => {
    badgeRepository.has.mockResolvedValue(true);
    await expect(service.checkDrought(user)).resolves.toBe(false);
    expect(statRepository.historyNewestFirst).not.toHaveBeenCalled();
  });

  it('a racing second unlock is a no-op and sends nothing', async () => {
    history(s.slice(0, 7).flatMap((x) => blank(x)));
    badgeRepository.create.mockRejectedValue({ code: 11000 });
    await expect(service.checkDrought(user)).resolves.toBe(false);
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('only checks players who had no goal or assist in the session', async () => {
    const blankPlayer = new Types.ObjectId();
    statRepository.blankPlayersInSession.mockResolvedValue([blankPlayer]);
    const spy = jest.spyOn(service, 'checkDrought').mockResolvedValue(false);

    await service.checkSession(s[0]);

    expect(statRepository.blankPlayersInSession).toHaveBeenCalledWith(s[0]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(blankPlayer);
  });
});
