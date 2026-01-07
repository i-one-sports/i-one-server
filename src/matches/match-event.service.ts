import { MatchScoreUpdateEvent } from '@app/common';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Subject, interval, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface ConnectionInfo {
  userId: string;
  matchId: string;
  connectedAt: Date;
}

@Injectable()
export class MatchEventService implements OnModuleDestroy {
  private readonly logger = new Logger(MatchEventService.name);
  private matchscore$ = new Subject<MatchScoreUpdateEvent>();
  
  // Track connections per user for better scalability
  private userConnections = new Map<string, Set<string>>(); // userId -> Set of matchIds
  private matchConnections = new Map<string, Set<string>>(); // matchId -> Set of userIds
  private connectionDetails = new Map<string, ConnectionInfo>(); // "userId:matchId" -> ConnectionInfo
  
  private readonly MAX_CONNECTIONS_PER_USER = 10;
  private readonly MAX_CONNECTIONS_PER_MATCH = 500;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  
  // Heartbeat observable that emits every 30 seconds
  private heartbeat$ = interval(this.HEARTBEAT_INTERVAL).pipe(
    map(() => ({
      type: 'heartbeat' as const,
      timestamp: Date.now(),
      message: 'Connection alive'
    }))
  );

  /**
   * Emit match score update to all listeners
   */
  emitMatchScoreUpdate(event: MatchScoreUpdateEvent): void {
    this.logger.log(`Emitting match score update for match ${event.matchId}`);
    this.matchscore$.next(event);
  }

  /**
   * Get observable for score updates
   */
  getScoreUpdates(): Observable<any> {
    return this.matchscore$.asObservable();
  }

  /**
   * Get heartbeat observable
   */
  getHeartbeat(): Observable<any> {
    return this.heartbeat$;
  }

  /**
   * Check if user can connect to a specific match
   */
  canConnect(userId: string, matchId: string): { allowed: boolean; reason?: string } {
    const userConnectionCount = this.userConnections.get(userId)?.size || 0;
    const matchConnectionCount = this.matchConnections.get(matchId)?.size || 0;

    if (userConnectionCount >= this.MAX_CONNECTIONS_PER_USER) {
      return {
        allowed: false,
        reason: `User has reached maximum connections (${this.MAX_CONNECTIONS_PER_USER})`
      };
    }

    if (matchConnectionCount >= this.MAX_CONNECTIONS_PER_MATCH) {
      return {
        allowed: false,
        reason: `Match has reached maximum connections (${this.MAX_CONNECTIONS_PER_MATCH})`
      };
    }

    return { allowed: true };
  }

  /**
   * Add a new connection with proper tracking
   */
  addConnection(userId: string, matchId: string): string {
    const connectionId = `${userId}:${matchId}`;

    // Track user connections
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(matchId);

    // Track match connections
    if (!this.matchConnections.has(matchId)) {
      this.matchConnections.set(matchId, new Set());
    }
    this.matchConnections.get(matchId)!.add(userId);

    // Store connection details (only if not already exists)
    if (!this.connectionDetails.has(connectionId)) {
      this.connectionDetails.set(connectionId, {
        userId,
        matchId,
        connectedAt: new Date()
      });
    }

    this.logger.log(
      `Connection added: User ${userId} to Match ${matchId} | ` +
      `User connections: ${this.userConnections.get(userId)!.size}, ` +
      `Match connections: ${this.matchConnections.get(matchId)!.size}`
    );

    return connectionId;
  }

  /**
   * Remove a connection and cleanup resources
   */
  removeConnection(userId: string, matchId: string): void {
    const connectionId = `${userId}:${matchId}`;

    // Remove from user connections
    const userMatches = this.userConnections.get(userId);
    if (userMatches) {
      userMatches.delete(matchId);
      if (userMatches.size === 0) {
        this.userConnections.delete(userId); // Prevent memory leak
      }
    }

    // Remove from match connections
    const matchUsers = this.matchConnections.get(matchId);
    if (matchUsers) {
      matchUsers.delete(userId);
      if (matchUsers.size === 0) {
        this.matchConnections.delete(matchId); // Prevent memory leak
      }
    }

    // Remove connection details
    this.connectionDetails.delete(connectionId);

    this.logger.log(
      `Connection removed: User ${userId} from Match ${matchId} | ` +
      `Remaining - User connections: ${userMatches?.size || 0}, ` +
      `Match connections: ${matchUsers?.size || 0}`
    );
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    totalUsers: number;
    totalMatches: number;
    totalConnections: number;
    userConnections: Array<{ userId: string; matchCount: number }>;
    matchConnections: Array<{ matchId: string; userCount: number }>;
  } {
    const userStats = Array.from(this.userConnections.entries()).map(([userId, matches]) => ({
      userId,
      matchCount: matches.size
    }));

    const matchStats = Array.from(this.matchConnections.entries()).map(([matchId, users]) => ({
      matchId,
      userCount: users.size
    }));

    return {
      totalUsers: this.userConnections.size,
      totalMatches: this.matchConnections.size,
      totalConnections: this.connectionDetails.size,
      userConnections: userStats,
      matchConnections: matchStats
    };
  }



  /**
   * Cleanup on module destroy to prevent memory leaks
   */
  onModuleDestroy(): void {
    this.logger.log('Cleaning up MatchEventService resources');
    
    // Complete and unsubscribe from Subject
    this.matchscore$.complete();
    
    // Clear all maps
    this.userConnections.clear();
    this.matchConnections.clear();
    this.connectionDetails.clear();
    
    this.logger.log('MatchEventService cleanup complete');
  }
}
