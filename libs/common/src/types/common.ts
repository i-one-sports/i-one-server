export interface LocationCoordinates {
  type: 'Point';
  coordinates: [number, number];
}

export enum MATCH_TYPE {
  TOURNAMENT = 'tournament',
  LEAGUE = 'league',
  FRIENDLY = 'friendly',
}

export enum WINNING_DECIDER {
  PENALTY = 'penalties',
}

export enum STATS {
  GOALS = 'goals',
  ASSISTS = 'assists',
}

export enum PLAYER_POSITION {
  DEFENDER = 'DF',
  MIDFIELDER = 'MF',
  STRIKER = 'ST',
}

export enum USER_ROLE {
  USER = 'user',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
}
