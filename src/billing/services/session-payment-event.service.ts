import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subject, interval, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RedisPubSubService } from 'src/redis/redis-pubsub.service';

const CHANNEL = 'app:session-payment-updates';

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

// Same broadcast mechanism as TournamentEventService: Redis pub/sub fans the
// event out across instances → re-emitted on an in-process Subject → pushed
// over SSE to whoever is watching that session's pool.
@Injectable()
export class SessionPaymentEventService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionPaymentEventService.name);
  private update$ = new Subject<PoolUpdateEvent>();
  private readonly HEARTBEAT_INTERVAL = 30000;

  private readonly messageHandler = (message: string) => {
    try {
      this.update$.next(JSON.parse(message));
    } catch (err) {
      this.logger.error('Failed to parse pool update event from Redis', err);
    }
  };

  private heartbeat$ = interval(this.HEARTBEAT_INTERVAL).pipe(
    map(() => ({ type: 'heartbeat' as const, timestamp: Date.now() })),
  );

  constructor(private readonly redisPubSub: RedisPubSubService) {}

  async onModuleInit() {
    await this.redisPubSub.subscribe(CHANNEL, this.messageHandler);
    this.logger.log('SessionPaymentEventService subscribed to Redis pub/sub channel');
  }

  async emitPoolUpdate(snapshot: PoolSnapshot, reason: string): Promise<void> {
    const event: PoolUpdateEvent = { type: 'pool_update', reason, snapshot, timestamp: Date.now() };
    await this.redisPubSub.publish(CHANNEL, JSON.stringify(event));
  }

  getPoolUpdates(): Observable<PoolUpdateEvent> {
    return this.update$.asObservable();
  }

  getHeartbeat(): Observable<any> {
    return this.heartbeat$;
  }

  async onModuleDestroy(): Promise<void> {
    this.update$.complete();
    await this.redisPubSub.unsubscribe(CHANNEL, this.messageHandler);
  }
}
