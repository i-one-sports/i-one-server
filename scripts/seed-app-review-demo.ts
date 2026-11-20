import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import mongoose, { Model, Types } from 'mongoose';
import {
  Location, LocationSchema, LOCATION_STATUS, LOCATION_TIER, Match, MatchSchema, MATCH_STATUS, MATCH_TYPE,
  OWNER_ONBOARDING_STATUS, PLAYER_POSITION, Session, SessionSchema, SESSION_PAYMENT_MODE, SESSION_STATUS,
  Team, TeamSchema, Tournament, TournamentSchema, TournamentStatus, TournamentType, User, UserSchema, USER_ROLE,
} from '@app/common';
import { Set as TeamSet, SetSchema } from '@app/common/schemas/sets.schema';
import { Stat, StatSchema } from '@app/common/schemas/stats.schema';

const DOMAIN = 'i-one-test.com'; // a real TLD: Paystack rejects reserved ones like .test
const DEMO_EMAIL = process.env.APP_REVIEW_DEMO_EMAIL ?? `appreview.demo@${DOMAIN}`;
const OWNER_EMAIL = `appreview.owner@${DOMAIN}`;
const SQUAD_SIZE = 9;
const PITCH_NAME = 'i-One Demo Arena';
const TOURNAMENT_CODE = 'APPREVIEW';
const LEKKI: [number, number] = [3.4746, 6.4474]; // lng, lat

const args = new Set(process.argv.slice(2));
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// 17:00 Lagos time (UTC+1, no DST), `days` from today.
const lagosAt = (days: number, hour: number) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(hour - 1, 0, 0, 0);
  return d;
};

