import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CustomHttpException, SESSION_PAYMENT_MODE } from '@app/common';
import { SessionPayment, PaymentStatus } from '@app/common/schemas/session-payment.schema';
import { Session } from '@app/common/schemas/session.schema';
import { Set } from '@app/common/schemas/sets.schema';
import { Location } from '@app/common/schemas/location.schema';

@Injectable()
export class LocationBillingService {
  constructor(
    @InjectModel(SessionPayment.name)
    private readonly sessionPaymentModel: Model<SessionPayment>,

    @InjectModel(Session.name)
    private readonly sessionModel: Model<Session>,

    @InjectModel(Set.name)
    private readonly setModel: Model<Set>,

    @InjectModel(Location.name)
    private readonly locationModel: Model<Location>,
  ) {}

  /**
   * Paginated transaction history for a location owner, grouped by calendar date.
   * Each entry represents one team (Set) within one session.
   */
  async getOwnerTransactionHistory(
    ownerId: string,
    locationId: string,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;
    const ownerObjectId = new Types.ObjectId(ownerId);
    const locationObjectId = new Types.ObjectId(locationId);

    // pricingOption is constant for every row here (all scoped to this one
    // location), so fetch it once instead of joining it per-row.
    const location = await this.locationModel
      .findById(locationObjectId)
      .select('pricingOption')
      .lean()
      .exec();

    const pipeline: any[] = [
      // Only paid records for this owner's location
      {
        $match: {
          ownerId: ownerObjectId,
          locationId: locationObjectId,
          status: PaymentStatus.PAID,
        },
      },

      // Join session details (startTime, paymentAmount, pricingOption)
      {
        $lookup: {
          from: 'sessions',
          localField: 'sessionId',
          foreignField: '_id',
          as: 'session',
        },
      },
      { $unwind: { path: '$session', preserveNullAndEmptyArrays: true } },

      // POOL sessions owe one total as a whole session, not a price per
      // player per team — they're reported as a single session-level row.
      {
        $addFields: {
          isPool: { $eq: ['$session.paymentMode', SESSION_PAYMENT_MODE.POOL] },
        },
      },

      // Join all Sets for the session
      {
        $lookup: {
          from: 'sets',
          localField: 'sessionId',
          foreignField: 'session',
          as: 'allSets',
        },
      },

      // Find which set this user belongs to (match userId inside set.players)
      {
        $addFields: {
          mySet: {
            $first: {
              $filter: {
                input: '$allSets',
                as: 'set',
                cond: {
                  $in: [
                    '$userId',
                    { $ifNull: ['$$set.players', []] },
                  ],
                },
              },
            },
          },
        },
      },

      // Group by session + set to produce one row per team per session
      // (one row per session for POOL)
      {
        $group: {
          _id: {
            sessionId: '$sessionId',
            setId: {
              $cond: ['$isPool', 'POOL', { $ifNull: ['$mySet._id', '$sessionId'] }],
            },
          },
          isPool: { $first: '$isPool' },
          teamName: {
            $first: {
              $cond: ['$isPool', 'Whole session', { $ifNull: ['$mySet.name', 'Ungrouped'] }],
            },
          },
          sessionStartTime: { $first: '$session.startTime' },
          paymentAmount: { $first: '$session.paymentAmount' },
          paymentTarget: { $first: '$session.paymentTarget' },
          teamPlayersCount: {
            $first: {
              $size: {
                $cond: [
                  '$isPool',
                  { $ifNull: ['$session.members', []] },
                  { $ifNull: ['$mySet.players', []] },
                ],
              },
            },
          },
          // baseAmount (owner's actual take), not the full charged amount —
          // otherwise this drifts from expectedTotal (teamPlayersCount ×
          // session.paymentAmount, the base per-person price) by whatever
          // commission was added on top. $ifNull covers legacy payments
          // created before commission existed (no baseAmount stored).
          totalPaid: { $sum: { $ifNull: ['$baseAmount', '$amount'] } },
          // Distinct payers — a POOL player can have several contributions.
          payers: { $addToSet: '$userId' },
          latestPaidAt: { $max: '$paidAt' },
          sessionId: { $first: '$sessionId' },
          setId: {
            $first: { $cond: ['$isPool', null, { $ifNull: ['$mySet._id', null] }] },
          },
        },
      },
      { $addFields: { membersPaid: { $size: '$payers' } } },

      // Calculate expected amount and completeness
      {
        $addFields: {
          expectedTotal: {
            $cond: [
              '$isPool',
              { $ifNull: ['$paymentTarget', 0] },
              { $multiply: ['$teamPlayersCount', '$paymentAmount'] },
            ],
          },
          paymentStatus: {
            $cond: {
              if: {
                $cond: [
                  '$isPool',
                  { $gte: ['$totalPaid', { $ifNull: ['$paymentTarget', 0] }] },
                  { $eq: ['$teamPlayersCount', '$membersPaid'] },
                ],
              },
              then: 'COMPLETE',
              else: {
                $cond: {
                  if: { $gt: ['$membersPaid', 0] },
                  then: 'PARTIAL',
                  else: 'UNPAID',
                },
              },
            },
          },
        },
      },

      { $sort: { latestPaidAt: -1 } },
    ];

    // Count total before pagination
    const countPipeline = [...pipeline, { $count: 'total' }];
    const [countResult] = await this.sessionPaymentModel.aggregate(countPipeline);
    const total = countResult?.total ?? 0;

    // Apply pagination
    pipeline.push({ $skip: skip }, { $limit: limit });

    const rows: any[] = await this.sessionPaymentModel.aggregate(pipeline);

    // Group rows by calendar date (based on latestPaidAt)
    const byDate = new Map<string, any[]>();
    for (const row of rows) {
      const d = row.latestPaidAt ? new Date(row.latestPaidAt) : new Date();
      const dateKey = d.toISOString().slice(0, 10);
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey).push({
        teamName: row.teamName,
        sessionId: row.sessionId,
        setId: row.setId,
        sessionStartTime: row.sessionStartTime,
        pricingOption: location?.pricingOption ?? null,
        paymentMode: row.isPool ? SESSION_PAYMENT_MODE.POOL : SESSION_PAYMENT_MODE.PER_PERSON,
        paymentAmount: row.paymentAmount ?? 0,
        teamSize: row.teamPlayersCount,
        membersPaid: row.membersPaid,
        totalPaid: row.totalPaid,
        expectedTotal: row.expectedTotal ?? 0,
        paymentStatus: row.paymentStatus,
        paidAt: row.latestPaidAt,
      });
    }

