/**
 * Seed script: upserts the full bank list from Paystack's GET /bank endpoint
 * into the `banks` collection.
 * Run: npx ts-node -r tsconfig-paths/register scripts/seed-banks.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import axios from 'axios';

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  throw new Error('MONGODB_URI is not set in the environment');
}

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = process.env.PAYSTACK_BASE_URL;

// ─── Schema (mirrors libs/common/src/schemas/bank.schema.ts) ────────────────

const BankSchema = new mongoose.Schema(
  {
    paystackId: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    slug: String,
    code: { type: String, required: true, unique: true },
    longcode: String,
    gateway: String,
    payWithBank: { type: Boolean, default: false },
    supportsTransfer: { type: Boolean, default: false },
    availableForDirectDebit: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    country: { type: String, default: 'Nigeria' },
    currency: { type: String, default: 'NGN' },
    type: String,
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

const BankModel = mongoose.model('Bank', BankSchema);

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seedBanksFromPaystack() {
  console.log('\n🌱 Starting Bank seed from Paystack...\n');

  if (!PAYSTACK_SECRET_KEY || !PAYSTACK_BASE_URL) {
    console.warn('PAYSTACK credentials not provided. Skipping bank seed.');
    return;
  }

  await mongoose.connect(MONGO_URI as string);
  console.log('Connected to MongoDB');

  try {
    const { data } = await axios.get(`${PAYSTACK_BASE_URL}/bank`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
      params: { country: 'Nigeria' },
    });

    const banks = data?.data || data;
    if (!Array.isArray(banks)) {
      console.warn('Unexpected banks response shape, skipping bank seed');
      return;
    }

    console.log(`🔁 Upserting ${banks.length} banks`);

    let upserted = 0;
    let failed = 0;
    for (const b of banks) {
      try {
        await BankModel.updateOne(
          { code: String(b.code) },
          {
            $set: {
              paystackId: b.id,
              name: b.name,
              slug: b.slug || null,
              code: String(b.code),
              longcode: b.longcode || null,
              gateway: b.gateway || null,
              payWithBank: !!b.pay_with_bank,
              supportsTransfer: !!b.supports_transfer,
              availableForDirectDebit: !!b.available_for_direct_debit,
              active: !!b.active,
              country: b.country || 'Nigeria',
              currency: b.currency || 'NGN',
              type: b.type || null,
              isDeleted: !!b.is_deleted,
            },
          },
          { upsert: true },
        );
        upserted++;
      } catch (err: any) {
        failed++;
        console.warn(`⚠️ Failed to upsert bank code=${b.code} id=${b.id}:`, err?.message || err);
      }
    }

    console.log(`\n✅ Bank seed completed — ${upserted} upserted, ${failed} failed`);
  } catch (err: any) {
    console.error('❌ Error seeding banks:', err?.response?.data || err.message || err);
    throw err;
  } finally {
    await mongoose.disconnect();
  }
}

seedBanksFromPaystack().catch((err) => {
  console.error(err);
  process.exit(1);
});
