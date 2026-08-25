import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CustomHttpException } from '@app/common';
import { SessionPayment, PaymentStatus } from '@app/common/schemas/session-payment.schema';
import { Session } from '@app/common/schemas/session.schema';
import { Set } from '@app/common/schemas/sets.schema';

@Injectable()
export class LocationBillingService {
  constructor(
    @InjectModel(SessionPayment.name)
    private readonly sessionPaymentModel: Model<SessionPayment>,

    @InjectModel(Session.name)
    private readonly sessionModel: Model<Session>,

    @InjectModel(Set.name)
    private readonly setModel: Model<Set>,
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
      {
        $group: {
          _id: {
            sessionId: '$sessionId',
            setId: { $ifNull: ['$mySet._id', '$sessionId'] },
          },
          teamName: { $first: { $ifNull: ['$mySet.name', 'Ungrouped'] } },
          sessionStartTime: { $first: '$session.startTime' },
          pricingOption: { $first: '$metadata.pricingOption' },
          paymentAmount: { $first: '$session.paymentAmount' },
          teamPlayersCount: {
            $first: { $size: { $ifNull: ['$mySet.players', []] } },
          },
          // baseAmount (owner's actual take), not the full charged amount —
          // otherwise this drifts from expectedTotal (teamPlayersCount ×
          // session.paymentAmount, the base per-person price) by whatever
          // commission was added on top. $ifNull covers legacy payments
          // created before commission existed (no baseAmount stored).
          totalPaid: { $sum: { $ifNull: ['$baseAmount', '$amount'] } },
          membersPaid: { $sum: 1 },
          latestPaidAt: { $max: '$paidAt' },
          sessionId: { $first: '$sessionId' },
          setId: { $first: { $ifNull: ['$mySet._id', null] } },
        },
      },

      // Calculate expected amount and completeness
      {
        $addFields: {
          expectedTotal: {
            $multiply: ['$teamPlayersCount', '$paymentAmount'],
          },
          paymentStatus: {
            $cond: {
              if: { $eq: ['$teamPlayersCount', '$membersPaid'] },
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
        pricingOption: row.pricingOption ?? null,
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

    // Verify this session belongs to the owner's location
    const payments = await this.sessionPaymentModel
      .find({ sessionId: sessionObjectId })
      .lean()
      .exec();

    const ownerMatch = payments.find(
      (p) => p.ownerId.toString() === ownerIdStr,
    );
    if (payments.length > 0 && !ownerMatch) {
      throw new CustomHttpException('Unauthorized', HttpStatus.FORBIDDEN);
    }

    // Load sets for this session
    const sets = await this.setModel
      .find({ session: sessionObjectId })
      .lean()
      .exec();

    // Build payment lookup keyed by userId
    const paymentByUser = new Map<string, any>();
    for (const p of payments) {
      paymentByUser.set(p.userId.toString(), p);
    }

    const teamSummaries = sets.map((set) => {
      const players: string[] = (set.players as any[]).map((p) =>
        p.toString(),
      );

      const playerDetails = players.map((playerId) => {
        const payment = paymentByUser.get(playerId);
        // baseAmount (owner's take), not the full charged amount — see
        // totalPaid above for why this has to match expectedTotal's basis.
        return {
          userId: playerId,
          status: payment?.status ?? 'NOT_PAID',
          amountPaid:
            payment?.status === PaymentStatus.PAID
              ? (payment.baseAmount ?? payment.amount)
              : 0,
          paidAt: payment?.paidAt ?? null,
        };
      });

      const totalPaid = playerDetails.reduce((sum, p) => sum + p.amountPaid, 0);
      const membersPaid = playerDetails.filter(
        (p) => p.status === PaymentStatus.PAID,
      ).length;
      const expectedTotal = players.length * (session.paymentAmount ?? 0);
      const shortfall = Math.max(0, expectedTotal - totalPaid);

      let status: 'COMPLETE' | 'PARTIAL' | 'UNPAID';
      if (membersPaid === players.length && players.length > 0) {
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

    const grandExpected = teamSummaries.reduce(
      (sum, t) => sum + t.expectedTotal,
      0,
    );
    const grandPaid = teamSummaries.reduce((sum, t) => sum + t.totalPaid, 0);

    return {
      sessionId,
      sessionStartTime: session.startTime,
      sessionStopTime: session.stopTime,
      paymentAmount: session.paymentAmount ?? 0,
      pricingOption: (session as any).metadata?.pricingOption ?? null,
      sessionPaymentStatus: session.paymentStatus,
      grandExpected,
      grandPaid,
      shortfall: Math.max(0, grandExpected - grandPaid),
      allTeamsPaid: teamSummaries.every((t) => t.status === 'COMPLETE'),
      teams: teamSummaries,
    };
  }
}
