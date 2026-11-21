type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj => typeof value === 'object' && value !== null;

const get = (source: unknown, key: string): unknown => (isObj(source) ? source[key] : undefined);

// ObjectId, string, or a populated document → its id as a string.
const idOf = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (isObj(value) && '_id' in value && value._id !== undefined && value._id !== value) return idOf(value._id);
  if (isObj(value) && typeof value.toString === 'function') return value.toString();
  return null;
};

// A populated reference is an object with more than just an id.
const isPopulated = (value: unknown, probe: string): value is Obj => isObj(value) && get(value, probe) !== undefined;

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const bool = (value: unknown): boolean => value === true;
const date = (value: unknown): Date | null => (value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
const count = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

// ─── Pitches ────────────────────────────────────────────────────────────────

export interface GuestPitch {
  _id: string | null;
  name: string | null;
  address: string | null;
  coordinates: number[] | null;
  pitchPhoto: string | null;
  pitchCondition: string | null;
  pitchSize: string | null;
  pitchMax: string | null;
  openingHour: string | null;
  closingHour: string | null;
  tier: string | null;
  pricingOption: string | null;
  pricePerHour: number | null; // kobo
  paymentPerPersonMonthly: number | null; // kobo
  tournamentFee: number | null; // kobo
  friendly: boolean;
  tournament: boolean;
}

export function toGuestPitch(pitch: unknown): GuestPitch {
  const coordinates = get(get(pitch, 'location'), 'coordinates');
  return {
    _id: idOf(get(pitch, '_id')),
    name: str(get(pitch, 'name')),
    address: str(get(pitch, 'address')),
    coordinates: Array.isArray(coordinates) ? coordinates.filter((c): c is number => typeof c === 'number') : null,
    pitchPhoto: str(get(pitch, 'pitchPhoto')),
    pitchCondition: str(get(pitch, 'pitchCondition')),
    pitchSize: str(get(pitch, 'pitchSize')),
    pitchMax: str(get(pitch, 'pitchMax')),
    openingHour: str(get(pitch, 'openingHour')),
    closingHour: str(get(pitch, 'closingHour')),
    tier: str(get(pitch, 'tier')),
    pricingOption: str(get(pitch, 'pricingOption')),
    pricePerHour: num(get(pitch, 'pricePerHour')),
    paymentPerPersonMonthly: num(get(pitch, 'paymentPerPersonMonthly')),
    tournamentFee: num(get(pitch, 'tournamentFee')),
    friendly: bool(get(pitch, 'friendly')),
    tournament: bool(get(pitch, 'tournament')),
  };
}

// A reference to a pitch: the guest view if populated, otherwise its id.
const pitchRef = (value: unknown): GuestPitch | string | null =>
  isPopulated(value, 'name') ? toGuestPitch(value) : idOf(value);

// ─── Sessions ───────────────────────────────────────────────────────────────

export interface GuestSession {
  _id: string | null;
  location: GuestPitch | string | null;
  startTime: Date | null;
  stopTime: Date | null;
  timeDuration: number | null;
  playersPerTeam: number | null;
  matchType: string | null;
  status: string | null;
  inProgress: boolean;
  finished: boolean;
  isFull: boolean;
  maxNumber: number;
  memberCount: number;
  spotsLeft: number;
  // The listed price (kobo) — never who has paid.
  paymentRequired: boolean;
  paymentMode: string | null;
  paymentTarget: number | null;
  paymentAmount: number | null;
  requiresPass: boolean; // monthly pitch: players need a monthly pass to join
}

export function toGuestSession(session: unknown): GuestSession {
  const maxNumber = num(get(session, 'maxNumber')) ?? 0;
  const memberCount = count(get(session, 'members'));
  return {
    _id: idOf(get(session, '_id')),
    location: pitchRef(get(session, 'location')),
    startTime: date(get(session, 'startTime')),
    stopTime: date(get(session, 'stopTime')),
    timeDuration: num(get(session, 'timeDuration')),
    playersPerTeam: num(get(session, 'playersPerTeam')),
    matchType: str(get(session, 'matchType')),
    status: str(get(session, 'status')),
    inProgress: bool(get(session, 'inProgress')),
    finished: bool(get(session, 'finished')),
    isFull: bool(get(session, 'isFull')),
    maxNumber,
    memberCount,
    spotsLeft: Math.max(0, maxNumber - memberCount),
    paymentRequired: bool(get(session, 'paymentRequired')),
    paymentMode: str(get(session, 'paymentMode')),
    paymentTarget: num(get(session, 'paymentTarget')),
    paymentAmount: num(get(session, 'paymentAmount')),
    requiresPass: bool(get(session, 'requiresPass')),
  };
}

export function toGuestSessionList<T extends { sessions: unknown[] }>(
  page: T,
): Omit<T, 'sessions'> & { sessions: GuestSession[] } {
  return { ...page, sessions: page.sessions.map(toGuestSession) };
}

// ─── Matches (live scores) ──────────────────────────────────────────────────

export interface GuestTeam {
  _id: string | null;
  name: string | null;
  playerCount: number;
}

const teamRef = (value: unknown): GuestTeam | string | null =>
  isPopulated(value, 'name')
    ? { _id: idOf(get(value, '_id')), name: str(get(value, 'name')), playerCount: count(get(value, 'players')) }
    : idOf(value);

export interface GuestGoal {
  team: string | null;
  at: Date | null;
}

export interface GuestMatch {
  _id: string | null;
  session: GuestSession | string | null;
  sequence: number | null;
  status: string | null;
  isStarted: boolean;
  matchType: string | null;
  teamOne: GuestTeam | string | null;
  teamTwo: GuestTeam | string | null;
  teamOneScore: number;
  teamTwoScore: number;
  startedAt: Date | null;
  endedAt: Date | null;
  winner: string | null; // team id
  decidedBy: string | null;
  penaltyWinner: string | null;
  goals: GuestGoal[]; // which team scored and when — never who
}

export function toGuestMatch(match: unknown): GuestMatch {
  const session = get(match, 'session');
  const goalScorers = get(match, 'goalScorers');
  return {
    _id: idOf(get(match, '_id')),
    session: isPopulated(session, 'startTime') ? toGuestSession(session) : idOf(session),
    sequence: num(get(match, 'sequence')),
    status: str(get(match, 'status')),
    isStarted: bool(get(match, 'isStarted')),
    matchType: str(get(match, 'matchType')),
    teamOne: teamRef(get(match, 'teamOne')),
    teamTwo: teamRef(get(match, 'teamTwo')),
    teamOneScore: num(get(match, 'teamOneScore')) ?? 0,
    teamTwoScore: num(get(match, 'teamTwoScore')) ?? 0,
    startedAt: date(get(match, 'startedAt')),
    endedAt: date(get(match, 'endedAt')),
    winner: idOf(get(match, 'winner')),
    decidedBy: str(get(match, 'decidedBy')),
    penaltyWinner: str(get(match, 'penaltyWinner')),
    goals: Array.isArray(goalScorers)
      ? goalScorers.map((goal) => ({ team: str(get(goal, 'team')), at: date(get(goal, 'recordedAt')) }))
      : [],
  };
}

// ─── Tournaments ────────────────────────────────────────────────────────────

export interface GuestTeamSlot {
  teamId: string | null;
  name: string | null;
  logo: string | null;
}

const slot = (value: unknown): GuestTeamSlot | null =>
  isObj(value)
    ? { teamId: idOf(get(value, 'teamId')), name: str(get(value, 'name')), logo: str(get(value, 'logo')) }
    : null;

const scheduled = (value: unknown) => ({
  matchIndex: num(get(value, 'matchIndex')),
  round: num(get(value, 'round')),
  home: slot(get(value, 'home')),
  away: slot(get(value, 'away')),
  homeScore: num(get(value, 'homeScore')),
  awayScore: num(get(value, 'awayScore')),
  completed: bool(get(value, 'completed')),
  scheduledTime: date(get(value, 'scheduledTime')),
});

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export function toGuestTournament(tournament: unknown) {
  const teams = get(tournament, 'registeredTeams');
  return {
    _id: idOf(get(tournament, '_id')),
    name: str(get(tournament, 'name')),
    description: str(get(tournament, 'description')),
    location: pitchRef(get(tournament, 'location')),
    status: str(get(tournament, 'status')),
    type: str(get(tournament, 'type')),
    prizeMoney: num(get(tournament, 'prizeMoney')),
    registrationFee: num(get(tournament, 'registrationFee')),
    minutesPerMatch: num(get(tournament, 'minutesPerMatch')),
    playersPerTeam: num(get(tournament, 'playersPerTeam')),
    maxTeams: num(get(tournament, 'maxTeams')),
    pitches: strings(get(tournament, 'pitches')),
    teamPrizes: strings(get(tournament, 'teamPrizes')),
    playerPrizes: strings(get(tournament, 'playerPrizes')),
    rules: strings(get(tournament, 'rules')),
    registrationDeadline: date(get(tournament, 'registrationDeadline')),
    startDate: date(get(tournament, 'startDate')),
    endDate: date(get(tournament, 'endDate')),
    teamCount: count(teams),
    // Team names and logos only (no captain, no join code).
    teams: list(teams)
      .filter((team) => isPopulated(team, 'name'))
      .map((team) => ({ _id: idOf(get(team, '_id')), name: str(get(team, 'name')), logo: str(get(team, 'logo')) })),
    bracket: list(get(tournament, 'bracket')).map((match) => ({
      ...scheduled(match),
      roundName: str(get(match, 'roundName')),
      winner: slot(get(match, 'winner')),
      nextMatchIndex: num(get(match, 'nextMatchIndex')),
      nextMatchSlot: str(get(match, 'nextMatchSlot')),
    })),
    fixtures: list(get(tournament, 'fixtures')).map(scheduled),
    standings: list(get(tournament, 'standings')).map((row) => ({
      ...slot(row),
      played: num(get(row, 'played')),
      wins: num(get(row, 'wins')),
      draws: num(get(row, 'draws')),
      losses: num(get(row, 'losses')),
      goalsFor: num(get(row, 'goalsFor')),
      goalsAgainst: num(get(row, 'goalsAgainst')),
      goalDifference: num(get(row, 'goalDifference')),
      points: num(get(row, 'points')),
    })),
    totalFixtures: num(get(tournament, 'totalFixtures')),
    completedFixtures: num(get(tournament, 'completedFixtures')),
    winner: slot(get(tournament, 'winner')),
  };
}

export type GuestTournament = ReturnType<typeof toGuestTournament>;

// ─── Live-score stream events ───────────────────────────────────────────────

const teamName = (value: unknown) => ({ id: idOf(get(value, 'id')), name: str(get(value, 'name')) });

// Score and lifecycle events with the people taken out (scorer, referee,
// who changed what). Returns null for events with nothing for a guest
// (e.g. referee_changed), which the stream drops.
export function toGuestStreamEvent(event: unknown): Obj | null {
  const type = str(get(event, 'type'));
  const base = {
    type,
    matchId: idOf(get(event, 'matchId')),
    sessionId: idOf(get(event, 'sessionId')),
  };

  switch (type) {
    case 'score':
    case null: // older score events have no type
      return {
        ...base,
        type: 'score',
        teamOne: teamName(get(event, 'teamOne')),
        teamTwo: teamName(get(event, 'teamTwo')),
        teamOneScore: num(get(event, 'teamOneScore')),
        teamTwoScore: num(get(event, 'teamTwoScore')),
        latestScorer: isObj(get(event, 'latestScorer')) ? { team: str(get(get(event, 'latestScorer'), 'team')) } : null,
      };
    case 'match_started':
      return {
        ...base,
        sequence: num(get(event, 'sequence')),
        teamOne: teamName(get(event, 'teamOne')),
        teamTwo: teamName(get(event, 'teamTwo')),
        startedAt: date(get(event, 'startedAt')),
      };
    case 'match_finished': {
      const next = get(event, 'next');
      return {
        ...base,
        sequence: num(get(event, 'sequence')),
        teamOne: teamName(get(event, 'teamOne')),
        teamTwo: teamName(get(event, 'teamTwo')),
        teamOneScore: num(get(event, 'teamOneScore')),
        teamTwoScore: num(get(event, 'teamTwoScore')),
        winner: idOf(get(event, 'winner')),
        decidedBy: str(get(event, 'decidedBy')),
        penaltyWinner: str(get(event, 'penaltyWinner')),
        resultStatus: str(get(event, 'resultStatus')),
        next: isObj(next)
          ? {
              matchId: idOf(get(next, 'matchId')),
              sequence: num(get(next, 'sequence')),
              teamOne: teamName(get(next, 'teamOne')),
              teamTwo: teamName(get(next, 'teamTwo')),
            }
          : null,
      };
    }
    case 'heartbeat':
      return { type, timestamp: num(get(event, 'timestamp')) };
    default:
      return null;
  }
}
