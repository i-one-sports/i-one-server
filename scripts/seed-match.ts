/**
 * Seed script: creates 6 users → 1 session → 2 sets → 1 match (score 3-2) for a given locationId
 * Run: npx ts-node -r tsconfig-paths/register scripts/seed-match.ts
 */

import mongoose, { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';

const MONGO_URI =
  'mongodb+srv://afkione:GXYZB1sXiyNLfjoF@i-one.bbgiqi0.mongodb.net/i-one?retryWrites=true&w=majority&appName=i-One';

const LOCATION_ID = new Types.ObjectId('69a85fb8c23b3d324b49a6e3');

// ─── Schemas ─────────────────────────────────────────────────────────────────

const UserSchema = new mongoose.Schema(
  {
    firstName: String,
    lastName: String,
    email: { type: String, unique: true },
    password: String,
    nickname: String,
    position: { type: String, enum: ['DF', 'MF', 'ST'] },
    isOwner: { type: Boolean, default: false },
    role: { type: String, default: 'user' },
    emailVerified: { type: Boolean, default: true },
    location: {
      type: { type: String, default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
  },
  { timestamps: true },
);

const SessionSchema = new mongoose.Schema(
  {
    location: { type: Types.ObjectId, ref: 'Location' },
    playersPerTeam: { type: Number, default: 3 },
    setNumber: { type: Number, default: 2 },
    minsPerSet: { type: Number, default: 15 },
    timeDuration: { type: Number, default: 30 },
    startTime: { type: Date, default: () => new Date() },
    stopTime: { type: Date, default: null },
    winningDecider: { type: String, default: 'penalties' },
    inProgress: { type: Boolean, default: false },
    finished: { type: Boolean, default: true },
    maxNumber: { type: Number, default: 6 },
    isFull: { type: Boolean, default: true },
    matchType: { type: String, default: 'friendly' },
    paymentRequired: { type: Boolean, default: false },
    paymentStatus: { type: String, default: 'NOT_INITIATED' },
    captain: { type: Types.ObjectId, ref: 'User' },
    members: [{ type: Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true, versionKey: false },
);

const SetSchema = new mongoose.Schema(
  {
    session: { type: Types.ObjectId, ref: 'Session' },
    name: String,
    players: [{ type: Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true, versionKey: false },
);

const GoalScorerSchema = new mongoose.Schema(
  {
    player: { type: Types.ObjectId, ref: 'User', required: true },
    team: { type: String, enum: ['teamOne', 'teamTwo'], required: true },
  },
  { _id: false },
);

const MatchSchema = new mongoose.Schema(
  {
    teamOne: { type: Types.ObjectId, ref: 'Set' },
    teamTwo: { type: Types.ObjectId, ref: 'Set' },
    teamOneScore: { type: Number, default: 0 },
    teamTwoScore: { type: Number, default: 0 },
    isStarted: { type: Boolean, default: true },
    session: { type: Types.ObjectId, ref: 'Session' },
    matchType: { type: String, default: 'friendly' },
    goalScorers: { type: [GoalScorerSchema], default: [] },
  },
  { timestamps: true },
);

// ─── Models ───────────────────────────────────────────────────────────────────

const UserModel = mongoose.model('User', UserSchema);
const SessionModel = mongoose.model('Session', SessionSchema);
const SetModel = mongoose.model('Set', SetSchema);
const MatchModel = mongoose.model('Match', MatchSchema);

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const hashedPassword = await bcrypt.hash('Password123!', 10);

  const playerData = [
    { firstName: 'Emeka', lastName: 'Obi',     nickname: 'Striker9',  position: 'ST', email: 'emeka.obi@seed.com' },
    { firstName: 'Tunde', lastName: 'Adewale',  nickname: 'TundeDF',   position: 'DF', email: 'tunde.adewale@seed.com' },
    { firstName: 'Chidi', lastName: 'Nwosu',    nickname: 'ChidiMF',   position: 'MF', email: 'chidi.nwosu@seed.com' },
    { firstName: 'Femi',  lastName: 'Balogun',  nickname: 'FemiBall',  position: 'MF', email: 'femi.balogun@seed.com' },
    { firstName: 'Uche',  lastName: 'Eze',      nickname: 'UcheST',    position: 'ST', email: 'uche.eze@seed.com' },
    { firstName: 'Kola',  lastName: 'Afolabi',  nickname: 'KolaDF',    position: 'DF', email: 'kola.afolabi@seed.com' },
  ];

  // Upsert users (so re-running doesn't fail on unique email)
  const users = await Promise.all(
    playerData.map((p) =>
      UserModel.findOneAndUpdate(
        { email: p.email },
        { ...p, password: hashedPassword },
        { upsert: true, new: true },
      ),
    ),
  );

  const [p1, p2, p3, p4, p5, p6] = users;
  console.log('Users ready:', users.map((u) => `${u.firstName} (${u._id})`).join(', '));

  // Session
  const session = await SessionModel.create({
    location: LOCATION_ID,
    captain: p1._id,
    members: users.map((u) => u._id),
    playersPerTeam: 3,
    setNumber: 2,
    minsPerSet: 15,
    timeDuration: 30,
    startTime: new Date(),
    maxNumber: 6,
    isFull: true,
    finished: true,
    matchType: 'friendly',
  });
  console.log('Session created:', session._id);

  // Sets
  const teamOneSet = await SetModel.create({
    session: session._id,
    name: 'Team Alpha',
    players: [p1._id, p2._id, p3._id],
  });

  const teamTwoSet = await SetModel.create({
    session: session._id,
    name: 'Team Beta',
    players: [p4._id, p5._id, p6._id],
  });
  console.log('Sets created:', teamOneSet._id, teamTwoSet._id);

  // Match — score 3:2, Team Alpha wins
  const match = await MatchModel.create({
    session: session._id,
    teamOne: teamOneSet._id,
    teamTwo: teamTwoSet._id,
    teamOneScore: 3,
    teamTwoScore: 2,
    isStarted: true,
    matchType: 'friendly',
    goalScorers: [
      { player: p1._id, team: 'teamOne' },  // Emeka scores
      { player: p2._id, team: 'teamOne' },  // Tunde scores
      { player: p1._id, team: 'teamOne' },  // Emeka scores again (brace)
      { player: p4._id, team: 'teamTwo' },  // Femi scores
      { player: p5._id, team: 'teamTwo' },  // Uche scores
    ],
  });
  console.log('Match created:', match._id);

  console.log('\n✅ Seed complete!');
  console.log('  Location ID :', LOCATION_ID.toString());
  console.log('  Session ID  :', session._id.toString());
  console.log('  Set 1 ID    :', teamOneSet._id.toString());
  console.log('  Set 2 ID    :', teamTwoSet._id.toString());
  console.log('  Match ID    :', match._id.toString());
  console.log('\nHit: GET /matches/details/' + match._id);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
