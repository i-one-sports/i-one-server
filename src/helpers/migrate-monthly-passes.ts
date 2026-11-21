// Monthly pass migration (Phase 4). Run once, right after the monthly-pass
// release is deployed:
//
//   npm run migrate:monthly-passes -- --dry-run   # counts only, writes nothing
//   npm run migrate:monthly-passes                # for real
//
// Before this release a "monthly pass" was just a player's latest PAID
// monthly SessionPayment from the last 30 days, and sessions at monthly
// pitches billed each player. Now passes are their own records and those
// sessions have no bill. This script:
//
//  1. Turns every PAID monthly SessionPayment from the last 30 days into an
//     ACTIVE MonthlyPass (startsAt = paidAt, 30 days). Several for the same
//     player + pitch are chained end-to-end so nobody loses days. The payment
//     gets metadata.convertedToPass, so session refunds never refund it. No
//     ledger rows are written: the owner was credited when it was paid.
//  2. Converts every unplayed open session at a monthly pitch to a pass
//     session (requiresPass, no bill). Members whose pass covers it are
//     recorded as pass holders. Unpaid monthly bills are cancelled (EXPIRED);
//     those players stay in the session and are asked to buy a pass. A late
//     payment on a cancelled bill is refunded in full by the webhook.
//
// Safe to re-run: converted payments are skipped (and a migrated pass's
// reference is unique), converted sessions no longer match. A marker in the
// `migrations` collection records each real run.
import 'dotenv/config';
import mongoose, { model, Schema, Types } from 'mongoose';
import {
  IDEMPOTENCY_STATUS,
  Location,
  LocationSchema,
  LOCATION_PRICING_OPTION,
  LOCATION_TIER,
  MonthlyPass,
  MonthlyPassSchema,
  MONTHLY_PASS_DAYS,
  MONTHLY_PASS_STATUS,
  OPEN_IDEMPOTENCY_STATUSES,
  PaymentIdempotencyKey,
  PaymentIdempotencyKeySchema,
  Session,
  SessionSchema,
  SESSION_PAYMENT_MODE,
  SESSION_STATUS,
} from '@app/common';
import { PaymentStatus, SessionPayment, SessionPaymentSchema } from '@app/common/schemas/session-payment.schema';

const MIGRATION_ID = 'monthly-passes-2026-11';
const DAY_MS = 24 * 60 * 60 * 1000;
const DRY_RUN = process.argv.includes('--dry-run');

const MigrationModel = model('Migration', new Schema({ _id: String, appliedAt: Date, summary: Object }, { versionKey: false }));
const LocationModel = model<Location>('Location', LocationSchema);
const SessionModel = model<Session>('Session', SessionSchema);
const SessionPaymentModel = model<SessionPayment>('SessionPayment', SessionPaymentSchema);
const MonthlyPassModel = model<MonthlyPass>('MonthlyPass', MonthlyPassSchema);
const IdempotencyKeyModel = model<PaymentIdempotencyKey>('PaymentIdempotencyKey', PaymentIdempotencyKeySchema);

type PaymentRow = SessionPayment & { _id: Types.ObjectId };
type SessionRow = Session & { _id: Types.ObjectId };

const summary = {
  dryRun: DRY_RUN,
  paymentsConverted: 0,
  passesCreated: 0,
  chainedPasses: 0, // created after another pass of the same player at the same pitch
  sessionsConverted: 0,
  passHoldersRecorded: 0,
  unpaidBillsCancelled: 0,
  membersWithoutPass: 0, // stay in their session; must buy a pass
  fullSessionsNeedingTeams: [] as string[], // full now that there's no bill: POST /sets/create/:id
  paidBillsNotConverted: [] as string[], // paid monthly bills on these sessions that weren't turned into a pass — review by hand
};

const key = (userId: Types.ObjectId, locationId: Types.ObjectId) => `${userId}:${locationId}`;

