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

export enum OWNER_ONBOARDING_STATUS {
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum PITCH_CONDITION {
  EXCELLENT = 'excellent',
  GOOD = 'good',
  FAIR = 'fair',
  POOR = 'poor',
  WET = 'wet',
  UNDER_MAINTENANCE = 'under_maintenance',
}

export enum LOCATION_TIER {
  FREE = 'free',
  PAID = 'paid',
}

export enum LOCATION_PRICING_OPTION {
  HOURLY = 'hourly',
  MONTHLY = 'monthly',
}

export enum LOCATION_STATUS {
  PENDING_VERIFICATION = 'pending_verification',
  ACTIVE = 'active',
  REJECTED = 'rejected',
}
