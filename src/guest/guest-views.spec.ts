import { Types } from 'mongoose';
import { toGuestMatch, toGuestPitch, toGuestSession, toGuestSessionList, toGuestStreamEvent, toGuestTournament } from './guest-views';

// Keys that identify or describe a person. None may appear anywhere in a
// guest response, at any depth.
const PERSONAL_KEYS = [
  'firstName', 'lastName', 'nickname', 'avatar', 'email', 'phoneNumber', 'dateOfBirth', 'otp', 'password',
  'members', 'captain', 'owner', 'organizer', 'player', 'players', 'scorer', 'assistedBy', 'referee', 'by',
  'recordedBy', 'userId', 'code', 'amountPaid', 'paymentStatus',
];

function personalKeysIn(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => personalKeysIn(item, `${path}[${i}]`));
  if (typeof value !== 'object' || value === null || value instanceof Date) return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...(PERSONAL_KEYS.includes(key) ? [`${path}.${key}`] : []),
    ...personalKeysIn(child, `${path}.${key}`),
  ]);
}

const person = () => ({
  _id: new Types.ObjectId(),
  firstName: 'Ada',
  lastName: 'Obi',
  nickname: 'ada9',
  avatar: 'https://cdn/ada.png',
  email: 'ada@example.com',
  phoneNumber: '+2348000000000',
  dateOfBirth: new Date('2001-01-01'),
  address: '1 Home St',
  otp: 123456,
});

const pitch = () => ({
  _id: new Types.ObjectId(),
  name: 'Ikoyi Turf',
  address: '5 Pitch Rd, Ikoyi',
  location: { type: 'Point', coordinates: [3.43, 6.45] },
  owner: person(),
  tier: 'paid',
  pricingOption: 'hourly',
  pricePerHour: 2_000_000,
  openingHour: '08:00',
  closingHour: '22:00',
  friendly: true,
  tournament: true,
  bookingVersion: 4,
});

const team = () => ({ _id: new Types.ObjectId(), name: 'Team Blue', players: [person(), person()] });

describe('guest views', () => {
  it('pitch: keeps listing details and price, drops the owner', () => {
    const view = toGuestPitch(pitch());
    expect(view).toMatchObject({ name: 'Ikoyi Turf', address: '5 Pitch Rd, Ikoyi', pricePerHour: 2_000_000, coordinates: [3.43, 6.45] });
    expect(personalKeysIn(view)).toEqual([]);
    expect(view).not.toHaveProperty('bookingVersion');
  });

  it('session: counts and spots left instead of the member list', () => {
    const session = {
      _id: new Types.ObjectId(),
      location: pitch(),
      captain: person(),
      members: [person(), person(), person()],
      maxNumber: 10,
      startTime: new Date('2026-11-21T17:00:00Z'),
      paymentRequired: true,
      paymentMode: 'POOL',
      paymentTarget: 2_000_000,
      amountPaid: 500_000,
      paymentStatus: 'PENDING',
    };
    const view = toGuestSession(session);
    expect(view).toMatchObject({ memberCount: 3, spotsLeft: 7, maxNumber: 10, paymentTarget: 2_000_000 });
    expect(view.location).toMatchObject({ name: 'Ikoyi Turf' });
    expect(personalKeysIn(view)).toEqual([]);

    const page = toGuestSessionList({ sessions: [session], pagination: { page: 1, total: 1 } });
    expect(page.pagination).toEqual({ page: 1, total: 1 });
    expect(personalKeysIn(page)).toEqual([]);
  });

  it('session: an unpopulated location stays an id', () => {
    const locationId = new Types.ObjectId();
    expect(toGuestSession({ location: locationId, members: [] }).location).toBe(locationId.toString());
  });

  it('match: team names and scores, goals without the scorer', () => {
    const match = {
      _id: new Types.ObjectId(),
      teamOne: team(),
      teamTwo: team(),
      teamOneScore: 2,
      teamTwoScore: 1,
      referee: new Types.ObjectId(),
      waiting: [new Types.ObjectId()],
      goalScorers: [{ player: person(), assistedBy: person(), team: 'teamOne', recordedAt: new Date(), recordedBy: new Types.ObjectId() }],
      events: [{ scorer: new Types.ObjectId(), recordedByUser: new Types.ObjectId() }],
      session: { _id: new Types.ObjectId(), startTime: new Date(), members: [person()], location: pitch() },
    };
    const view = toGuestMatch(match);
    expect(view).toMatchObject({ teamOneScore: 2, teamTwoScore: 1, teamOne: { name: 'Team Blue', playerCount: 2 } });
    expect(view.goals).toEqual([{ team: 'teamOne', at: expect.any(Date) }]);
    expect(personalKeysIn(view)).toEqual([]);
  });

  it('tournament: teams, bracket and table without organiser, captains or codes', () => {
    const slot = { teamId: new Types.ObjectId(), name: 'Lions', logo: 'lions.png' };
    const tournament = {
      _id: new Types.ObjectId(),
      name: 'Lagos Cup',
      code: 'LAGOS1',
      organizer: person(),
      location: pitch(),
      registeredTeams: [{ _id: new Types.ObjectId(), name: 'Lions', logo: 'lions.png', captain: person(), code: 'SECRET' }],
      bracket: [{ matchIndex: 0, round: 1, roundName: 'Final', home: slot, away: slot, homeScore: 1, awayScore: 0, winner: slot, completed: true }],
      standings: [{ ...slot, played: 1, points: 3 }],
    };
    const view = toGuestTournament(tournament);
    expect(view).toMatchObject({ name: 'Lagos Cup', teamCount: 1, teams: [{ name: 'Lions' }] });
    expect(view.bracket[0]).toMatchObject({ roundName: 'Final', homeScore: 1, winner: { name: 'Lions' } });
    expect(view.standings[0]).toMatchObject({ name: 'Lions', points: 3 });
    expect(personalKeysIn(view)).toEqual([]);
  });

  describe('stream events', () => {
    const teams = { teamOne: { id: 'a', name: 'Blue' }, teamTwo: { id: 'b', name: 'Red' } };

    it('score: keeps the score and which team scored, drops the scorer', () => {
      const view = toGuestStreamEvent({
        type: 'score', matchId: 'm', sessionId: 's', ...teams, teamOneScore: 1, teamTwoScore: 0,
        latestScorer: { player: new Types.ObjectId(), team: 'teamOne' },
      });
      expect(view).toMatchObject({ type: 'score', teamOneScore: 1, latestScorer: { team: 'teamOne' } });
      expect(personalKeysIn(view)).toEqual([]);
    });

    it('match started / finished: no referee anywhere', () => {
      const started = toGuestStreamEvent({ type: 'match_started', matchId: 'm', sessionId: 's', sequence: 1, ...teams, referee: 'r', startedAt: new Date() });
      const finished = toGuestStreamEvent({
        type: 'match_finished', matchId: 'm', sessionId: 's', sequence: 1, ...teams, teamOneScore: 2, teamTwoScore: 2,
        winner: null, decidedBy: 'penalties', resultStatus: 'PENDING',
        next: { matchId: 'n', sequence: 2, ...teams, referee: 'r' },
      });
      expect(personalKeysIn([started, finished])).toEqual([]);
      expect(finished).toMatchObject({ teamOneScore: 2, next: { matchId: 'n' } });
    });

    it('drops events with nothing for a guest', () => {
      expect(toGuestStreamEvent({ type: 'referee_changed', matchId: 'm', sessionId: 's', referee: 'r', by: 'u' })).toBeNull();
    });
  });
});
