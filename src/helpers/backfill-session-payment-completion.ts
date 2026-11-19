// One-off backfill for sessions stuck showing paymentStatus PENDING /
// allPaymentsCompleted false even though every member's SessionPayment is
// actually PAID. Before this fix, confirmSessionPayment (see
// src/billing/services/session-payment.service.ts) never re-checked the
// parent session once the last member paid, so the session's own summary
// fields were only ever set once (to PENDING, by onSessionFull) and never
// flipped back. That's now fixed going forward, but it fixed the code path,
// not existing data — sessions that were already fully paid before this fix
// shipped have no future payment event left to trigger the recheck.
//
// Run once, manually, when ready:
//   npx ts-node -r tsconfig-paths/register src/helpers/backfill-session-payment-completion.ts
//
// Safe to re-run: only touches sessions that are OPEN, paymentRequired,
// not already COMPLETED, and where every SessionPayment is actually PAID.
import 'dotenv/config';
import mongoose, { model } from 'mongoose';
import { SessionSchema, Session } from '@app/common/schemas/session.schema';
import { SessionPaymentSchema, SessionPayment, PaymentStatus } from '@app/common/schemas/session-payment.schema';
import { SESSION_STATUS } from '@app/common/types/common';

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  throw new Error('MONGODB_URI is not set in the environment');
}

const SessionModel = model<Session>('Session', SessionSchema);
const SessionPaymentModel = model<SessionPayment>('SessionPayment', SessionPaymentSchema);

async function backfill() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const candidates = await SessionModel.find({
      paymentRequired: true,
      status: SESSION_STATUS.OPEN,
      paymentStatus: { $ne: 'COMPLETED' },
    });
    console.log(`Checking ${candidates.length} candidate session(s)`);

    let fixed = 0;
    for (const session of candidates) {
      const [total, unpaid] = await Promise.all([
        SessionPaymentModel.countDocuments({ sessionId: session._id }),
        SessionPaymentModel.countDocuments({ sessionId: session._id, status: { $ne: PaymentStatus.PAID } }),
      ]);

      if (total === 0 || unpaid > 0) continue;

      await SessionModel.updateOne(
        { _id: session._id },
        { $set: { paymentStatus: 'COMPLETED', allPaymentsCompleted: true } },
      );
      console.log(`Fixed session ${session._id} (${total}/${total} members paid)`);
      fixed++;
    }

    console.log(`\nDone. Fixed ${fixed} session(s).`);
  } catch (error: any) {
    console.error('Backfill failed:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

backfill();
