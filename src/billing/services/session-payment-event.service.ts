import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subject, interval, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RedisPubSubService } from 'src/redis/redis-pubsub.service';

const CHANNEL = 'app:session-payment-updates';
const SESSION_CHANNEL = 'app:session-updates';

export interface PoolContributor {
  userId: string;
  name: string;
  amount: number;
}

// Full state of a POOL session's payment, in base kobo (before commission).
// Always pushed whole — never as a delta — so a client that missed an event
// is corrected by the next one, and a reconnect is just "send the snapshot".
export interface PoolSnapshot {
  sessionId: string;
  target: number;
  paid: number;
  reserved: number;
  remaining: number;
  available: number;
  fairShare: number;
  minContribution: number;
  fullyFunded: boolean;
  contributors: PoolContributor[];
}

export interface PoolUpdateEvent {
  type: 'pool_update';
  reason: string;
  snapshot: PoolSnapshot;
  timestamp: number;
}

// A member's payment as the session screen shows it. COVERED = no bill on
// this session because a monthly pass at the pitch covers them. null =
// nothing to pay (free session, not full yet, or a pool member who hasn't
// chipped in).
export type MemberPaymentState =
  | 'PAID'
  | 'PENDING'
  | 'COVERED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | null;

export interface SessionMemberSnapshot {
  userId: string;
  name: string;
  payment: MemberPaymentState;
}

// Everything the session screen needs: who's in and where each member is
// with paying. Pushed whole, like PoolSnapshot.
export interface SessionSnapshot {
  sessionId: string;
  maxNumber: number;
  isFull: boolean;
  status: string | null;
  paymentRequired: boolean;
  paymentMode: string | null;
  paymentStatus: string | null;
  paymentDeadline: Date | null;
  members: SessionMemberSnapshot[];
  paidCount: number;
  owingCount: number;
  coveredCount: number;
  pool: PoolSnapshot | null;
}

export interface SessionUpdateEvent {
  type: 'session_update';
  reason: string;
  snapshot: SessionSnapshot;
  timestamp: number;
}

// Same broadcast mechanism as TournamentEventService: Redis pub/sub fans the
// event out across instances → re-emitted on an in-process Subject → pushed
// over SSE to whoever is watching that session's pool.
@Injectable()
export class SessionPaymentEventService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionPaymentEventService.name);
  private update$ = new Subject<PoolUpdateEvent>();
  private sessionUpdate$ = new Subject<SessionUpdateEvent>();
  private readonly HEARTBEAT_INTERVAL = 30000;

  private readonly messageHandler = (message: string) => {
    try {
      this.update$.next(JSON.parse(message));
    } catch (err) {
      this.logger.error('Failed to parse pool update event from Redis', err);
    }
  };

  private readonly sessionMessageHandler = (message: string) => {
    try {
      this.sessionUpdate$.next(JSON.parse(message));
    } catch (err) {
      this.logger.error('Failed to parse session update event from Redis', err);
    }
  };

  private heartbeat$ = interval(this.HEARTBEAT_INTERVAL).pipe(
    map(() => ({ type: 'heartbeat' as const, timestamp: Date.now() })),
  );

  constructor(private readonly redisPubSub: RedisPubSubService) {}

  async onModuleInit() {
    await this.redisPubSub.subscribe(CHANNEL, this.messageHandler);
    await this.redisPubSub.subscribe(SESSION_CHANNEL, this.sessionMessageHandler);
    this.logger.log('SessionPaymentEventService subscribed to Redis pub/sub channel');
  }

  async emitPoolUpdate(snapshot: PoolSnapshot, reason: string): Promise<void> {
    const event: PoolUpdateEvent = { type: 'pool_update', reason, snapshot, timestamp: Date.now() };
    await this.redisPubSub.publish(CHANNEL, JSON.stringify(event));
  }

  getPoolUpdates(): Observable<PoolUpdateEvent> {
    return this.update$.asObservable();
  }

  async emitSessionUpdate(snapshot: SessionSnapshot, reason: string): Promise<void> {
    const event: SessionUpdateEvent = { type: 'session_update', reason, snapshot, timestamp: Date.now() };
    await this.redisPubSub.publish(SESSION_CHANNEL, JSON.stringify(event));
  }

  getSessionUpdates(): Observable<SessionUpdateEvent> {
    return this.sessionUpdate$.asObservable();
  }

  getHeartbeat(): Observable<{ type: 'heartbeat'; timestamp: number }> {
    return this.heartbeat$;
  }

  async onModuleDestroy(): Promise<void> {
    this.update$.complete();
    this.sessionUpdate$.complete();
    await this.redisPubSub.unsubscribe(CHANNEL, this.messageHandler);
    await this.redisPubSub.unsubscribe(SESSION_CHANNEL, this.sessionMessageHandler);
  }
}
