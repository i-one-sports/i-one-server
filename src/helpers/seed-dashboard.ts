/**
 * Seed script for /last-matches and /upcoming-sessions dashboard endpoints.
 *
 * Run with:
 *   npx ts-node -r tsconfig-paths/register src/helpers/seed-dashboard.ts
 *
 * It will print the locationId and ownerId to use in your API requests.
 */

import mongoose, { model, Types } from 'mongoose';
import { faker } from '@faker-js/faker';
import * as bcrypt from 'bcrypt';

const PLAIN_PASSWORD = '12345';
let hashedPassword: string;

// ─── Inline schemas (avoids NestJS DI overhead) ──────────────────────────────

const UserSchema = new mongoose.Schema(
  {
    firstName: String,
    lastName: String,
    email: { type: String, unique: true },
    nickname: String,
    password: String,
    address: String,
    phoneNumber: String,
    position: String,
    isOwner: { type: Boolean, default: false },
    role: { type: String, default: 'user' },
    location: {
      type: { type: String, default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
  },
  { timestamps: true, versionKey: false },
);

const LocationSchema = new mongoose.Schema(
  {
    name: String,
    address: String,
    pitchPhoto: String,
    friendly: { type: Boolean, default: true },
    tournament: { type: Boolean, default: true },
    owner: { type: Types.ObjectId, ref: 'User' },
    location: {
      type: { type: String, default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
  },
  { timestamps: true, versionKey: false },
);
LocationSchema.index({ location: '2dsphere' });

const SetSchema = new mongoose.Schema(
  {
    session: { type: Types.ObjectId, ref: 'Session' },
    name: String,
    players: [{ type: Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true, versionKey: false },
);

const SessionSchema = new mongoose.Schema(
  {
    location: { type: Types.ObjectId, ref: 'Location' },
    playersPerTeam: { type: Number, default: 5 },
    setNumber: { type: Number, default: 2 },
    minsPerSet: { type: Number, default: 10 },
    timeDuration: { type: Number, default: 90 },
    startTime: Date,
    stopTime: Date,
    winningDecider: { type: String, default: 'penalties' },
    inProgress: { type: Boolean, default: false },
    finished: { type: Boolean, default: false },
    captain: { type: Types.ObjectId, ref: 'User' },
    members: [{ type: Types.ObjectId, ref: 'User' }],
    maxNumber: { type: Number, default: 10 },
    isFull: { type: Boolean, default: false },
    matchType: { type: String, default: 'friendly' },
    paymentRequired: { type: Boolean, default: false },
    paymentStatus: { type: String, default: 'NOT_INITIATED' },
  },
  { timestamps: true, versionKey: false },
);

const MatchSchema = new mongoose.Schema(
  {
    teamOne: { type: Types.ObjectId, ref: 'Set' },
    teamTwo: { type: Types.ObjectId, ref: 'Set' },
    teamOneScore: { type: Number, default: 0 },
    teamTwoScore: { type: Number, default: 0 },
    isStarted: { type: Boolean, default: false },
    session: { type: Types.ObjectId, ref: 'Session' },
    matchType: { type: String, default: 'friendly' },
  },
  { timestamps: true, versionKey: false },
);

// ─── Models ───────────────────────────────────────────────────────────────────

const UserModel = model('User', UserSchema);
const LocationModel = model('Location', LocationSchema);
const SetModel = model('Set', SetSchema);
const SessionModel = model('Session', SessionSchema);
const MatchModel = model('Match', MatchSchema);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  await mongoose.connect(
    'mongodb+srv://afkione:GXYZB1sXiyNLfjoF@i-one.bbgiqi0.mongodb.net/i-one?retryWrites=true&w=majority&appName=i-One',
  );

  hashedPassword = await bcrypt.hash(PLAIN_PASSWORD, 10);

  // 1. Create 10 regular players
  const playerDocs = await UserModel.insertMany(
    Array.from({ length: 10 }, () => ({
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      email: faker.internet.email(),
      nickname: faker.internet.userName(),
      password: hashedPassword,
      address: faker.location.streetAddress(),
      phoneNumber: `+234${faker.string.numeric(10)}`,
      position: 'MF',
      role: 'user',
      location: { type: 'Point', coordinates: [3.5977, 6.4525] },
    })),
  );
  const playerIds = playerDocs.map((p) => p._id);

  // 2. Create an owner user
  const owner = await UserModel.create({
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    email: `owner_${Date.now()}@example.com`,
    nickname: 'pitch_owner',
    password: hashedPassword,
    address: faker.location.streetAddress(),
    phoneNumber: `+234${faker.string.numeric(10)}`,
    position: 'MF',
    isOwner: true,
    role: 'admin',
    location: { type: 'Point', coordinates: [3.5977, 6.4525] },
  });

  // 3. Create a location owned by that user
  const location = await LocationModel.create({
    name: `${faker.location.city()} Sports Complex`,
    address: faker.location.streetAddress(),
    pitchPhoto: 'https://example.com/pitch.jpg',
    friendly: true,
    tournament: true,
    owner: owner._id,
    location: { type: 'Point', coordinates: [3.5977, 6.4525] },
  });

  // ── Past sessions (for /last-matches) ──────────────────────────────────────

  for (let i = 0; i < 5; i++) {
    const sessionStart = daysAgo(i + 1);
    const sessionStop = new Date(sessionStart.getTime() + 90 * 60 * 1000);

    const session = await SessionModel.create({
      location: location._id,
      playersPerTeam: 5,
      setNumber: 2,
      minsPerSet: 10,
      timeDuration: 90,
      startTime: sessionStart,
      stopTime: sessionStop,
      inProgress: false,
      finished: true,
      captain: playerIds[0],
      members: playerIds.slice(0, 10),
      maxNumber: 10,
      isFull: true,
      matchType: 'friendly',
    });

    // Two sets (teams) per session
    const teamA = await SetModel.create({
      session: session._id,
      name: `Team Alpha ${i + 1}`,
      players: playerIds.slice(0, 5),
    });

    const teamB = await SetModel.create({
      session: session._id,
      name: `Team Beta ${i + 1}`,
      players: playerIds.slice(5, 10),
    });

    // One match per session
    await MatchModel.create({
      session: session._id,
      teamOne: teamA._id,
      teamTwo: teamB._id,
      teamOneScore: faker.number.int({ min: 0, max: 5 }),
      teamTwoScore: faker.number.int({ min: 0, max: 5 }),
      isStarted: true,
      matchType: 'friendly',
    });
  }

  // ── Future sessions (for /upcoming-sessions) ────────────────────────────────

  for (let i = 0; i < 5; i++) {
    const sessionStart = daysFromNow(i + 1);

    await SessionModel.create({
      location: location._id,
      playersPerTeam: 5,
      setNumber: 2,
      minsPerSet: 10,
      timeDuration: 90,
      startTime: sessionStart,
      inProgress: false,
      finished: false,
      captain: playerIds[0],
      members: playerIds.slice(0, i + 2), // partially filled
      maxNumber: 10,
      isFull: false,
      matchType: 'friendly',
    });
  }

  console.log('\n✅ Seed complete!\n');
  console.log('locationId :', location._id.toString());
  console.log('ownerId    :', owner._id.toString());
  console.log('\nUse these in your requests:');
  console.log(
    `  GET /location/${location._id}/dashboard/last-matches`,
  );
  console.log(
    `  GET /location/${location._id}/dashboard/upcoming-sessions`,
  );

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  mongoose.disconnect();
});
