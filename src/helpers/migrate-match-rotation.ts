// One-off backfill for match rotation and referees (see
// libs/common/src/schemas/match.schema.ts, src/matches/rotation.service.ts and
// src/matches/match-referee.service.ts). RUN BEFORE DEPLOYING — the new code
// reads `status` instead of `isStarted`, and validates `winningDecider`
// against WINNING_DECIDER on save.
//
//   npm run migrate:match-rotation
//
// Safe to re-run: every step only touches documents still missing the field.
//
// Deliberately does NOT set `waiting` on old matches. endMatch only creates a
// next game for matches that have a queue, so sessions matched under the old
// "pair everyone at once" rule keep exactly the matches they already have.
import 'dotenv/config';
import mongoose, { model } from 'mongoose';
import { MatchSchema, Match } from '@app/common/schemas/match.schema';
import { SessionSchema, Session } from '@app/common/schemas/session.schema';
import { MATCH_RESULT_STATUS, MATCH_STATUS, WINNING_DECIDER } from '@app/common/types/common';

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  throw new Error('MONGODB_URI is not set in the environment');
}

const MatchModel = model<Match>('Match', MatchSchema);
const SessionModel = model<Session>('Session', SessionSchema);

async function migrate() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // 1. winningDecider was free text (the API docs even sent "PENALTY", while
    //    the stored enum value is 'penalties'). Anything unrecognised — or
    //    missing — becomes penalties, which was the only behaviour that existed.
    const deciderResult = await SessionModel.updateMany(
      { winningDecider: { $nin: Object.values(WINNING_DECIDER) } },
      { $set: { winningDecider: WINNING_DECIDER.PENALTY } },
    );
    console.log(`Sessions with winningDecider reset to penalties: ${deciderResult.modifiedCount}`);

    // 2. status from the old isStarted flag. A finished match and an unstarted
    //    one both had isStarted: false; a non-zero score is the only signal
    //    that it was actually played.
    const noStatus = { status: { $exists: false } };
    const live = await MatchModel.updateMany(
      { ...noStatus, isStarted: true },
      { $set: { status: MATCH_STATUS.LIVE } },
    );
    const finished = await MatchModel.updateMany(
      { ...noStatus, $or: [{ teamOneScore: { $gt: 0 } }, { teamTwoScore: { $gt: 0 } }] },
      { $set: { status: MATCH_STATUS.FINISHED } },
    );
    const scheduled = await MatchModel.updateMany(noStatus, { $set: { status: MATCH_STATUS.SCHEDULED } });
    console.log(
      `Match status — LIVE: ${live.modifiedCount}, FINISHED: ${finished.modifiedCount}, SCHEDULED: ${scheduled.modifiedCount}`,
    );

    // 3. No match before this release had a referee, so no finished result
    //    may feed stats. Live ones get their resultStatus when they end.
    const unofficial = await MatchModel.updateMany(
      { status: MATCH_STATUS.FINISHED, resultStatus: { $exists: false } },
      { $set: { resultStatus: MATCH_RESULT_STATUS.UNOFFICIAL } },
    );
    console.log(`Finished matches marked UNOFFICIAL: ${unofficial.modifiedCount}`);

    // 4. sequence, in creation order within each session, continuing after
    //    any number already taken so the unique {session, sequence} index holds.
    const sessionIds = await MatchModel.distinct('session', { sequence: { $exists: false } });
    let numbered = 0;
    for (const sessionId of sessionIds) {
      const [{ max = 0 } = {}] = await MatchModel.aggregate([
        { $match: { session: sessionId, sequence: { $exists: true } } },
        { $group: { _id: null, max: { $max: '$sequence' } } },
      ]);
      const unnumbered = await MatchModel.find({ session: sessionId, sequence: { $exists: false } })
        .sort({ createdAt: 1, _id: 1 })
        .select('_id')
        .lean();

      const ops = unnumbered.map((m, i) => ({
        updateOne: {
          filter: { _id: m._id, sequence: { $exists: false } },
          update: { $set: { sequence: max + i + 1 } },
        },
      }));
      if (ops.length) {
        const res = await MatchModel.bulkWrite(ops);
        numbered += res.modifiedCount;
      }
    }
    console.log(`Matches numbered: ${numbered} across ${sessionIds.length} session(s)`);

    const remainingStatus = await MatchModel.countDocuments(noStatus);
    const remainingSequence = await MatchModel.countDocuments({ sequence: { $exists: false } });
    console.log(`Remaining without status: ${remainingStatus}, without sequence: ${remainingSequence}`);

    // Build the partial unique index now that every match is numbered.
    // createIndexes only adds — unlike syncIndexes it never drops an index.
    await MatchModel.createIndexes();
    console.log('Match indexes ensured. Done.');
  } catch (error: any) {
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

migrate();
