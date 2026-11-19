// One-off migration: backfills the new `nameLower` field on every existing
// Location document (a trimmed, lowercased copy of `name`, kept in sync at
// write time going forward — see locations.service.ts / users.service.ts).
// It exists so name search can query an index directly instead of running a
// case-insensitive regex scan over `name`, which can't use a B-tree index.
//
// Run once, manually, when ready:
//   npx ts-node -r tsconfig-paths/register src/helpers/migrate-add-location-name-lower.ts
//
// Guarded against double-running: records a marker document in the
// `migrations` collection and refuses to run again if it's already there.
import 'dotenv/config';
import mongoose, { model, Schema } from 'mongoose';
import { LocationSchema, Location } from '@app/common/schemas/location.schema';

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  throw new Error('MONGODB_URI is not set in the environment');
}

const MIGRATION_ID = 'location-add-name-lower-2026-09';

const MigrationModel = model('Migration', new Schema({ _id: String, appliedAt: Date }, { versionKey: false }));
const LocationModel = model<Location>('Location', LocationSchema);

async function migrate() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const already = await MigrationModel.findById(MIGRATION_ID);
    if (already) {
      console.log(`Migration "${MIGRATION_ID}" already applied at ${already.get('appliedAt')} — refusing to run again.`);
      return;
    }

    console.log('Backfilling Location.nameLower...\n');

    const cursor = LocationModel.find(
      { $or: [{ nameLower: { $exists: false } }, { nameLower: null }] },
      { name: 1 },
    ).cursor();

    let updated = 0;
    for await (const doc of cursor) {
      await LocationModel.updateOne(
        { _id: doc._id },
        { $set: { nameLower: doc.name.trim().toLowerCase() } },
      );
      updated++;
    }

    console.log(`  Location.nameLower: ${updated} document(s) updated`);

    await MigrationModel.create({ _id: MIGRATION_ID, appliedAt: new Date() });

    console.log('\nDone. Marker recorded — re-running this script will now no-op.');
  } catch (error: any) {
    console.error('Migration failed:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

migrate();
