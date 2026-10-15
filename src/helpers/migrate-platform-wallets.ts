// One-off migration for the platform ledger wallet and the 15% commission.
//
// 1. Wallet indexes. Wallets used to require a userId with a plain unique
//    index on it. The PLATFORM wallet has no user, and MongoDB treats a
//    missing userId as a value — so the plain index would allow only one
//    userless wallet and clash. Replace it with:
//      - userId unique only where userId is set (owners), and
//      - kind unique only for PLATFORM (exactly one platform wallet).
//    No wallet data changes; existing wallets have no `kind` and read as
//    OWNER.
// 2. Commission. Set Settings.commissionPercentage to 15 — but only if no
//    super admin has ever set it (commissionUpdatedAt missing). A deliberate
//    choice is never overwritten.
//
// Run BEFORE deploying the platform-wallet code:
//   npm run migrate:platform-wallets -- --dry-run
//   npm run migrate:platform-wallets
//
// Safe to re-run.
import 'dotenv/config';
import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  throw new Error('MONGODB_URI is not set in the environment');
}

const DRY_RUN = process.argv.includes('--dry-run');
const TARGET_COMMISSION = 15;

async function migrate() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log(`Connected to MongoDB${DRY_RUN ? ' (dry run — no writes)' : ''}`);

    // 1. Wallet indexes
    const wallets = mongoose.connection.collection('wallets');
    const indexes = await wallets.indexes();
    const oldIndex = indexes.find(
      (idx) => idx.key?.userId === 1 && Object.keys(idx.key).length === 1 && idx.unique && !idx.partialFilterExpression,
    );

    if (oldIndex) {
      console.log(`Will drop plain unique index ${oldIndex.name} on wallets.userId`);
      if (!DRY_RUN) await wallets.dropIndex(oldIndex.name);
    } else {
      console.log('No plain unique userId index on wallets — nothing to drop');
    }

    const hasPartialUserId = indexes.some((idx) => idx.name === 'userId_unique_when_set');
    const hasPlatformKind = indexes.some((idx) => idx.name === 'one_platform_wallet');
    if (!DRY_RUN) {
      if (!hasPartialUserId) {
        await wallets.createIndex(
          { userId: 1 },
          { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } }, name: 'userId_unique_when_set' },
        );
      }
      if (!hasPlatformKind) {
        await wallets.createIndex(
          { kind: 1 },
          { unique: true, partialFilterExpression: { kind: 'PLATFORM' }, name: 'one_platform_wallet' },
        );
      }
    }
    console.log(
      `Partial indexes: userId_unique_when_set ${hasPartialUserId ? 'exists' : DRY_RUN ? 'would be created' : 'created'}, ` +
        `one_platform_wallet ${hasPlatformKind ? 'exists' : DRY_RUN ? 'would be created' : 'created'}`,
    );

    // 2. Commission → 15% if never set
    const settings = mongoose.connection.collection('settings');
    const doc = await settings.findOne({});
    if (!doc) {
      console.log(`No Settings document yet — the app will create it with the ${TARGET_COMMISSION}% default`);
    } else if (doc.commissionUpdatedAt) {
      console.log(
        `Commission was already set (${doc.commissionPercentage}% on ${doc.commissionUpdatedAt}) — leaving it`,
      );
    } else {
      console.log(`Commission is ${doc.commissionPercentage ?? 0}% and was never set — setting it to ${TARGET_COMMISSION}%`);
      if (!DRY_RUN) {
        await settings.updateOne(
          { _id: doc._id },
          { $set: { commissionPercentage: TARGET_COMMISSION, commissionUpdatedAt: new Date() } },
        );
      }
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