const randomPassword = () => randomBytes(18).toString('base64url');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  const password = process.env.APP_REVIEW_DEMO_PASSWORD ?? '';
  if (password.length < 8) throw new Error('Set APP_REVIEW_DEMO_PASSWORD (8+ characters) — it is never stored in the repo');

  const host = new URL(uri.replace(/^mongodb(\+srv)?:/, 'http:')).hostname;
  const local = ['localhost', '127.0.0.1'].includes(host);
  console.log(`Target database host: ${host}`);
  if (!local && !args.has('--yes')) {
    throw new Error(`Refusing to write to ${host} without --yes`);
  }

  await mongoose.connect(uri);
  const db = {
    user: mongoose.model<User>('User', UserSchema),
    location: mongoose.model<Location>('Location', LocationSchema),
    session: mongoose.model<Session>('Session', SessionSchema),
    set: mongoose.model<TeamSet>('Set', SetSchema),
    match: mongoose.model<Match>('Match', MatchSchema),
    tournament: mongoose.model<Tournament>('Tournament', TournamentSchema),
    team: mongoose.model<Team>('Team', TeamSchema),
    stat: mongoose.model<Stat>('Stat', StatSchema),
  };

  if (args.has('--throwaway')) {
    const email = `review.delete+${Date.now()}@${DOMAIN}`;
    const id = await upsertUser(db.user, email, password, { firstName: 'Review', lastName: 'Delete', nickname: `review_delete_${Date.now() % 100000}` });
    await ensureStat(db.stat, id, 0, 0, 0);
    console.log(`\nThrowaway account for the deletion recording:\n  email:    ${email}\n  password: (APP_REVIEW_DEMO_PASSWORD)`);
    return;
  }

  // ── People ───────────────────────────────────────────────────────────────
  const demo = await upsertUser(db.user, DEMO_EMAIL, password, {
    firstName: 'Alex', lastName: 'Review', nickname: 'alex_review', position: PLAYER_POSITION.MIDFIELDER,
  });
  const owner = await upsertUser(db.user, OWNER_EMAIL, randomPassword(), {
    firstName: 'Demo', lastName: 'Owner', nickname: 'demo_owner', isOwner: true, role: USER_ROLE.ADMIN,
    ownerOnboardingStatus: OWNER_ONBOARDING_STATUS.APPROVED,
  });
  const squad: Types.ObjectId[] = [];
  const positions = [PLAYER_POSITION.STRIKER, PLAYER_POSITION.MIDFIELDER, PLAYER_POSITION.DEFENDER];
  for (let i = 1; i <= SQUAD_SIZE; i++) {
    squad.push(
      await upsertUser(db.user, `appreview.player${i}@${DOMAIN}`, randomPassword(), {
        firstName: ['Tunde', 'Emeka', 'Ngozi', 'Femi', 'Kola', 'Uche', 'Bisi', 'Chidi', 'Sade'][i - 1],
        lastName: 'Demo', nickname: `demo_player_${i}`, position: positions[i % 3],
      }),
    );
  }

  // ── Pitch (free, so joining needs no payment) ──────────────────────────
  const pitch = await db.location.findOneAndUpdate(
    { name: PITCH_NAME, owner },
    {
      $set: {
        name: PITCH_NAME, nameLower: PITCH_NAME.toLowerCase(), address: 'Admiralty Way, Lekki Phase 1, Lagos',
        owner, tier: LOCATION_TIER.FREE, status: LOCATION_STATUS.ACTIVE, openingHour: '06:00', closingHour: '23:00',
        friendly: true, tournament: true, pitchSize: '5-a-side', pitchMax: '10',
        location: { type: 'Point', coordinates: LEKKI },
      },
      $setOnInsert: { _id: new Types.ObjectId() },
    },
    { upsert: true, new: true, lean: true },
  );
  if (!pitch) throw new Error('Pitch upsert failed');

  // ── Sessions: rebuilt with fresh dates every run ───────────────────────
  const old = await db.session.find({ location: pitch._id }).select('_id').lean();
  const oldIds = old.map((s) => s._id);
  await Promise.all([
    db.match.deleteMany({ session: { $in: oldIds } }),
    db.set.deleteMany({ session: { $in: oldIds } }),
    db.session.deleteMany({ _id: { $in: oldIds } }),
  ]);
  await db.user.updateMany({ _id: { $in: [demo, ...squad] } }, { $set: { currentSession: null } });

  // Open session tomorrow 17:00–19:00. The demo player isn't in it, so the
  // reviewer can join.
  const openMembers = squad.slice(0, 6);
  const open = await db.session.create({
    _id: new Types.ObjectId(),
    location: pitch._id, captain: openMembers[0], members: openMembers,
    playersPerTeam: 5, setNumber: 2, minsPerSet: 60, timeDuration: 120,
    startTime: lagosAt(1, 17), stopTime: lagosAt(1, 19),
    maxNumber: 10, isFull: false, matchType: MATCH_TYPE.FRIENDLY, status: SESSION_STATUS.OPEN,
    paymentRequired: false, paymentAmount: 0, paymentMode: SESSION_PAYMENT_MODE.POOL, paymentTarget: 0,
    paymentStatus: 'COMPLETED', allPaymentsCompleted: true, inProgress: false, finished: false,
  });
  await db.user.updateMany({ _id: { $in: openMembers } }, { $set: { currentSession: open._id } });

  // A game played 3 days ago that the demo player was in (they scored twice).
  const pastMembers = [demo, ...squad.slice(0, 9)];
  const past = await db.session.create({
    _id: new Types.ObjectId(),
    location: pitch._id, captain: demo, members: pastMembers,
    playersPerTeam: 5, setNumber: 1, minsPerSet: 60, timeDuration: 60,
    startTime: lagosAt(-3, 18), stopTime: lagosAt(-3, 19),
    maxNumber: 10, isFull: true, matchType: MATCH_TYPE.FRIENDLY, status: SESSION_STATUS.COMPLETED,
    paymentRequired: false, paymentAmount: 0, paymentMode: SESSION_PAYMENT_MODE.POOL, paymentTarget: 0,
    paymentStatus: 'COMPLETED', allPaymentsCompleted: true, inProgress: false, finished: true,
  });
  const blue = await db.set.create({ _id: new Types.ObjectId(), session: past._id, name: 'Team Blue', players: pastMembers.slice(0, 5) });
  const red = await db.set.create({ _id: new Types.ObjectId(), session: past._id, name: 'Team Red', players: pastMembers.slice(5) });
  await db.match.create({
    _id: new Types.ObjectId(),
    session: past._id, teamOne: blue._id, teamTwo: red._id, sequence: 1,
    teamOneScore: 3, teamTwoScore: 2, isStarted: true, status: MATCH_STATUS.FINISHED, matchType: MATCH_TYPE.FRIENDLY,
    startedAt: lagosAt(-3, 18), endedAt: lagosAt(-3, 19), winner: blue._id,
    goalScorers: [
      { player: demo, team: 'teamOne', assistedBy: squad[0] },
      { player: squad[0], team: 'teamOne', assistedBy: demo },
      { player: demo, team: 'teamOne' },
      { player: squad[5], team: 'teamTwo' },
      { player: squad[6], team: 'teamTwo' },
    ],
  });
  await ensureStat(db.stat, demo, 1, 2, 1);

  // ── Tournament in registration, two teams in ───────────────────────────
  const tournament = await db.tournament.findOneAndUpdate(
    { code: TOURNAMENT_CODE },
    {
      $set: {
        name: 'i-One Demo Cup', description: 'Five-a-side knockout at the Demo Arena.', code: TOURNAMENT_CODE,
        location: pitch._id, organizer: owner, status: TournamentStatus.REGISTRATION, type: TournamentType.KNOCKOUT,
        maxTeams: 8, playersPerTeam: 5, minutesPerMatch: 40, registrationFee: 0, prizeMoney: 10_000_000,
        teamPrizes: ['Trophy and medals for the winners'], rules: ['Five-a-side, rolling substitutes'],
        registrationDeadline: lagosAt(5, 23), startDate: lagosAt(7, 10), endDate: lagosAt(8, 10),
        bracket: [], fixtures: [], standings: [], winner: null,
      },
      $setOnInsert: { _id: new Types.ObjectId() },
    },
    { upsert: true, new: true, lean: true },
  );
  if (!tournament) throw new Error('Tournament upsert failed');
  const teamIds: Types.ObjectId[] = [];
  for (const [i, name] of ['Lekki Lions', 'Ikoyi Eagles'].entries()) {
    const players = squad.slice(i * 4, i * 4 + 4);
    const team = await db.team.findOneAndUpdate(
      { code: `${TOURNAMENT_CODE}-${i + 1}` },
      {
        $set: { name, players, captain: players[0], code: `${TOURNAMENT_CODE}-${i + 1}`, tournamentId: tournament._id, city: 'Lagos', country: 'Nigeria' },
        $setOnInsert: { _id: new Types.ObjectId() },
      },
      { upsert: true, new: true, lean: true },
    );
    if (team) teamIds.push(team._id);
  }
  await db.tournament.updateOne({ _id: tournament._id }, { $set: { registeredTeams: teamIds } });

  console.log(`
App Review demo ready.
  Login:       ${DEMO_EMAIL}  /  (APP_REVIEW_DEMO_PASSWORD)
  Pitch:       ${PITCH_NAME} (${pitch._id}) — free, Lekki, Lagos
  Open session ${open._id}: tomorrow 17:00–19:00 Lagos, 6/10 players — the reviewer can join
  Past game    ${past._id}: 3 days ago, Team Blue 3–2, demo player scored 2
  Tournament   i-One Demo Cup (${TOURNAMENT_CODE}), registration open, 2 teams
  No wallet history is seeded (real-money ledger).`);
}

async function upsertUser(
  users: Model<User>,
  email: string,
  password: string,
  profile: Partial<User>,
): Promise<Types.ObjectId> {
  const user = await users.findOneAndUpdate(
    { email },
    {
      $set: {
        email, password: await bcrypt.hash(password, 10), emailVerified: true, deletedAt: null, currentSession: null,
        isOwner: false, role: USER_ROLE.USER, address: 'Lekki Phase 1, Lagos',
        location: { type: 'Point', coordinates: LEKKI }, ...profile,
      },
      $setOnInsert: { _id: new Types.ObjectId() },
    },
    { upsert: true, new: true, lean: true },
  );
  if (!user) throw new Error(`User upsert failed: ${email}`);
  return user._id;
}

async function ensureStat(stats: Model<Stat>, userId: Types.ObjectId, totalMatches: number, goals: number, assists: number) {
  const year = new Date().getFullYear();
  await stats.updateOne(
    { userId },
    { $set: { totalMatches, goals, assists, seasonStart: year, seasonEnd: year + 1 }, $setOnInsert: { _id: new Types.ObjectId() } },
    { upsert: true },
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