// ─── 1. Recent monthly payments → passes ───────────────────────────────────
async function convertPayments(now: Date) {
  const payments = await SessionPaymentModel.find({
    status: PaymentStatus.PAID,
    'metadata.pricingOption': LOCATION_PRICING_OPTION.MONTHLY,
    'metadata.paymentMode': { $ne: SESSION_PAYMENT_MODE.POOL },
    'metadata.convertedToPass': { $exists: false },
    duplicateOf: { $exists: false },
    paidAt: { $gte: new Date(now.getTime() - MONTHLY_PASS_DAYS * DAY_MS) },
  })
    .sort({ paidAt: 1 })
    .lean<PaymentRow[]>();

  // Where each player's chain at each pitch currently ends (existing passes).
  const chainEnd = new Map<string, Date>();

  for (const payment of payments) {
    const chain = key(payment.userId, payment.locationId);
    if (!chainEnd.has(chain)) {
      const latest = await MonthlyPassModel.findOne({
        userId: payment.userId,
        locationId: payment.locationId,
        status: MONTHLY_PASS_STATUS.ACTIVE,
        duplicateOf: { $exists: false },
      })
        .sort({ endsAt: -1 })
        .select('endsAt')
        .lean<{ endsAt?: Date }>();
      if (latest?.endsAt) chainEnd.set(chain, latest.endsAt);
    }

    const paidAt = new Date(payment.paidAt);
    const previousEnd = chainEnd.get(chain);
    const startsAt = previousEnd && previousEnd > paidAt ? previousEnd : paidAt;
    const endsAt = new Date(startsAt.getTime() + MONTHLY_PASS_DAYS * DAY_MS);
    if (previousEnd && previousEnd > paidAt) summary.chainedPasses++;
    chainEnd.set(chain, endsAt);

    const passId = new Types.ObjectId();
    if (!DRY_RUN) {
      try {
        await MonthlyPassModel.create({
          _id: passId,
          userId: payment.userId,
          locationId: payment.locationId,
          ownerId: payment.ownerId,
          baseAmount: payment.baseAmount ?? payment.amount,
          commissionAmount: payment.commissionAmount ?? 0,
          commissionPercentage: payment.commissionPercentage ?? 0,
          processingFee: payment.processingFee ?? 0,
          amount: payment.amount,
          status: MONTHLY_PASS_STATUS.ACTIVE,
          startsAt,
          endsAt,
          paymentReference: `MIGRATED_${payment._id}`,
          previousReferences: [],
          paidReference: payment.paidReference ?? payment.paymentReference,
          paidAt,
          ...(payment.paystackFee !== undefined && { paystackFee: payment.paystackFee }),
          ...(payment.transactionId && { transactionId: payment.transactionId }),
          expiresAt: paidAt,
          convertedFromPaymentId: payment._id,
        });
      } catch (error: unknown) {
        // Already migrated by an earlier (interrupted) run: just link it.
        if ((error as { code?: number }).code !== 11000) throw error;
        const existing = await MonthlyPassModel.findOne({ paymentReference: `MIGRATED_${payment._id}` }).select('_id').lean<{ _id: Types.ObjectId }>();
        if (!existing) throw error;
        await SessionPaymentModel.updateOne({ _id: payment._id }, { $set: { 'metadata.convertedToPass': existing._id.toString() } });
        continue;
      }
      await SessionPaymentModel.updateOne({ _id: payment._id }, { $set: { 'metadata.convertedToPass': passId.toString() } });
    }
    summary.paymentsConverted++;
    summary.passesCreated++;
  }
  return chainEnd;
}

