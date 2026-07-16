// One-off migration: every currency field in this app moved from naira to
// kobo (naira × 100) to match Paystack's native unit and avoid floating
// point issues. Existing records were entered assuming naira — this
// multiplies them by 100 so they mean the same real-world amount under the
// new convention.
//
// Run once, manually, when ready:
//   npx ts-node -r tsconfig-paths/register src/helpers/migrate-currency-to-kobo.ts
//
// Guarded against double-running: records a marker document in a
// `migrations` collection and refuses to run again if it's already there
// (running this twice would silently 100x every balance in the database).
import 'dotenv/config';
import mongoose, { model, Schema } from 'mongoose';
import { LocationSchema, Location } from '@app/common/schemas/location.schema';
import { SessionSchema, Session } from '@app/common/schemas/session.schema';
import { SessionPaymentSchema, SessionPayment } from '@app/common/schemas/session-payment.schema';
import { WalletSchema, Wallet } from '@app/common/schemas/wallet.schema';
import { TransactionSchema, Transaction } from '@app/common/schemas/transaction.schema';
import { LedgerEntrySchema, LedgerEntry } from '@app/common/schemas/ledger-entry.schema';
import { TournamentPaymentSchema, TournamentPayment } from '@app/common/schemas/tournament-payment.schema';
import { TournamentSchema, Tournament } from '@app/common/schemas/tournament.schema';
import { PlatformCommissionSchema, PlatformCommission } from '@app/common/schemas/platform-commission.schema';

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  throw new Error('MONGODB_URI is not set in the environment');
}

const MIGRATION_ID = 'currency-naira-to-kobo-2026-07';

const MigrationModel = model('Migration', new Schema({ _id: String, appliedAt: Date }, { versionKey: false }));

const LocationModel = model<Location>('Location', LocationSchema);
const SessionModel = model<Session>('Session', SessionSchema);
const SessionPaymentModel = model<SessionPayment>('SessionPayment', SessionPaymentSchema);
const WalletModel = model<Wallet>('Wallet', WalletSchema);
const TransactionModel = model<Transaction>('Transaction', TransactionSchema);
const LedgerEntryModel = model<LedgerEntry>('LedgerEntry', LedgerEntrySchema);
const TournamentPaymentModel = model<TournamentPayment>('TournamentPayment', TournamentPaymentSchema);
const TournamentModel = model<Tournament>('Tournament', TournamentSchema);
const PlatformCommissionModel = model<PlatformCommission>('PlatformCommission', PlatformCommissionSchema);

// $mul only touches documents where the field actually exists and isn't
// null — otherwise $mul on a missing field would set it to 0, silently
// wiping out anything that was legitimately unset (e.g. a free location's
// paymentPerPersonHourly).
async function multiplyFields(
  modelRef: mongoose.Model<any>,
  fields: string[],
  label: string,
) {
  for (const field of fields) {
    const result = await modelRef.updateMany(
      { [field]: { $exists: true, $ne: null } },
      { $mul: { [field]: 100 } },
    );
    console.log(`  ${label}.${field}: ${result.modifiedCount} document(s) updated`);
  }
}

async function migrate() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const already = await MigrationModel.findById(MIGRATION_ID);
    if (already) {
      console.log(`Migration "${MIGRATION_ID}" already applied at ${already.get('appliedAt')} — refusing to run again.`);
      return;
    }

    console.log('Converting currency fields from naira to kobo (×100)...\n');

    await multiplyFields(LocationModel, ['paymentPerPersonHourly', 'paymentPerPersonMonthly', 'tournamentFee'], 'Location');
    await multiplyFields(SessionModel, ['paymentAmount'], 'Session');
    await multiplyFields(SessionPaymentModel, ['amount', 'baseAmount', 'commissionAmount'], 'SessionPayment');
    await multiplyFields(WalletModel, ['balance', 'ledgerBalance'], 'Wallet');
    await multiplyFields(TransactionModel, ['amount', 'balanceBefore', 'balanceAfter'], 'Transaction');
    await multiplyFields(LedgerEntryModel, ['amount', 'balanceAfter'], 'LedgerEntry');
    await multiplyFields(TournamentPaymentModel, ['amount'], 'TournamentPayment');
    await multiplyFields(TournamentModel, ['prizeMoney', 'registrationFee'], 'Tournament');
    await multiplyFields(PlatformCommissionModel, ['baseAmount', 'commissionAmount'], 'PlatformCommission');

    await MigrationModel.create({ _id: MIGRATION_ID, appliedAt: new Date() });

    console.log('\nDone. Marker recorded — re-running this script will now no-op.');
  } catch (error: any) {
    console.error('Migration failed:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

migrate();
