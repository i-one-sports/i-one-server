// One-off backfill for the `status` field added to the Session schema
// (see libs/common/src/schemas/session.schema.ts) as part of the session
// state machine / refund work. Existing session documents predate this
// field entirely — this derives a reasonable status from the fields that
// already existed, so old records aren't just silently missing `status`.
//
// Run once, manually, when ready:
//   npx ts-node -r tsconfig-paths/register src/helpers/migrate-session-status.ts
//
// Safe to re-run: only touches documents where `status` doesn't exist yet.
import 'dotenv/config';
import mongoose, { model } from 'mongoose';
import { SessionSchema, Session } from '@app/common/schemas/session.schema';
import { SESSION_STATUS } from '@app/common/types/common';

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  throw new Error('MONGODB_URI is not set in the environment');
}

const SessionModel = model<Session>('Session', SessionSchema);

async function migrate() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const filter = { status: { $exists: false } };
    const total = await SessionModel.countDocuments(filter);
    console.log(`Found ${total} session(s) without a status field`);

    if (total === 0) {
      console.log('Nothing to migrate.');
      return;
    }

    // Completed: the session was actually played.
    const completedResult = await SessionModel.updateMany(
      { ...filter, finished: true },
      { $set: { status: SESSION_STATUS.COMPLETED, allRefunded: false } },
    );
    console.log(`Marked COMPLETED: ${completedResult.modifiedCount}`);

    // Everything else predates cancel/refund existing as a concept at all,
    // so there's no signal in the old data that distinguishes "still open"
    // from "was cancelled outside the app (manually, or never followed
    // through)". OPEN is the safe default — it doesn't block anything, and
    // any of these that are genuinely dead will just sit there like they
    // already were before this migration ran.
    const openResult = await SessionModel.updateMany(
      { status: { $exists: false } },
      { $set: { status: SESSION_STATUS.OPEN, allRefunded: false } },
    );
    console.log(`Marked OPEN (default): ${openResult.modifiedCount}`);

    const remaining = await SessionModel.countDocuments({ status: { $exists: false } });
    console.log(`Remaining without status: ${remaining}`);
    console.log('Done.');
  } catch (error: any) {
    console.error('Migration failed:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

migrate();
