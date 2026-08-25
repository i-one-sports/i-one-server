import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import mongoose, { model, Model, Types } from 'mongoose';
import { User, UserSchema, USER_ROLE, PLAYER_POSITION } from '@app/common';

const TEST_PASSWORD = '123456';
const TEST_USER_COUNT = 10;

async function seedTestPlayers() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MONGODB_URI is not set');
  }

  await mongoose.connect(mongoUri);

  const UserModel = (mongoose.models.User ||
    model<User>('User', UserSchema)) as Model<User>;

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const createdEmails: string[] = [];

  for (let i = 1; i <= TEST_USER_COUNT; i++) {
    // .test is a reserved TLD (RFC 2606) — Paystack rejects it as an
    // invalid email, so use a real TLD even though the domain is fake.
    const email = `test.player${i}@i-one-test.com`;

    await UserModel.updateOne(
      { email },
      {
        $set: {
          firstName: 'Test',
          lastName: `Player${i}`,
          email,
          password: passwordHash,
          nickname: `test_player_${i}`,
          phoneNumber: `+23480000001${String(i).padStart(2, '0')}`,
          address: 'I-One Test Address',
          position: PLAYER_POSITION.MIDFIELDER,
          isOwner: false,
          role: USER_ROLE.USER,
          emailVerified: true,
          location: {
            type: 'Point',
            coordinates: [3.5977, 6.4525],
          },
        },
        $setOnInsert: {
          _id: new Types.ObjectId(),
        },
      },
      { upsert: true },
    );

    createdEmails.push(email);
  }

  console.log(`Seeded ${createdEmails.length} test player accounts (password: ${TEST_PASSWORD}):`);
  createdEmails.forEach((email) => console.log(email));
}

seedTestPlayers()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
