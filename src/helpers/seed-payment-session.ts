import 'dotenv/config';
import mongoose, { model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { UserSchema, User, PLAYER_POSITION, USER_ROLE } from '@app/common';
import { SessionSchema, Session } from '@app/common/schemas/session.schema';
import { SessionPaymentSchema, SessionPayment, PaymentStatus } from '@app/common/schemas/session-payment.schema';

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) throw new Error('MONGODB_URI is not set in the environment');

const UserModel    = model<User>('User', UserSchema);
const SessionModel = model<Session>('Session', SessionSchema);
const SessionPaymentModel = model<SessionPayment>('SessionPayment', SessionPaymentSchema);

// Reuse the existing seeded location and owner from seed-sessions.ts
const LOCATION_ID = new Types.ObjectId('69a85fb8c23b3d324b49a6e3');
const OWNER_ID    = new Types.ObjectId('69a85fb6c23b3d324b49a6e0');

const MEMBERS = [
  { email: 'user_random@test.com', firstName: 'Tolu',   lastName: 'Adeyemi'  }, // ← the main test user
  { email: 'player2@test.com',     firstName: 'Emeka',  lastName: 'Okonkwo'  },
  { email: 'player3@test.com',     firstName: 'Kola',   lastName: 'Balogun'  },
  { email: 'player4@test.com',     firstName: 'Segun',  lastName: 'Abiodun'  },
  { email: 'player5@test.com',     firstName: 'Chuka',  lastName: 'Nwosu'    },
  { email: 'player6@test.com',     firstName: 'Biodun', lastName: 'Fashola'  },
];

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const hashedPassword = await bcrypt.hash('12345', 10);

  // Upsert all 6 users (safe to run multiple times)
  const userIds: Types.ObjectId[] = [];
  for (const m of MEMBERS) {
    const existing = await UserModel.findOne({ email: m.email });
    if (existing) {
      userIds.push(existing._id as Types.ObjectId);
      console.log(`  User exists: ${m.email} → ${existing._id}`);
    } else {
      const newId = new Types.ObjectId();
      const created = await UserModel.create({
        _id:           newId,
        email:         m.email,
        firstName:     m.firstName,
        lastName:      m.lastName,
        nickname:      m.firstName.toLowerCase() + '_' + m.lastName.toLowerCase(),
        password:      hashedPassword,
        phoneNumber:   `+234${Math.floor(7000000000 + Math.random() * 999999999)}`,
        position:      PLAYER_POSITION.MIDFIELDER,
        role:          USER_ROLE.USER,
        emailVerified: true,
        location: { type: 'Point', coordinates: [3.5977, 6.4525] },
      });
      userIds.push(created._id as Types.ObjectId);
      console.log(`  Created user: ${m.email} → ${created._id}`);
    }
  }

  // Session starts 2 hours from now so it's clearly "upcoming"
  const startTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const stopTime  = new Date(Date.now() + 4 * 60 * 60 * 1000);

  const sessionId = new Types.ObjectId();
  const session = await SessionModel.create({
    _id:                sessionId,
    location:           LOCATION_ID,
    captain:            userIds[0],   // user_random@test.com is captain
    members:            userIds,
    playersPerTeam:     3,
    setNumber:          2,
    minsPerSet:         60,
    timeDuration:       120,
    startTime,
    stopTime,
    maxNumber:          6,
    isFull:             true,
    matchType:          'friendly',
    paymentRequired:    true,
    paymentAmount:      2000,          // ₦2000 per player
    paymentStatus:      'PENDING',
    allPaymentsCompleted: false,
    inProgress:         false,
    finished:           false,
    status:             'OPEN',
  });
  console.log(`\n  Session created: ${session._id}`);

  // All 6 members — all PENDING
  const paymentDocs = userIds.map((userId) => ({
    _id:        new Types.ObjectId(),
    sessionId:  session._id,
    userId,
    locationId: LOCATION_ID,
    ownerId:    OWNER_ID,
    amount:     2000,
    status:     PaymentStatus.PENDING,
    paymentReference: `TEST_${session._id}_${userId}_${Date.now()}`,
  }));

  await SessionPaymentModel.insertMany(paymentDocs);
  console.log(`  Payment records created: ${paymentDocs.length} (all PENDING)`);

  // Point every member's currentSession at the new session
  await UserModel.updateMany(
    { _id: { $in: userIds } },
    { currentSession: sessionId },
  );
  console.log(`  currentSession set on ${userIds.length} users`);

  console.log('\n━━━━ Seed complete ━━━━');
  console.log(`Session ID:     ${session._id}`);
  console.log(`Location ID:    ${LOCATION_ID}`);
  console.log(`\nTest login:`);
  console.log(`  Email:    user_random@test.com`);
  console.log(`  Password: 12345`);
  console.log(`\nAll 6 members are PENDING — use POST /wallet/session/${session._id}/pay to test checkout`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