    const data = Array.from(byDate.entries()).map(([date, entries]) => ({
      date,
      entries,
    }));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Per-session team payment validator: shows each team (Set),
   * which of their players paid, what was expected vs collected, and shortfall.
   */
  async getSessionTeamPaymentStatus(sessionId: string, ownerId: string) {
    const sessionObjectId = new Types.ObjectId(sessionId);
    // req.user._id from the JWT strategy is a Mongoose ObjectId, not a string,
    // despite the ownerId: string param type — normalize before comparing.
    const ownerIdStr = ownerId.toString();

    const session = await this.sessionModel
      .findById(sessionObjectId)
      .lean()
      .exec();

    if (!session) {
      throw new CustomHttpException('Session not found', HttpStatus.NOT_FOUND);
    }

    const location = await this.locationModel
      .findById(session.location)
      .select('pricingOption owner')
      .lean()
      .exec();

    // Verify this session belongs to the owner's location — checked against
    // the location itself, so it also holds before anyone has paid.
    if (location?.owner?.toString() !== ownerIdStr) {
      throw new CustomHttpException('Unauthorized', HttpStatus.FORBIDDEN);
    }

    const payments = await this.sessionPaymentModel
      .find({ sessionId: sessionObjectId })
      .lean()
      .exec();

    const isPool = session.paymentMode === SESSION_PAYMENT_MODE.POOL;

    // Load sets for this session
    const sets = await this.setModel
      .find({ session: sessionObjectId })
      .lean()
      .exec();

    // Per-player totals. PER_PERSON has one row per player; POOL can have
    // several (top-ups, expired checkouts), so sum the PAID ones and report
    // PAID if any contribution landed.
    const paymentByUser = new Map<string, { status: string; amountPaid: number; paidAt: Date | null }>();
    for (const p of payments) {
      const key = p.userId.toString();
      const entry = paymentByUser.get(key) ?? { status: p.status, amountPaid: 0, paidAt: null };
      if (p.status === PaymentStatus.PAID) {
        // baseAmount (owner's take), not the full charged amount — so it
        // matches the expected totals, which are also base prices.
        entry.status = PaymentStatus.PAID;
        entry.amountPaid += p.baseAmount ?? p.amount;
        if (!entry.paidAt || (p.paidAt && p.paidAt > entry.paidAt)) entry.paidAt = p.paidAt;
      } else if (entry.status !== PaymentStatus.PAID) {
        entry.status = p.status;
      }
      paymentByUser.set(key, entry);
    }

    // POOL totals come from every PAID contribution on the session —
    // including players no longer in a team (e.g. left after the pot was
    // full, which isn't refunded) — not just the players listed in sets.
    const poolPaid = isPool
      ? Array.from(paymentByUser.values()).reduce((sum, p) => sum + p.amountPaid, 0)
      : 0;
    const poolTarget = session.paymentTarget ?? 0;
    const poolFunded =
      isPool && (session.paymentStatus === 'COMPLETED' || (poolTarget > 0 && poolPaid >= poolTarget));

    const teamSummaries = sets.map((set) => {
      const players: string[] = (set.players as any[]).map((p) =>
        p.toString(),
      );

      const playerDetails = players.map((playerId) => {
        const payment = paymentByUser.get(playerId);
        return {
          userId: playerId,
          status: payment?.status ?? 'NOT_PAID',
          amountPaid: payment?.amountPaid ?? 0,
          paidAt: payment?.paidAt ?? null,
        };
      });

      const totalPaid = playerDetails.reduce((sum, p) => sum + p.amountPaid, 0);
      const membersPaid = playerDetails.filter(
        (p) => p.status === PaymentStatus.PAID,
      ).length;
      // POOL: the total is owed by the whole session, so a team has no
      // expected amount of its own — see grandExpected below.
      const expectedTotal = isPool ? null : players.length * (session.paymentAmount ?? 0);
      const shortfall = isPool ? null : Math.max(0, expectedTotal - totalPaid);

      let status: 'COMPLETE' | 'PARTIAL' | 'UNPAID';
      if (isPool ? poolFunded : membersPaid === players.length && players.length > 0) {
        status = 'COMPLETE';
      } else if (membersPaid > 0) {
        status = 'PARTIAL';
      } else {
        status = 'UNPAID';
      }

      return {
        setId: (set as any)._id,
        teamName: set.name,
        totalPlayers: players.length,
        playersPaid: membersPaid,
        playersUnpaid: players.length - membersPaid,
        expectedTotal,
        totalPaid,
        shortfall,
        status,
        playerDetails,
      };
    });

    const grandExpected = isPool
      ? poolTarget
      : teamSummaries.reduce((sum, t) => sum + t.expectedTotal, 0);
    const grandPaid = isPool
      ? poolPaid
      : teamSummaries.reduce((sum, t) => sum + t.totalPaid, 0);

    return {
      sessionId,
      sessionStartTime: session.startTime,
      sessionStopTime: session.stopTime,
      paymentAmount: session.paymentAmount ?? 0,
      paymentMode: isPool ? SESSION_PAYMENT_MODE.POOL : SESSION_PAYMENT_MODE.PER_PERSON,
      paymentTarget: isPool ? poolTarget : null,
      pricingOption: location?.pricingOption ?? null,
      sessionPaymentStatus: session.paymentStatus,
      grandExpected,
      grandPaid,
      shortfall: Math.max(0, grandExpected - grandPaid),
      allTeamsPaid: isPool ? poolFunded : teamSummaries.every((t) => t.status === 'COMPLETE'),
      teams: teamSummaries,
    };
  }
}
