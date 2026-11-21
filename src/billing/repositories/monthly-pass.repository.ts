import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, UpdateQuery } from 'mongoose';
import { AbstractRepository, MonthlyPass, MONTHLY_PASS_STATUS, PUBLIC_USER_FIELDS } from '@app/common';

export type MonthlyPassRow = MonthlyPass & { _id: Types.ObjectId };

const REFUND_STATUSES = [
  MONTHLY_PASS_STATUS.REFUND_PENDING,
  MONTHLY_PASS_STATUS.REFUND_FAILED,
  MONTHLY_PASS_STATUS.REFUNDED,
];
// Real passes, not rows recording an extra charge.
const NOT_EXTRA_CHARGE = { duplicateOf: { $exists: false } };

@Injectable()
export class MonthlyPassRepository extends AbstractRepository<MonthlyPass> {
  protected readonly logger = new Logger(MonthlyPassRepository.name);

  constructor(@InjectModel(MonthlyPass.name) model: Model<MonthlyPass>) {
    super(model);
  }

  // The row a Paystack reference belongs to: the row whose current reference
  // it is, else the pass that used it on an earlier checkout page.
  async findByReference(reference: string): Promise<MonthlyPassRow | null> {
    const exact = await this.model.findOne({ paymentReference: reference }).lean<MonthlyPassRow>();
    if (exact) return exact;
    return this.model.findOne({ previousReferences: reference, ...NOT_EXTRA_CHARGE }).lean<MonthlyPassRow>();
  }

  async findOpenCheckout(userId: Types.ObjectId, locationId: Types.ObjectId): Promise<MonthlyPassRow | null> {
    return this.model.findOne({ userId, locationId, status: MONTHLY_PASS_STATUS.PENDING }).lean<MonthlyPassRow>();
  }

  // When the player's last paid pass at this pitch ends (null if none).
  async latestEndsAt(userId: Types.ObjectId, locationId: Types.ObjectId): Promise<Date | null> {
    const latest = await this.model
      .findOne({ userId, locationId, status: MONTHLY_PASS_STATUS.ACTIVE, ...NOT_EXTRA_CHARGE })
      .sort({ endsAt: -1 })
      .select('endsAt')
      .lean<{ endsAt?: Date }>();
    return latest?.endsAt ?? null;
  }

  // A paid pass covering `at` (startsAt ≤ at < endsAt).
  async findCovering(userId: Types.ObjectId, locationId: Types.ObjectId, at: Date): Promise<MonthlyPassRow | null> {
    return this.model
      .findOne({ userId, locationId, status: MONTHLY_PASS_STATUS.ACTIVE, startsAt: { $lte: at }, endsAt: { $gt: at }, ...NOT_EXTRA_CHARGE })
      .lean<MonthlyPassRow>();
  }

  // Moves a row on only if it is still in `from` — so two callers (webhook,
  // checkout, expiry job) can never both act on the same row.
  async transition(id: Types.ObjectId, from: MONTHLY_PASS_STATUS, update: UpdateQuery<MonthlyPass>): Promise<MonthlyPassRow | null> {
    return this.model.findOneAndUpdate({ _id: id, status: from }, update, { new: true }).lean<MonthlyPassRow>();
  }

  async findRefundByPaidReference(reference: string): Promise<MonthlyPassRow | null> {
    return this.model.findOne({ paidReference: reference, status: { $in: REFUND_STATUSES } }).lean<MonthlyPassRow>();
  }

  async findLapsedCheckouts(now: Date): Promise<MonthlyPassRow[]> {
    return this.model.find({ status: MONTHLY_PASS_STATUS.PENDING, expiresAt: { $lt: now } }).lean<MonthlyPassRow[]>();
  }

  async findForUser(userId: Types.ObjectId): Promise<MonthlyPassRow[]> {
    return this.model
      .find({ userId, status: { $ne: MONTHLY_PASS_STATUS.CANCELLED }, ...NOT_EXTRA_CHARGE })
      .populate('locationId', 'name address pitchPhoto')
      .sort({ endsAt: -1, createdAt: -1 })
      .lean<MonthlyPassRow[]>();
  }

  // Paid passes at a pitch that haven't ended (current and queued).
  async findUnexpiredAtPitch(locationId: Types.ObjectId, now: Date, userId?: Types.ObjectId): Promise<MonthlyPassRow[]> {
    return this.model
      .find({ locationId, ...(userId && { userId }), status: MONTHLY_PASS_STATUS.ACTIVE, endsAt: { $gt: now }, ...NOT_EXTRA_CHARGE })
      .populate(userId ? [] : [{ path: 'userId', select: PUBLIC_USER_FIELDS }])
      .sort({ startsAt: 1 })
      .lean<MonthlyPassRow[]>();
  }

  // Passes still running at a pitch (paid and not ended), plus open
  // checkouts that could still become passes.
  async liveAtPitch(locationId: Types.ObjectId, now: Date): Promise<{ activeCount: number; pendingCount: number; lastEndsAt: Date | null }> {
    const [active, pendingCount] = await Promise.all([
      this.model.aggregate<{ count: number; lastEndsAt: Date }>([
        { $match: { locationId, status: MONTHLY_PASS_STATUS.ACTIVE, endsAt: { $gt: now }, ...NOT_EXTRA_CHARGE } },
        { $group: { _id: null, count: { $sum: 1 }, lastEndsAt: { $max: '$endsAt' } } },
      ]),
      this.model.countDocuments({ locationId, status: MONTHLY_PASS_STATUS.PENDING }),
    ]);
    return { activeCount: active[0]?.count ?? 0, pendingCount, lastEndsAt: active[0]?.lastEndsAt ?? null };
  }

  // Total credited to the owner for passes at this pitch (kobo).
  async revenueAtPitch(locationId: Types.ObjectId): Promise<number> {
    const [row] = await this.model.aggregate<{ total: number }>([
      { $match: { locationId, status: MONTHLY_PASS_STATUS.ACTIVE, ...NOT_EXTRA_CHARGE } },
      { $group: { _id: null, total: { $sum: '$baseAmount' } } },
    ]);
    return row?.total ?? 0;
  }
}
