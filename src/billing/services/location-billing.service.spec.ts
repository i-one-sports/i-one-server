import { Types } from 'mongoose';
import { SESSION_PAYMENT_MODE } from '@app/common';
import { PaymentStatus } from '@app/common/schemas/session-payment.schema';
import { LocationBillingService } from './location-billing.service';

describe('LocationBillingService.getSessionTeamPaymentStatus', () => {
  const sessionId = new Types.ObjectId();
  const locationId = new Types.ObjectId();
  const ownerId = new Types.ObjectId();
  const [p1, p2, p3, p4, leaver] = Array.from({ length: 5 }, () => new Types.ObjectId());

  const exec = (value: any) => {
    const q: any = { lean: () => q, select: () => q, exec: () => Promise.resolve(value) };
    return q;
  };

  let models: Record<string, { findById?: jest.Mock; find?: jest.Mock }>;
  let service: LocationBillingService;

  const setup = (session: any, payments: any[], owner = ownerId) => {
    models = {
      sessionPayment: { find: jest.fn().mockReturnValue(exec(payments)) },
      session: { findById: jest.fn().mockReturnValue(exec(session)) },
      set: {
        find: jest.fn().mockReturnValue(
          exec([
            { _id: new Types.ObjectId(), name: 'Team A', players: [p1, p2] },
            { _id: new Types.ObjectId(), name: 'Team B', players: [p3, p4] },
          ]),
        ),
      },
      location: { findById: jest.fn().mockReturnValue(exec({ owner, pricingOption: 'hourly' })) },
    };
    service = new LocationBillingService(
      models.sessionPayment as any,
      models.session as any,
      models.set as any,
      models.location as any,
    );
  };

  const paid = (userId: Types.ObjectId, base: number) => ({
    userId,
    ownerId,
    status: PaymentStatus.PAID,
    amount: base,
    baseAmount: base,
    paidAt: new Date(),
  });

  it('reports a POOL session against the pot total, summing every contribution', async () => {
    setup(
      {
        _id: sessionId,
        location: locationId,
        paymentMode: SESSION_PAYMENT_MODE.POOL,
        paymentTarget: 2000000,
        paymentAmount: 0,
        paymentStatus: 'PENDING',
      },
      [
        paid(p1, 1000000),
        paid(p1, 200000), // top-up by the same player
        { ...paid(p2, 300000), status: PaymentStatus.EXPIRED }, // abandoned checkout
        paid(leaver, 300000), // no longer in a team, still counts
      ],
    );

    const result = await service.getSessionTeamPaymentStatus(sessionId.toString(), ownerId.toString());

    expect(result).toMatchObject({
      paymentMode: SESSION_PAYMENT_MODE.POOL,
      paymentTarget: 2000000,
      grandExpected: 2000000,
      grandPaid: 1500000,
      shortfall: 500000,
      allTeamsPaid: false,
    });
    const teamA = result.teams.find((t) => t.teamName === 'Team A');
    expect(teamA).toMatchObject({ expectedTotal: null, shortfall: null, totalPaid: 1200000, status: 'PARTIAL' });
    expect(teamA.playerDetails).toEqual([
      expect.objectContaining({ userId: p1.toString(), status: PaymentStatus.PAID, amountPaid: 1200000 }),
      expect.objectContaining({ userId: p2.toString(), status: PaymentStatus.EXPIRED, amountPaid: 0 }),
    ]);
    expect(result.teams.find((t) => t.teamName === 'Team B')).toMatchObject({ totalPaid: 0, status: 'UNPAID' });
  });

  it('marks every team complete once the pot is full, even if one player paid it all', async () => {
    setup(
      {
        _id: sessionId,
        location: locationId,
        paymentMode: SESSION_PAYMENT_MODE.POOL,
        paymentTarget: 2000000,
        paymentStatus: 'COMPLETED',
      },
      [paid(p1, 2000000)],
    );

    const result = await service.getSessionTeamPaymentStatus(sessionId.toString(), ownerId.toString());

    expect(result).toMatchObject({ grandExpected: 2000000, grandPaid: 2000000, shortfall: 0, allTeamsPaid: true });
    expect(result.teams.map((t) => t.status)).toEqual(['COMPLETE', 'COMPLETE']);
  });

  it('keeps per-player expectations for PER_PERSON sessions', async () => {
    setup(
      { _id: sessionId, location: locationId, paymentAmount: 150000, paymentStatus: 'PENDING' }, // no paymentMode = legacy
      [paid(p1, 150000), paid(p2, 150000), paid(p3, 150000)],
    );

    const result = await service.getSessionTeamPaymentStatus(sessionId.toString(), ownerId.toString());

    expect(result).toMatchObject({
      paymentMode: SESSION_PAYMENT_MODE.PER_PERSON,
      paymentTarget: null,
      grandExpected: 600000,
      grandPaid: 450000,
      shortfall: 150000,
    });
    expect(result.teams.map((t) => [t.status, t.expectedTotal])).toEqual([
      ['COMPLETE', 300000],
      ['PARTIAL', 300000],
    ]);
  });

  it("refuses another owner's session even before anyone has paid", async () => {
    setup(
      { _id: sessionId, location: locationId, paymentMode: SESSION_PAYMENT_MODE.POOL, paymentTarget: 2000000 },
      [],
      new Types.ObjectId(), // location belongs to someone else
    );

    await expect(
      service.getSessionTeamPaymentStatus(sessionId.toString(), ownerId.toString()),
    ).rejects.toMatchObject({ status: 403 });
  });
});
