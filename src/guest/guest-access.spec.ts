import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Types } from 'mongoose';
import request from 'supertest';
import { AwsService } from '@app/common/providers/aws.service';
import { UsersJwtStrategy } from 'src/auth/strategy/jwt.strategy';
import { UsersService } from 'src/users/users.service';
import { TournamentsController } from 'src/tournaments/tournaments.controller';
import { TournamentsService } from 'src/tournaments/tournaments.service';
import { TournamentEventService } from 'src/tournaments/tournament-event.service';
import { TournamentPaymentService } from 'src/billing/services/tournament-payment.service';
import { SessionsController } from 'src/sessions/sessions.controller';
import { SessionsService } from 'src/sessions/sessions.service';
import { SessionPaymentService } from 'src/billing/services/session-payment.service';
import { SessionPaymentEventService } from 'src/billing/services/session-payment-event.service';
import { LocationsController } from 'src/locations/locations.controller';
import { LocationsService } from 'src/locations/locations.service';

// Over real HTTP: the real controllers, JwtAuthGuard, JWT strategy and cookie
// parsing, with the services stubbed. Proves which routes guests can reach,
// what they get back, and that everything else still needs a sign-in.
const SECRET = 'test-secret';

const person = () => ({ _id: new Types.ObjectId(), firstName: 'Ada', nickname: 'ada9', email: 'ada@example.com', phoneNumber: '+234800' });
const pitch = { _id: new Types.ObjectId(), name: 'Ikoyi Turf', address: '5 Pitch Rd', owner: person(), pricePerHour: 2_000_000 };
const tournament = { _id: new Types.ObjectId(), name: 'Lagos Cup', organizer: person(), registeredTeams: [{ name: 'Lions', captain: person() }] };
const session = { _id: new Types.ObjectId(), location: pitch, members: [person(), person()], captain: person(), maxNumber: 10 };

describe('guest access over HTTP', () => {
  let app: INestApplication;
  let cookie: string;
  const signedIn = { _id: new Types.ObjectId(), role: 'user', emailVerified: true };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TournamentsController, SessionsController, LocationsController],
      providers: [
        UsersJwtStrategy,
        { provide: ConfigService, useValue: { get: () => SECRET } },
        { provide: UsersService, useValue: { getProfile: jest.fn().mockResolvedValue(signedIn) } },
        {
          provide: TournamentsService,
          useValue: {
            findOne: jest.fn().mockResolvedValue(tournament),
            listPublic: jest.fn().mockResolvedValue({ tournaments: [tournament], pagination: { page: 1, total: 1 } }),
            findByCode: jest.fn().mockResolvedValue(tournament),
          },
        },
        { provide: TournamentEventService, useValue: {} },
        { provide: TournamentPaymentService, useValue: {} },
        {
          provide: SessionsService,
          useValue: {
            viewSession: jest.fn().mockResolvedValue(session),
            getMyCurrentSession: jest.fn().mockResolvedValue(session),
          },
        },
        { provide: SessionPaymentService, useValue: {} },
        { provide: SessionPaymentEventService, useValue: {} },
        {
          provide: LocationsService,
          useValue: {
            viewNearbyLocations: jest.fn().mockResolvedValue([pitch]),
            viewLocation: jest.fn().mockResolvedValue(pitch),
          },
        },
        { provide: AwsService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    cookie = `Authentication=${new JwtService({ secret: SECRET }).sign({ userId: signedIn._id.toString() })}`;
  });

  afterAll(() => app.close());

  const leaks = (body: unknown) => /firstName|nickname|email|phoneNumber|organizer|captain|members|owner/.test(JSON.stringify(body));

  it.each([
    ['/tournaments'],
    [`/tournaments/${tournament._id}`],
    [`/sessions/${session._id}`],
    ['/location/nearby?lng=3.4&lat=6.4'],
    [`/location/${pitch._id}`],
  ])('guest GET %s → 200 with no personal fields', async (path) => {
    const res = await request(app.getHttpServer()).get(path);
    expect(res.status).toBe(200);
    expect(leaks(res.body)).toBe(false);
  });

  it('guest session shows counts, not people', async () => {
    const res = await request(app.getHttpServer()).get(`/sessions/${session._id}`);
    expect(res.body).toMatchObject({ memberCount: 2, spotsLeft: 8, location: { name: 'Ikoyi Turf' } });
  });

  it('a bad token on a guest route is treated as a guest, not a 401', async () => {
    const res = await request(app.getHttpServer()).get(`/tournaments/${tournament._id}`).set('Cookie', 'Authentication=garbage');
    expect(res.status).toBe(200);
    expect(leaks(res.body)).toBe(false);
  });

  it('signed-in users still get the full payload', async () => {
    const res = await request(app.getHttpServer()).get(`/tournaments/${tournament._id}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.organizer).toMatchObject({ firstName: 'Ada' });
  });

  it.each([
    ['get', '/tournaments/code/LAGOS1'],
    ['get', '/sessions/my-current'],
    ['get', `/sessions/members/${session._id}`],
    ['post', `/sessions/join/${session._id}`],
    ['post', `/tournaments/${tournament._id}/team`],
    ['get', '/location/all'],
  ] as const)('guest %s %s → 401', async (method, path) => {
    const res = await request(app.getHttpServer())[method](path);
    expect(res.status).toBe(401);
  });
});
