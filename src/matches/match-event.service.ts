import { MatchScoreUpdateEvent } from '@app/common';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Subject, interval, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface ConnectionInfo {
  connectionId: string;
  userId: string;
  type: 'match' | 'session' | 'global';
  matchId?: string;      // Only for match streams
  sessionId?: string;    // Only for session streams
  connectedAt: Date;
}

@Injectable()
export class MatchEventService implements OnModuleDestroy {
  private readonly logger = new Logger(MatchEventService.name);
  private matchscore$ = new Subject<MatchScoreUpdateEvent>();
  
  // Track connections per user for better scalability
  private userConnections = new Map<string, Set<string>>(); // userId -> Set of connectionIds
  private connectionDetails = new Map<string, ConnectionInfo>(); // connectionId -> ConnectionInfo
  
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
   * Check if user can connect
   */
  canConnect(userId: string, type: 'match' | 'session' | 'global', resourceId?: string): { allowed: boolean; reason?: string } {
    const userConnectionCount = this.userConnections.get(userId)?.size || 0;

    if (userConnectionCount >= this.MAX_CONNECTIONS_PER_USER) {
      return {
        allowed: false,
        reason: `User has reached maximum connections (${this.MAX_CONNECTIONS_PER_USER})`
      };
    }

    // Check resource-specific limits (e.g., max users per match)
    if (resourceId && type === 'match') {
      const matchConnectionCount = Array.from(this.connectionDetails.values())
        .filter(conn => conn.type === 'match' && conn.matchId === resourceId)
        .map(conn => conn.userId)
        .filter((v, i, a) => a.indexOf(v) === i) // Unique users
        .length;

      if (matchConnectionCount >= this.MAX_CONNECTIONS_PER_MATCH) {
        return {
          allowed: false,
          reason: `Match has reached maximum connections (${this.MAX_CONNECTIONS_PER_MATCH})`
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Add a new connection with proper tracking
   */
  addConnection(
    userId: string,
    type: 'match' | 'session' | 'global',
    options?: { matchId?: string; sessionId?: string }
  ): string {
    // Generate unique connection ID
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    const connectionId = `${type}:${userId}:${timestamp}:${random}`;

    // Track user connections
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(connectionId);

    // Store connection details
    this.connectionDetails.set(connectionId, {
      connectionId,
      userId,
      type,
      matchId: options?.matchId,
      sessionId: options?.sessionId,
      connectedAt: new Date()
    });

    const resourceInfo = 
      type === 'match' ? `Match ${options?.matchId}` :
      type === 'session' ? `Session ${options?.sessionId}` :
      'Global stream';

    this.logger.log(
      `Connection added: ${connectionId} | ` +
      `User ${userId} to ${resourceInfo} | ` +
      `User total connections: ${this.userConnections.get(userId)!.size}`
    );

    return connectionId;
  }

  /**
   * Remove a connection and cleanup resources
   */
  removeConnection(connectionId: string): void {
    const connInfo = this.connectionDetails.get(connectionId);
    
    if (!connInfo) {
      this.logger.warn(`Connection ${connectionId} not found for removal`);
      return;
    }

    const { userId, type } = connInfo;

    // Remove from user connections
    const userConnections = this.userConnections.get(userId);
    if (userConnections) {
      userConnections.delete(connectionId);
      if (userConnections.size === 0) {
        this.userConnections.delete(userId); // Prevent memory leak
      }
    }

    // Remove connection details
    this.connectionDetails.delete(connectionId);

    const resourceInfo = 
      type === 'match' ? `Match ${connInfo.matchId}` :
      type === 'session' ? `Session ${connInfo.sessionId}` :
      'Global stream';

    this.logger.log(
      `Connection removed: ${connectionId} | ` +
      `User ${userId} from ${resourceInfo} | ` +
      `User remaining connections: ${userConnections?.size || 0}`
    );
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    totalUsers: number;
    totalConnections: number;
    byType: {
      match: number;
      session: number;
      global: number;
    };
    userConnections: Array<{ userId: string; connectionCount: number; byType: { match: number; session: number; global: number } }>;
    matchConnections: Array<{ matchId: string; connectionCount: number; uniqueUsers: number }>;
    sessionConnections: Array<{ sessionId: string; connectionCount: number; uniqueUsers: number }>;
  } {
    const connections = Array.from(this.connectionDetails.values());

    // Stats by type
    const byType = {
      match: connections.filter(c => c.type === 'match').length,
      session: connections.filter(c => c.type === 'session').length,
      global: connections.filter(c => c.type === 'global').length
    };

    // User stats
    const userStats = Array.from(this.userConnections.entries()).map(([userId, connectionIds]) => {
      const userConns = Array.from(connectionIds).map(id => this.connectionDetails.get(id)).filter(Boolean) as ConnectionInfo[];
      return {
        userId,
        connectionCount: connectionIds.size,
        byType: {
          match: userConns.filter(c => c.type === 'match').length,
          session: userConns.filter(c => c.type === 'session').length,
          global: userConns.filter(c => c.type === 'global').length
        }
      };
    });

    // Match stats (group by matchId)
    const matchGroups = new Map<string, ConnectionInfo[]>();
    connections.filter(c => c.type === 'match' && c.matchId).forEach(conn => {
      const matchId = conn.matchId!;
      if (!matchGroups.has(matchId)) matchGroups.set(matchId, []);
      matchGroups.get(matchId)!.push(conn);
    });

    const matchStats = Array.from(matchGroups.entries()).map(([matchId, conns]) => ({
      matchId,
      connectionCount: conns.length,
      uniqueUsers: new Set(conns.map(c => c.userId)).size
    }));

    // Session stats (group by sessionId)
    const sessionGroups = new Map<string, ConnectionInfo[]>();
    connections.filter(c => c.type === 'session' && c.sessionId).forEach(conn => {
      const sessionId = conn.sessionId!;
      if (!sessionGroups.has(sessionId)) sessionGroups.set(sessionId, []);
      sessionGroups.get(sessionId)!.push(conn);
    });

    const sessionStats = Array.from(sessionGroups.entries()).map(([sessionId, conns]) => ({
      sessionId,
      connectionCount: conns.length,
      uniqueUsers: new Set(conns.map(c => c.userId)).size
    }));

    return {
      totalUsers: this.userConnections.size,
      totalConnections: this.connectionDetails.size,
      byType,
      userConnections: userStats,
      matchConnections: matchStats,
      sessionConnections: sessionStats
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
    this.connectionDetails.clear();
    
    this.logger.log('MatchEventService cleanup complete');
  }
}
