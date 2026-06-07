import { TournamentUpdateEvent } from '@app/common';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subject, interval, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RedisPubSubService } from 'src/redis/redis-pubsub.service';

const CHANNEL = 'app:tournament-updates';

// Same broadcast mechanism as MatchEventService (Redis pub/sub fans the event
// out across instances → re-emitted on an in-process Subject → pushed over SSE),
// on its own channel so tournament viewers don't have to poll GET /tournaments/:id.
@Injectable()
export class TournamentEventService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TournamentEventService.name);
  private update$ = new Subject<TournamentUpdateEvent>();

  private readonly messageHandler = (message: string) => {
    try {
      const event: TournamentUpdateEvent = JSON.parse(message);
      this.update$.next(event);
    } catch (err) {
      this.logger.error('Failed to parse tournament update event from Redis', err);
    }
  };

  constructor(private readonly redisPubSub: RedisPubSubService) {}

  private connectionsByTournament = new Map<string, Set<string>>();
  private readonly MAX_CONNECTIONS_PER_TOURNAMENT = 500;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds

  private heartbeat$ = interval(this.HEARTBEAT_INTERVAL).pipe(
    map(() => ({
      type: 'heartbeat' as const,
      timestamp: Date.now(),
      message: 'Connection alive',
    })),
  );

  async onModuleInit() {
    await this.redisPubSub.subscribe(CHANNEL, this.messageHandler);
    this.logger.log('TournamentEventService subscribed to Redis pub/sub channel');
  }

  async emitTournamentUpdate(event: TournamentUpdateEvent): Promise<void> {
    this.logger.log(`Emitting tournament update for ${event.tournamentId} (${event.event})`);
    await this.redisPubSub.publish(CHANNEL, JSON.stringify(event));
  }

  getTournamentUpdates(): Observable<any> {
    return this.update$.asObservable();
  }

  getHeartbeat(): Observable<any> {
    return this.heartbeat$;
  }

  canConnect(tournamentId: string): { allowed: boolean; reason?: string } {
    const count = this.connectionsByTournament.get(tournamentId)?.size ?? 0;
    if (count >= this.MAX_CONNECTIONS_PER_TOURNAMENT) {
      return {
        allowed: false,
        reason: `Tournament stream has reached maximum connections (${this.MAX_CONNECTIONS_PER_TOURNAMENT})`,
      };
    }
    return { allowed: true };
  }

  addConnection(tournamentId: string, userId: string): string {
    const connectionId = `tournament:${tournamentId}:${userId}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;

    if (!this.connectionsByTournament.has(tournamentId)) {
      this.connectionsByTournament.set(tournamentId, new Set());
    }
    this.connectionsByTournament.get(tournamentId)!.add(connectionId);

    this.logger.log(
      `Connection added: ${connectionId} | User ${userId} to Tournament ${tournamentId} | ` +
      `Tournament connections: ${this.connectionsByTournament.get(tournamentId)!.size}`,
    );

    return connectionId;
  }

  removeConnection(tournamentId: string, connectionId: string): void {
    const connections = this.connectionsByTournament.get(tournamentId);
    if (!connections) return;

    connections.delete(connectionId);
    if (connections.size === 0) {
      this.connectionsByTournament.delete(tournamentId); // prevent memory leak
    }

    this.logger.log(`Connection removed: ${connectionId} | Tournament ${tournamentId} remaining: ${connections.size}`);
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Cleaning up TournamentEventService resources');

    this.update$.complete();
    this.connectionsByTournament.clear();

    await this.redisPubSub.unsubscribe(CHANNEL, this.messageHandler);

    this.logger.log('TournamentEventService cleanup complete');
  }
}
