import mongoose, { model, Types } from 'mongoose';
import { SessionSchema, Session } from '@app/common/schemas/session.schema';
import { SetSchema, Set } from '@app/common/schemas/sets.schema';
import { MatchSchema, Match } from '@app/common/schemas/match.schema';
import { SessionPaymentSchema, SessionPayment, PaymentStatus } from '@app/common/schemas/session-payment.schema';

const MONGO_URI = 'mongodb+srv://afkione:GXYZB1sXiyNLfjoF@i-one.bbgiqi0.mongodb.net/i-one?retryWrites=true&w=majority&appName=i-One';

const SessionModel = model<Session>('Session', SessionSchema);
const SetModel = model<Set>('Set', SetSchema);
const MatchModel = model<Match>('Match', MatchSchema);
const SessionPaymentModel = model<SessionPayment>('SessionPayment', SessionPaymentSchema);

// Existing users
const CHIDI   = new Types.ObjectId('69b9a94b8ddebdcd05151d5d'); // captain, MF
const EMEKA   = new Types.ObjectId('69b9a9478ddebdcd05151d57'); // ST
const TUNDE   = new Types.ObjectId('69b9a9478ddebdcd05151d59'); // DF
const FEMI    = new Types.ObjectId('69b9a9478ddebdcd05151d5a'); // MF
const UCHE    = new Types.ObjectId('69b9a9488ddebdcd05151d5b'); // ST
const KOLA    = new Types.ObjectId('69b9a9488ddebdcd05151d5c'); // DF

const LOCATION_ID = new Types.ObjectId('69a85fb8c23b3d324b49a6e3');
const OWNER_ID    = new Types.ObjectId('69a85fb6c23b3d324b49a6e0');

const ALL_MEMBERS = [CHIDI, EMEKA, TUNDE, FEMI, UCHE, KOLA];

// Tomorrow: April 16 2026
const makeTime = (hour: number) => {
  const d = new Date('2026-04-16T00:00:00.000Z');
  d.setUTCHours(hour, 0, 0, 0);
  return d;
};

async function seedSession(label: string, startHour: number, stopHour: number) {
  console.log(`\nSeeding ${label}...`);

  const sessionId  = new Types.ObjectId();
  const teamAlphaId = new Types.ObjectId();
  const teamBetaId  = new Types.ObjectId();
  const matchId     = new Types.ObjectId();

  // 1. Create session
  const session = await SessionModel.create({
    _id: sessionId,
    location: LOCATION_ID,
    captain: CHIDI,
    members: ALL_MEMBERS,
    playersPerTeam: 3,
    setNumber: 2,
    minsPerSet: 60,
    timeDuration: (stopHour - startHour) * 60,
    startTime: makeTime(startHour),
    stopTime: makeTime(stopHour),
    maxNumber: 6,
    isFull: true,
    matchType: 'friendly',
    paymentRequired: true,
    paymentAmount: 1000,
    paymentStatus: 'PENDING',
    inProgress: false,
    finished: false,
  });
  console.log(`  Session created: ${session._id}`);

  // 2. Create two sets
  const teamAlpha = await SetModel.create({
    _id: teamAlphaId,
    session: sessionId,
    name: 'Team Alpha',
    players: [EMEKA, TUNDE, CHIDI],
  });

  const teamBeta = await SetModel.create({
    _id: teamBetaId,
    session: sessionId,
    name: 'Team Beta',
    players: [FEMI, UCHE, KOLA],
  });
  console.log(`  Sets created: ${teamAlpha._id}, ${teamBeta._id}`);

  // 3. Create match (3-2, teamAlpha wins)
  const match = await MatchModel.create({
    _id: matchId,
    session: sessionId,
    teamOne: teamAlphaId,
    teamTwo: teamBetaId,
    teamOneScore: 3,
    teamTwoScore: 2,
    isStarted: true,
    matchType: 'friendly',
    goalScorers: [
      { player: EMEKA, team: 'teamOne' },
      { player: TUNDE, team: 'teamOne' },
      { player: EMEKA, team: 'teamOne' },
      { player: FEMI,  team: 'teamTwo' },
      { player: UCHE,  team: 'teamTwo' },
    ],
  });
  console.log(`  Match created: ${match._id}`);

  // 4. Payment records — Team Alpha PAID, Team Beta PENDING
  const payments = await SessionPaymentModel.insertMany([
    { _id: new Types.ObjectId(), sessionId, userId: EMEKA, locationId: LOCATION_ID, ownerId: OWNER_ID, amount: 1000, status: PaymentStatus.PAID,    paidAt: new Date() },
    { _id: new Types.ObjectId(), sessionId, userId: TUNDE, locationId: LOCATION_ID, ownerId: OWNER_ID, amount: 1000, status: PaymentStatus.PAID,    paidAt: new Date() },
    { _id: new Types.ObjectId(), sessionId, userId: CHIDI, locationId: LOCATION_ID, ownerId: OWNER_ID, amount: 1000, status: PaymentStatus.PAID,    paidAt: new Date() },
    { _id: new Types.ObjectId(), sessionId, userId: FEMI,  locationId: LOCATION_ID, ownerId: OWNER_ID, amount: 1000, status: PaymentStatus.PENDING },
    { _id: new Types.ObjectId(), sessionId, userId: UCHE,  locationId: LOCATION_ID, ownerId: OWNER_ID, amount: 1000, status: PaymentStatus.PENDING },
    { _id: new Types.ObjectId(), sessionId, userId: KOLA,  locationId: LOCATION_ID, ownerId: OWNER_ID, amount: 1000, status: PaymentStatus.PENDING },
  ]);
  console.log(`  Payment records created: ${payments.length}`);

  return sessionId;
}

const seedLocationSessions = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const session1Id = await seedSession('Session 1 (10am–12pm)', 10, 12);
    const session2Id = await seedSession('Session 2 (2pm–4pm)', 14, 16);

    console.log('\nDone!');
    console.log(`Session 1 ID: ${session1Id}`);
    console.log(`Session 2 ID: ${session2Id}`);
    console.log(`Location ID:  69a85fb8c23b3d324b49a6e3`);
    console.log(`\nTest with: GET /sessions/by-location/69a85fb8c23b3d324b49a6e3?date=2026-04-16`);
  } catch (error: any) {
    console.error('Seeding failed:', error.message);
  } finally {
    await mongoose.disconnect();
  }
};

seedLocationSessions();
