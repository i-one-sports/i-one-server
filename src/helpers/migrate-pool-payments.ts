// One-off migration for pooled session payments (SESSION_PAYMENT_MODE.POOL).
//
// 1. Sessions created before pooling have no `paymentMode`. The schema
//    default is POOL, and Mongoose applies defaults when hydrating documents
//    that lack the field — so without this backfill, legacy sessions with
//    fixed per-player bills could be read as pools mid-payment. Every
//    existing session without the field is stamped PER_PERSON.
//    (Unconfigured sessions get their real mode when they're configured.)
// 2. SessionPayment's (sessionId, userId) index was unique (one bill per
//    player). In POOL mode a player can contribute more than once, so it's
//    replaced with a non-unique index on the same fields. No data changes;
//    paymentReference stays unique as the idempotency key.
//
// Run BEFORE deploying the pooling code:
//   npm run migrate:pool-payments -- --dry-run
//   npm run migrate:pool-payments
//
// Safe to re-run.
import 'dotenv/config';
import mongoose, { model } from 'mongoose';
import { SessionSchema, Session } from '@app/common/schemas/session.schema';
import { SESSION_PAYMENT_MODE } from '@app/common/types/common';

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  throw new Error('MONGODB_URI is not set in the environment');
}

const DRY_RUN = process.argv.includes('--dry-run');
const SessionModel = model<Session>('Session', SessionSchema);

async function migrate() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log(`Connected to MongoDB${DRY_RUN ? ' (dry run — no writes)' : ''}`);

    // 1. Backfill paymentMode
    const filter = { paymentMode: { $exists: false } };
    const total = await SessionModel.countDocuments(filter);
    const paid = await SessionModel.countDocuments({ ...filter, paymentRequired: true });
    console.log(`Sessions without paymentMode: ${total} (${paid} paid)`);

    if (!DRY_RUN && total > 0) {
      const result = await SessionModel.updateMany(filter, {
        $set: { paymentMode: SESSION_PAYMENT_MODE.PER_PERSON },
      });
      console.log(`Stamped PER_PERSON: ${result.modifiedCount}`);
    }

    // 2. Replace the unique (sessionId, userId) index
    const collection = mongoose.connection.collection('sessionpayments');
    const indexes = await collection.indexes();
    const oldIndex = indexes.find(
      (idx) => idx.key?.sessionId === 1 && idx.key?.userId === 1 && Object.keys(idx.key).length === 2,
    );

    if (!oldIndex) {
      console.log('No (sessionId, userId) index found — creating non-unique one');
    } else if (!oldIndex.unique) {
      console.log(`Index ${oldIndex.name} is already non-unique — nothing to do`);
    } else {
      console.log(`Dropping unique index ${oldIndex.name}`);
    }

    if (!DRY_RUN && (!oldIndex || oldIndex.unique)) {
      if (oldIndex) await collection.dropIndex(oldIndex.name);
      await collection.createIndex({ sessionId: 1, userId: 1 });
      console.log('Created non-unique index on (sessionId, userId)');
    }

    console.log('Done.');
  } catch (error: any) {
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

migrate();
