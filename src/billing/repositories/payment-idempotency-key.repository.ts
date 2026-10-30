import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AbstractRepository,
  IDEMPOTENCY_STATUS,
  IdempotencyResponse,
  OPEN_IDEMPOTENCY_STATUSES,
  PaymentIdempotencyKey,
} from '@app/common';

@Injectable()
export class PaymentIdempotencyKeyRepository extends AbstractRepository<PaymentIdempotencyKey> {
  protected readonly logger = new Logger(PaymentIdempotencyKeyRepository.name);

  constructor(@InjectModel(PaymentIdempotencyKey.name) model: Model<PaymentIdempotencyKey>) {
    super(model);
  }

  async findOpen(key: string): Promise<PaymentIdempotencyKey | null> {
    return this.findOne({ key, status: { $in: OPEN_IDEMPOTENCY_STATUSES } });
  }

  async complete(id: Types.ObjectId, response: IdempotencyResponse): Promise<void> {
    await this.findRaw().updateOne(
      { _id: id, status: IDEMPOTENCY_STATUS.STARTED },
      { $set: { status: IDEMPOTENCY_STATUS.COMPLETED, response } },
    );
  }

  // Closes an open record. Filtered on it still being open, so a record a
  // webhook already marked PAID is never knocked back to EXPIRED/FAILED.
  async close(id: Types.ObjectId, status: IDEMPOTENCY_STATUS): Promise<boolean> {
    const res = await this.findRaw().updateOne(
      { _id: id, status: { $in: OPEN_IDEMPOTENCY_STATUSES } },
      { $set: { status } },
    );
    return res.modifiedCount === 1;
  }

  // Payment progress, from the webhook / expiry job, which know the reference.
  async closeByReference(reference: string, status: IDEMPOTENCY_STATUS): Promise<void> {
    if (!reference) return;
    await this.findRaw().updateMany(
      { 'response.reference': reference, status: { $in: OPEN_IDEMPOTENCY_STATUSES } },
      { $set: { status } },
    );
  }
}
