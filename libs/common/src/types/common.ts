export interface LocationCoordinates {
  type: 'Point';
  coordinates: [number, number];
}

export enum MATCH_TYPE {
  TOURNAMENT = 'tournament',
  LEAGUE = 'league',
  FRIENDLY = 'friendly',
}

// How a drawn game is settled. Only matters for WINNER_STAYS — round robin
// keeps draws as draws.
export enum WINNING_DECIDER {
  PENALTY = 'penalties',
  // Both teams leave the pitch; the next two in the queue come on.
  BOTH_OFF = 'both_off',
}

// Who plays next once a game ends.
export enum ROTATION_FORMAT {
  // Winner stays on, loser goes to the back of the queue.
  WINNER_STAYS = 'winner_stays',
  // Every team plays every other team in a fixed order, repeating until stopTime.
  ROUND_ROBIN = 'round_robin',
}

export enum MATCH_STATUS {
  SCHEDULED = 'SCHEDULED',
  LIVE = 'LIVE',
  FINISHED = 'FINISHED',
}

// How the referee records: on their own i-One account, or in Referee mode on
// a captain's phone (requests then arrive with the captain's login).
export enum REFEREE_MODE {
  OWN_PHONE = 'OWN_PHONE',
  CAPTAIN_DEVICE = 'CAPTAIN_DEVICE',
}

export enum REFEREE_STATUS {
  INVITED = 'INVITED',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
}

// Whether a finished match's result may feed stats. Only CONFIRMED counts.
export enum MATCH_RESULT_STATUS {
  // No referee when the match ended — score kept for rotation only.
  UNOFFICIAL = 'UNOFFICIAL',
  // Refereed in Referee mode on a captain's phone; the opposing side must confirm.
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
  CONFIRMED = 'CONFIRMED',
  DISPUTED = 'DISPUTED',
}

export enum MATCH_EVENT_TYPE {
  GOAL = 'GOAL',
  // Cancels the most recent goal for a team (and its scorer).
  UNDO = 'UNDO',
}

// A player's result in one match, for stats.
export enum MATCH_OUTCOME {
  WON = 'WON',
  DRAWN = 'DRAWN',
  LOST = 'LOST',
}

export enum MATCH_DECIDED_BY {
  NORMAL_TIME = 'NORMAL_TIME',
  PENALTIES = 'PENALTIES',
  DRAW = 'DRAW',
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

// Lifecycle status layered on top of the existing paymentStatus/isFull/finished
// fields on Session — those still track fill/payment progress; this tracks
// whether the session itself is alive, cancelled, played out, or refunded.
// OPEN covers everything from "just created" through "in progress" (the
// existing fields already distinguish those sub-states); this enum only adds
// the states those fields can't express: CANCELLED and REFUNDED.
// How a paid session collects money.
// POOL: the owner's price is the total for the pitch (paymentTarget); members
// contribute any amount until it's covered. Default for new hourly sessions.
// PER_PERSON: every member owes the same fixed paymentAmount — monthly
// pricing, and every session created before pooling existed.
export enum SESSION_PAYMENT_MODE {
  POOL = 'POOL',
  PER_PERSON = 'PER_PERSON',
}

export enum SESSION_STATUS {
  OPEN = 'OPEN',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  REFUNDED = 'REFUNDED',
}
