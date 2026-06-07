import 'dotenv/config';
import { UserSchema, User, PLAYER_POSITION } from '@app/common';
import { faker } from '@faker-js/faker'
import mongoose, { model, Model, Mongoose } from 'mongoose';

const userModel = model<User>('User', UserSchema)

export const userSeeder = (): Partial<User> => {
  return {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    email: faker.internet.email(),
    nickname: faker.internet.userName(),
    password: "12345",
    address: faker.location.streetAddress(),
    phoneNumber: `+234${faker.string.numeric(10)}`,
    position: PLAYER_POSITION.MIDFIELDER,
    location: {
      type: 'Point',
      coordinates: [3.5977, 6.4525],
    },
  };
};

export const populateDb = async (): Promise<any> => {
try{
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not set in the environment');
  }
  await mongoose.connect(mongoUri);
    const users = Array.from({ length: 15 }, userSeeder);
    await userModel.insertMany(users);
}catch(error: any){
   console.error('Seeding failed:', error);

}finally{
    mongoose.disconnect()
}
};

