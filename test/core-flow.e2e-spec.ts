import { Types } from 'mongoose';
import { authCookie, createE2eTestApp, E2eTestApp } from './helpers/e2e-app';
import {
  LOCATION_PRICING_OPTION,
  LOCATION_TIER,
  PLAYER_POSITION,
} from '@app/common';
import { PaymentStatus } from '@app/common/schemas/session-payment.schema';

describe('Core backend flow (e2e)', () => {
  let ctx: E2eTestApp;

  beforeAll(async () => {
    ctx = await createE2eTestApp();
  });

  beforeEach(async () => {
    await ctx.cleanDatabase();
    await ctx.flushRedis();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  const registerUser = async (overrides: Record<string, any> = {}) => {
    const suffix = new Types.ObjectId().toString();
    const body = {
      firstName: 'Test',
      lastName: 'User',
      nickname: `user_${suffix}`,
      email: `user_${suffix}@example.com`,
      password: 'Password123!',
      phoneNumber: `080${suffix.slice(-8)}`,
      address: '1 Test Street',
      position: PLAYER_POSITION.MIDFIELDER,
      location: { type: 'Point', coordinates: [3.3792, 6.5244] },
      height: 180,
      dateOfBirth: '1995-01-01T00:00:00.000Z',
      isOwner: false,
      ...overrides,
    };

    const response = await ctx.agent
      .post('/i-one/user/register')
      .send(body)
      .expect(201);
    return { body, user: response.body };
  };

  const login = async (email: string, password = 'Password123!') => {
    const response = await ctx.agent
      .post('/i-one/auth/user/login')
      .send({ email, password })
      .expect(201);

    const cookie = authCookie(response);
    expect(cookie.join(';')).toContain('Authentication=');
    return cookie;
  };

  it('registers, logs in, and reads the authenticated profile', async () => {
    const { body, user } = await registerUser({
      firstName: 'Ada',
      email: 'ada@example.com',
      nickname: 'ada',
      phoneNumber: '08012345678',
    });

    expect(user.email).toBe('ada@example.com');
    expect(user.password).not.toBe(body.password);

    const cookie = await login(body.email);

    const profile = await ctx.agent
      .get('/i-one/user/profile')
      .set('Cookie', cookie)
      .expect(200);

    expect(profile.body).toEqual(
      expect.objectContaining({
        _id: user._id,
        email: 'ada@example.com',
        password: '',
      }),
    );
  });

  it('runs owner location, paid session, checkout, sets, and matchup flow', async () => {
    const ownerRegistration = await registerUser({
      firstName: 'Owner',
      nickname: 'owner',
      email: 'owner@example.com',
      phoneNumber: '08011111111',
      isOwner: true,
    });
    const playerRegistration = await registerUser({
      firstName: 'Player',
      nickname: 'player',
      email: 'player@example.com',
      phoneNumber: '08022222222',
    });

    const ownerCookie = await login(ownerRegistration.body.email);
    const playerCookie = await login(playerRegistration.body.email);

    const locationResponse = await ctx.agent
      .post('/i-one/location/register')
      .set('Cookie', ownerCookie)
      .send({
        openingHour: '08:00',
        closingHour: '22:00',
        name: 'Test Arena',
        address: '2 Test Road',
        tier: LOCATION_TIER.PAID,
        pricingOption: LOCATION_PRICING_OPTION.HOURLY,
        paymentPerPersonHourly: 2500,
        pitchPhoto: 'https://example.test/pitch.jpg',
        location: { type: 'Point', coordinates: [3.3792, 6.5244] },
      })
      .expect(201);

    await ctx.connection.collection('verifications').insertOne({
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(ownerRegistration.user._id),
      idType: 'NIN',
      idNumber: '12345678901',
      address: '2 Test Road',
      frontUrl: 'https://example.test/front.jpg',
      backUrl: 'https://example.test/back.jpg',
      locationPictures: ['https://example.test/location.jpg'],
      status: 'APPROVED',
      rejectionReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const startResponse = await ctx.agent
      .post('/i-one/sessions/start')
      .set('Cookie', ownerCookie)
      .send({ locationId: locationResponse.body._id })
      .expect(201);

    const startTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const createSessionResponse = await ctx.agent
      .post(`/i-one/sessions/create/${startResponse.body._id}`)
      .set('Cookie', ownerCookie)
      .send({
        setNumber: 2,
        playersPerTeam: 1,
        timeDuration: 60,
        minsPerSet: 10,
        startTime,
        winningDecider: 'penalties',
      })
      .expect(201);

    expect(createSessionResponse.body).toEqual(
      expect.objectContaining({
        paymentRequired: true,
        paymentAmount: 2500,
        maxNumber: 2,
      }),
    );

    await ctx.agent
      .post(`/i-one/sessions/join/${startResponse.body._id}`)
      .set('Cookie', playerCookie)
      .expect(201);

    const checkoutResponse = await ctx.agent
      .post(`/i-one/wallet/session/${startResponse.body._id}/pay`)
      .set('Cookie', playerCookie)
      .expect(201);

    expect(checkoutResponse.body).toEqual(
      expect.objectContaining({
        authorizationUrl: expect.stringContaining(
          'https://paystack.test/checkout/',
        ),
        amount: 2500,
      }),
    );

    await ctx.connection.collection('sessionpayments').updateMany(
      { sessionId: new Types.ObjectId(startResponse.body._id) },
      {
        $set: {
          status: PaymentStatus.PAID,
          paidAt: new Date(),
        },
      },
    );
    await ctx.connection.collection('sessions').updateOne(
      { _id: new Types.ObjectId(startResponse.body._id) },
      {
        $set: {
          paymentStatus: 'COMPLETED',
          allPaymentsCompleted: true,
        },
      },
    );

    const setsResponse = await ctx.agent
      .post(`/i-one/sets/create/${startResponse.body._id}`)
      .set('Cookie', ownerCookie)
      .expect(201);

    expect(setsResponse.body.sets).toHaveLength(2);

    const matchupResponse = await ctx.agent
      .post(`/i-one/matches/matchup/${startResponse.body._id}`)
      .set('Cookie', ownerCookie)
      .expect(201);

    expect(matchupResponse.body).toHaveLength(1);
    expect(matchupResponse.body[0]).toEqual(
      expect.objectContaining({
        session: startResponse.body._id,
        matchType: 'friendly',
      }),
    );

    const matchId = matchupResponse.body[0]._id;
    await ctx.agent
      .post(`/i-one/matches/start/${matchId}`)
      .set('Cookie', ownerCookie)
      .expect(201);

    const incrementResponse = await ctx.agent
      .put(`/i-one/matches/increment-score/${matchId}`)
      .query({ team: 'teamOne' })
      .set('Cookie', ownerCookie)
      .expect(200);

    expect(incrementResponse.body.teamOneScore).toBe(1);
  });
});
