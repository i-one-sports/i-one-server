/**
 * Seed script: creates 4 tournaments (mix of knockout & league) for an existing
 * owner user, at a location they own.
 * Run: npx ts-node -r tsconfig-paths/register scripts/seed-tournaments.ts
 */

import 'dotenv/config';
import mongoose, { Types } from 'mongoose';

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  throw new Error('MONGODB_URI is not set in the environment');
}

const OWNER_EMAIL = 'owner_1772642230576@example.com';

// ─── Schemas (minimal — only the fields this script touches) ────────────────

const UserSchema = new mongoose.Schema(
  { email: { type: String, unique: true } },
  { timestamps: true, strict: false },
);

const LocationSchema = new mongoose.Schema(
  { owner: { type: Types.ObjectId, ref: 'User' } },
  { timestamps: true, strict: false },
);

const TournamentSchema = new mongoose.Schema(
  {
    name: String,
    description: { type: String, default: '' },
    location: { type: Types.ObjectId, ref: 'Location', required: true },
    prizeMoney: { type: Number, default: 0 },
    code: { type: String, required: true, unique: true, match: /^[a-zA-Z0-9_-]+$/ },
    registrationFee: { type: Number, default: 0 },
    status: { type: String, default: 'registration' },
    type: { type: String, enum: ['knockout', 'league'], default: 'knockout' },
    minutesPerMatch: { type: Number, default: 90 },
    playersPerTeam: { type: Number, default: 5 },
    maxTeams: { type: Number, default: 8 },
    pitches: { type: [String], default: [] },
    teamPrizes: { type: [String], default: [] },
    playerPrizes: { type: [String], default: [] },
    rules: { type: [String], default: [] },
    registeredTeams: { type: [{ type: Types.ObjectId, ref: 'Team' }], default: [] },
    bracket: { type: [Object], default: [] },
    fixtures: { type: [Object], default: [] },
    standings: { type: [Object], default: [] },
    totalFixtures: { type: Number, default: 0 },
    completedFixtures: { type: Number, default: 0 },
    winner: { type: Object, default: null },
    organizer: { type: Types.ObjectId, ref: 'User', required: true },
    registrationDeadline: { type: Date, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false },
);

const UserModel = mongoose.model('User', UserSchema);
const LocationModel = mongoose.model('Location', LocationSchema);
const TournamentModel = mongoose.model('Tournament', TournamentSchema);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function uniqueCode(): Promise<string> {
  let code = generateCode();
  while (await TournamentModel.findOne({ code })) code = generateCode();
  return code;
}

const DAY = 86_400_000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY);

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const owner = await UserModel.findOne({ email: OWNER_EMAIL });
  if (!owner) throw new Error(`No user found with email ${OWNER_EMAIL}`);

  const location = await LocationModel.findOne({ owner: owner._id });
  if (!location) throw new Error(`User ${OWNER_EMAIL} does not own any location — register one first`);

  console.log(`Owner: ${owner._id} | Location: ${location._id}`);

  const tournamentDefs = [
    {
      name: 'Lagos Summer Knockout Cup',
      description: 'Single-elimination 5-a-side knockout — winner takes the cup.',
      type: 'knockout',
      maxTeams: 8,
      minutesPerMatch: 60,
      playersPerTeam: 5,
      prizeMoney: 150_000,
      registrationFee: 5_000,
      pitches: ['Pitch A', 'Pitch B'],
      teamPrizes: ['₦100,000 cash prize', 'Trophy + medals'],
      playerPrizes: ['MVP award — ₦20,000'],
      rules: ['Single elimination — loser is out', 'Extra time + penalties on a draw'],
      registrationDeadline: daysFromNow(5),
      startDate: daysFromNow(10),
      durationDays: 3,
    },
    {
      name: 'Weekend Warriors League',
      description: 'Round-robin league — every team plays every other team once.',
      type: 'league',
      maxTeams: 6,
      minutesPerMatch: 70,
      playersPerTeam: 6,
      prizeMoney: 200_000,
      registrationFee: 7_500,
      pitches: ['Main Pitch'],
      teamPrizes: ['₦150,000 cash prize', 'League trophy'],
      playerPrizes: ['Top scorer award — ₦25,000'],
      rules: ['3 points for a win, 1 for a draw, 0 for a loss', 'Ranked by points, then goal difference, then goals scored'],
      registrationDeadline: daysFromNow(7),
      startDate: daysFromNow(14),
      durationDays: 21,
    },
    {
      name: 'Champions Knockout Series',
      description: 'High-stakes 16-team single-elimination knockout.',
      type: 'knockout',
      maxTeams: 16,
      minutesPerMatch: 90,
      playersPerTeam: 7,
      prizeMoney: 500_000,
      registrationFee: 10_000,
      pitches: ['Pitch A', 'Pitch B', 'Pitch C'],
      teamPrizes: ['₦350,000 cash prize', 'Champions trophy + medals'],
      playerPrizes: ['MVP award — ₦40,000', 'Golden boot — ₦30,000'],
      rules: ['Single elimination — loser is out', 'Extra time + penalties on a draw', 'Each team must register at least 7 players'],
      registrationDeadline: daysFromNow(14),
      startDate: daysFromNow(25),
      durationDays: 5,
    },
    {
      name: 'Community Friendly League',
      description: 'Casual round-robin league for the local community — all skill levels welcome.',
      type: 'league',
      maxTeams: 5,
      minutesPerMatch: 50,
      playersPerTeam: 5,
      prizeMoney: 50_000,
      registrationFee: 2_000,
      pitches: ['Pitch B'],
      teamPrizes: ['₦40,000 cash prize'],
      playerPrizes: [],
      rules: ['3 points for a win, 1 for a draw, 0 for a loss', 'Friendly conduct expected — no slide tackles'],
      registrationDeadline: daysFromNow(3),
      startDate: daysFromNow(8),
      durationDays: 14,
    },
  ];

  const created: any[] = [];
  for (const def of tournamentDefs) {
    const { durationDays, ...rest } = def;
    const tournament = await TournamentModel.create({
      ...rest,
      location: location._id,
      organizer: owner._id,
      code: await uniqueCode(),
      status: 'registration',
      endDate: new Date(rest.startDate.getTime() + durationDays * DAY),
    });
    created.push(tournament);
    console.log(`Created [${tournament.type}] "${tournament.name}" — code ${tournament.code} (${tournament._id})`);
  }

  console.log(`\n✅ Seeded ${created.length} tournaments for ${OWNER_EMAIL}`);
  console.log('  Location ID :', location._id.toString());
  console.log('  Organizer ID:', owner._id.toString());

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
