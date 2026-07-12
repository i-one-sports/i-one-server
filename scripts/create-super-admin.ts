import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import mongoose, { model, Model, Types } from 'mongoose';
import { User, UserSchema, USER_ROLE } from '@app/common';

const DEFAULT_PHONE_NUMBER = '+2348000000000';

async function createSuperAdmin() {
  const mongoUri = process.env.MONGODB_URI;
  const email = process.env.SUPER_ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const firstName = process.env.SUPER_ADMIN_FIRST_NAME || 'I-One';
  const lastName = process.env.SUPER_ADMIN_LAST_NAME || 'Super Admin';
  const phoneNumber = process.env.SUPER_ADMIN_PHONE_NUMBER || DEFAULT_PHONE_NUMBER;
  const shouldResetPassword = process.env.SUPER_ADMIN_RESET_PASSWORD === 'true';

  if (!mongoUri) {
    throw new Error('MONGODB_URI is not set');
  }

  if (!email) {
    throw new Error('SUPER_ADMIN_EMAIL is not set');
  }

  if (!password) {
    throw new Error('SUPER_ADMIN_PASSWORD is not set');
  }

  await mongoose.connect(mongoUri);

  const UserModel = (mongoose.models.User ||
    model<User>('User', UserSchema)) as Model<User>;

  const existingUser = await UserModel.findOne({ email });
  const passwordHash = await bcrypt.hash(password, 10);

  if (existingUser) {
    const update: Partial<User> = {
      role: USER_ROLE.SUPER_ADMIN,
      emailVerified: true,
      isOwner: false,
    };

    if (shouldResetPassword) update.password = passwordHash;

    await UserModel.updateOne({ email }, { $set: update });

    console.log(
      `Updated existing super admin ${email}. Password reset: ${shouldResetPassword}`,
    );
    return;
  }

  await UserModel.create({
    _id: new Types.ObjectId(),
    firstName,
    lastName,
    email,
    password: passwordHash,
    phoneNumber,
    nickname: 'i-one-super-admin',
    address: 'I-One HQ',
    isOwner: false,
    role: USER_ROLE.SUPER_ADMIN,
    emailVerified: true,
    location: {
      type: 'Point',
      coordinates: [0, 0],
    },
  });

  console.log(`Created super admin ${email}`);
}

createSuperAdmin()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
