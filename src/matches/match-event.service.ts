import { MatchScoreUpdateEvent } from '@app/common';
import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';

@Injectable()
export class MatchEventService {
  private readonly logger = new Logger(MatchEventService.name);
  private matchscore$ = new Subject<MatchScoreUpdateEvent>();
  private matchConnections = new Map<string, number>();
  private readonly MAX_CONNECTIONS_PER_MATCH = 500;

  //emit update to all listeners
  emitMatchScoreUpdate(event: MatchScoreUpdateEvent) {
    this.logger.log(`Emitting match score update for match ${event.matchId}`);
    this.matchscore$.next(event);
  }

  //allow SSE to subscribe
  getScoreUpdates() {
    return this.matchscore$.asObservable();
  }

  // Connection management methods
  canConnect(matchId: string): boolean {
    const current = this.matchConnections.get(matchId) || 0;
    this.logger.log(`Match ${matchId} has ${current} connections`);
    return current < this.MAX_CONNECTIONS_PER_MATCH;
  }

  addConnection(matchId: string): void {
    const current = this.matchConnections.get(matchId) || 0;
    this.matchConnections.set(matchId, current + 1);
    this.logger.log(`Added connection to match ${matchId}. Total: ${current + 1}`);
  }

  removeConnection(matchId: string): void {
    const current = this.matchConnections.get(matchId) || 0;
    this.matchConnections.set(matchId, Math.max(0, current - 1));
    this.logger.log(`Removed connection from match ${matchId}. Total: ${Math.max(0, current - 1)}`);
  }

  getConnectionCount(matchId: string): number {
    return this.matchConnections.get(matchId) || 0;
  }
}