// ─── 2. Open monthly sessions → pass sessions ──────────────────────────────
async function convertSessions(now: Date) {
  const monthlyPitches = await LocationModel.find({ tier: LOCATION_TIER.PAID, pricingOption: LOCATION_PRICING_OPTION.MONTHLY })
    .select('_id')
    .lean<Array<{ _id: Types.ObjectId }>>();
  if (!monthlyPitches.length) return;

  const sessions = await SessionModel.find({
    location: { $in: monthlyPitches.map((p) => p._id) },
    requiresPass: { $ne: true },
    paymentMode: { $ne: SESSION_PAYMENT_MODE.POOL },
    status: SESSION_STATUS.OPEN,
    finished: { $ne: true },
    startTime: { $gt: now },
  }).lean<SessionRow[]>();

  for (const session of sessions) {
    const locationId = new Types.ObjectId(session.location.toString());
    const startTime = new Date(session.startTime);
    const memberIds = (session.members ?? []).map((m) => new Types.ObjectId(m.toString()));

    // In a dry run the passes from step 1 don't exist yet, so this undercounts
    // pass holders; the real run sees them.
    const passHolders: Array<{ userId: Types.ObjectId; passId: Types.ObjectId }> = [];
    for (const userId of memberIds) {
      const pass = await MonthlyPassModel.findOne({
        userId,
        locationId,
        status: MONTHLY_PASS_STATUS.ACTIVE,
        duplicateOf: { $exists: false },
        startsAt: { $lte: startTime },
        endsAt: { $gt: startTime },
      })
        .select('_id')
        .lean<{ _id: Types.ObjectId }>();
      if (pass) passHolders.push({ userId, passId: pass._id });
    }
    summary.passHoldersRecorded += passHolders.length;
    summary.membersWithoutPass += memberIds.length - passHolders.length;

    const bills = await SessionPaymentModel.find({ sessionId: session._id, duplicateOf: { $exists: false } })
      .select('status paymentReference metadata')
      .lean<PaymentRow[]>();
    const unpaid = bills.filter((bill) => bill.status === PaymentStatus.PENDING);
    summary.unpaidBillsCancelled += unpaid.length;
    for (const bill of bills) {
      if (bill.status === PaymentStatus.PAID && !bill.metadata?.convertedToPass && DRY_RUN === false) {
        // Re-read: step 1 may have just converted it.
        const fresh = await SessionPaymentModel.findById(bill._id).select('metadata').lean<{ metadata?: Record<string, unknown> }>();
        if (!fresh?.metadata?.convertedToPass) summary.paidBillsNotConverted.push(bill._id.toString());
      }
    }
    if (session.isFull) summary.fullSessionsNeedingTeams.push(session._id.toString());
    summary.sessionsConverted++;

    if (DRY_RUN) continue;

    if (unpaid.length) {
      await SessionPaymentModel.updateMany(
        { _id: { $in: unpaid.map((b) => b._id) }, status: PaymentStatus.PENDING },
        { $set: { status: PaymentStatus.EXPIRED, 'metadata.cancelledByMigration': MIGRATION_ID } },
      );
      // Close their open checkouts so a tap doesn't reopen a cancelled bill.
      await IdempotencyKeyModel.updateMany(
        { 'response.reference': { $in: unpaid.map((b) => b.paymentReference) }, status: { $in: OPEN_IDEMPOTENCY_STATUSES } },
        { $set: { status: IDEMPOTENCY_STATUS.EXPIRED } },
      );
    }

    await SessionModel.updateOne(
      { _id: session._id, requiresPass: { $ne: true } },
      {
        $set: {
          requiresPass: true,
          pricingOption: LOCATION_PRICING_OPTION.MONTHLY,
          paymentRequired: false,
          paymentAmount: 0,
          paymentStatus: 'COMPLETED',
          allPaymentsCompleted: true,
          passHolders,
          passHolds: [],
        },
      },
    );
  }
}

async function migrate() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set in the environment');
  await mongoose.connect(uri);
  console.log(`Connected. ${DRY_RUN ? 'DRY RUN — nothing will be written.' : 'Writing changes.'}`);

  const previous = await MigrationModel.findById(MIGRATION_ID).lean<{ appliedAt?: Date }>();
  if (previous && !DRY_RUN) {
    console.log(`Note: "${MIGRATION_ID}" already ran at ${previous.appliedAt}. Re-running only picks up anything left over.`);
  }

  if (!DRY_RUN) await MonthlyPassModel.syncIndexes(); // the unique indexes this relies on
  const now = new Date();
  await convertPayments(now);
  await convertSessions(now);

  if (!DRY_RUN) {
    await MigrationModel.updateOne({ _id: MIGRATION_ID }, { $set: { appliedAt: new Date(), summary } }, { upsert: true });
  }

  console.log('\nSummary');
  console.log(`  Monthly payments turned into passes:  ${summary.paymentsConverted} (${summary.chainedPasses} chained after an earlier pass)`);
  console.log(`  Open monthly sessions converted:      ${summary.sessionsConverted}`);
  console.log(`  Members recorded as pass holders:     ${summary.passHoldersRecorded}${DRY_RUN ? ' (undercounted in a dry run)' : ''}`);
  console.log(`  Members without a pass (stay, must buy one): ${summary.membersWithoutPass}`);
  console.log(`  Unpaid monthly bills cancelled:       ${summary.unpaidBillsCancelled}`);
  if (summary.fullSessionsNeedingTeams.length) {
    console.log(`  Full sessions that now need teams (POST /sets/create/:id): ${summary.fullSessionsNeedingTeams.join(', ')}`);
  }
  if (summary.paidBillsNotConverted.length) {
    console.log(`  ⚠ Paid monthly bills NOT turned into a pass (older than 30 days or missing pricing info) — review by hand: ${summary.paidBillsNotConverted.join(', ')}`);
  }
}

migrate()
  .catch((error: unknown) => {
    console.error('Migration failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
