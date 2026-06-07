import { Types } from "mongoose";

export interface TokenPayload {
  userId: string;
}

export interface SessionI {
  location: LocationI;
  playersPerTeam: number;
  setNumber: number;
  minsPerSet: number;
  timeDuration: number;
  startTime: Date;
  stopTime: Date;
  winningDecider: string;
  inProgress: boolean;
  finished: boolean;
  captain: UserI;
  members: UserI[];
  maxNumber: number;
  isFull: boolean;
}

export interface LocationI {}

export interface UserI {
  nickname: string;
}

export interface GoalScorerI {
  player: UserI & { _id: string };
  team: 'teamOne' | 'teamTwo';
}

export interface MatchI {
  teamOne: SetI;
  teamTwo: SetI;
  teamOneScore: number;
  teamTwoScore: number;
  isStarted: boolean;
  session: SessionI;
  goalScorers: GoalScorerI[];
}

export interface SetI {
  name: string;
}

export enum UploadType {
  PITCH = 'pitches',
  USER_AVATAR = 'users',
  AVATAR = 'avatars',
  DOCUMENT_FRONT = 'documents_front',
  DOCUMENT_BACK = 'documents_back',
  LOCATION_PICTURE = 'location_pictures'
  // RESOURCE_AVATAR = 'resources'
}

export enum TournamentStatus {
  REGISTRATION = 'registration',
  STARTED = 'started',
  COMPLETED = 'completed',
}

export enum TournamentType {
  KNOCKOUT = 'knockout',
  LEAGUE = 'league',
}

export interface MatchScoreUpdateEvent {
  matchId: string | Types.ObjectId;
  sessionId?: string | Types.ObjectId;
  locationId?: string | Types.ObjectId;
  teamOne: {
    id: string | Types.ObjectId;
    name: string;
  };
  teamTwo: {
    id: string | Types.ObjectId;
    name: string;
  };
  teamOneScore: number;
  teamTwoScore: number;
  latestScorer?: {
    player: string | Types.ObjectId;
    team: 'teamOne' | 'teamTwo';
  };
}

// Broadcast over the same Redis pub/sub → SSE pipeline as MatchScoreUpdateEvent,
// on its own channel — covers bracket (knockout) and fixture/standings (league) changes.
export interface TournamentUpdateEvent {
  tournamentId: string | Types.ObjectId;
  locationId?: string | Types.ObjectId;
  status: TournamentStatus;
  event: 'started' | 'result' | 'advance' | 'scheduled' | 'completed';
  matchIndex?: number;
  homeScore?: number | null;
  awayScore?: number | null;
  winner?: { teamId: string | Types.ObjectId; name: string; logo: string } | null;
  isFinal?: boolean;
  scheduledTime?: Date | null;
}