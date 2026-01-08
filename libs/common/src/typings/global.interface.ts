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

export interface MatchI {
  teamOne: SetI;
  teamTwo: SetI;
  teamOneScore: number;
  teamTwoScore: number;
  isStarted: boolean;
  session: SessionI;
}

export interface SetI {
  name: string;
}

export enum UploadType {
  PITCH = 'pitches',
  USER_AVATAR = 'users',
  AVATAR = 'avatars'
  // RESOURCE_AVATAR = 'resources'
}

export enum TournamentStatus {
  REGISTRATION = 'registration',
  GROUP_STAGE = 'group_stage',
  KNOCKOUT_PHASE = 'knockout_phase',
  COMPLETED = 'completed',
}

export enum TournamentFormat {
  UCL_CLASSIC = 'ucl_classic',
  SWISS = 'swiss',
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
}