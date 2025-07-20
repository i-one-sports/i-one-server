export interface LocationCoordinates {
  type: 'Point';
  coordinates: [number, number];
}

export enum MATCH_TYPE {
  TOURNAMENT = 'tournament',
  LEAGUE = 'league',
  FRIENDLY = 'friendly',
}


export enum WINNING_DECIDER{
  PENALTY = "penalties"
}