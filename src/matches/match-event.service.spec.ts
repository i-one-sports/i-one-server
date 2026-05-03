import { Test, TestingModule } from '@nestjs/testing';
import { MatchEventService } from './match-event.service';
import { MatchScoreUpdateEvent } from '@app/common';
import { RedisPubSubService } from 'src/redis/redis-pubsub.service';

describe('MatchEventService - Memory Leak & Connection Tests', () => {
  let service: MatchEventService;
  let redisPubSub: {
    publish: jest.Mock;
    subscribe: jest.Mock;
    unsubscribe: jest.Mock;
  };

  beforeEach(async () => {
    redisPubSub = {
      publish: jest.fn(async (_channel: string, message: string) => {
        JSON.parse(message);
      }),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchEventService,
        {
          provide: RedisPubSubService,
          useValue: redisPubSub,
        },
      ],
    }).compile();

    service = module.get<MatchEventService>(MatchEventService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('Connection Management', () => {
    it('should allow user to connect to a match', () => {
      const userId = 'user123';
      const matchId = 'match456';

      const result = service.canConnect(userId, 'match', matchId);
      expect(result.allowed).toBe(true);
    });

    it('should track connections per user', () => {
      const userId = 'user123';
      const matchId1 = 'match1';
      const matchId2 = 'match2';

      service.addConnection(userId, 'match', { matchId: matchId1 });
      service.addConnection(userId, 'match', { matchId: matchId2 });

      const stats = service.getConnectionStats();
      expect(stats.totalUsers).toBe(1);
      expect(stats.userConnections[0].connectionCount).toBe(2);
    });

    it('should enforce max connections per user', () => {
      const userId = 'user123';

      // Add connections up to the limit
      for (let i = 0; i < 10; i++) {
        service.addConnection(userId, 'match', { matchId: `match${i}` });
      }

      // Try to add one more
      const result = service.canConnect(userId, 'match', 'match11');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('maximum connections');
    });

    it('should enforce max connections per match', () => {
      const matchId = 'match123';

      // Add connections up to the limit (500 users)
      for (let i = 0; i < 500; i++) {
        service.addConnection(`user${i}`, 'match', { matchId });
      }

      // Try to add one more
      const result = service.canConnect('user501', 'match', matchId);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('maximum connections');
    });

    it('should properly cleanup connections', () => {
      const userId = 'user123';
      const matchId = 'match456';

      const connId = service.addConnection(userId, 'match', { matchId });
      let stats = service.getConnectionStats();
      expect(stats.totalConnections).toBe(1);

      service.removeConnection(connId);
      stats = service.getConnectionStats();
      expect(stats.totalConnections).toBe(0);
      expect(stats.totalUsers).toBe(0);
    });

    it('should handle multiple users on same match', () => {
      const matchId = 'match123';
      const users = ['user1', 'user2', 'user3'];

      users.forEach((userId) =>
        service.addConnection(userId, 'match', { matchId }),
      );

      const stats = service.getConnectionStats();
      expect(stats.matchConnections.length).toBe(1);
      expect(stats.matchConnections[0].connectionCount).toBe(3);
      expect(stats.matchConnections[0].uniqueUsers).toBe(3);
    });

    it('should handle same user on multiple matches', () => {
      const userId = 'user123';
      const matches = ['match1', 'match2', 'match3'];

      matches.forEach((matchId) =>
        service.addConnection(userId, 'match', { matchId }),
      );

      const stats = service.getConnectionStats();
      expect(stats.totalUsers).toBe(1);
      expect(stats.userConnections[0].connectionCount).toBe(3);
    });
  });

  describe('Memory Leak Prevention', () => {
    it('should remove empty Sets from maps', () => {
      const userId = 'user123';
      const matchId = 'match456';

      // Add and remove connection
      const connId = service.addConnection(userId, 'match', { matchId });
      service.removeConnection(connId);

      const stats = service.getConnectionStats();

      // Maps should be completely empty, preventing memory leaks
      expect(stats.totalUsers).toBe(0);
      expect(stats.totalConnections).toBe(0);
    });

    it('should not leak memory with many add/remove cycles', () => {
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        const userId = `user${i}`;
        const matchId = `match${i}`;

        const connId = service.addConnection(userId, 'match', { matchId });
        service.removeConnection(connId);
      }

      const stats = service.getConnectionStats();

      // After all cycles, everything should be cleaned up
      expect(stats.totalUsers).toBe(0);
      expect(stats.totalConnections).toBe(0);
    });

    it('should properly cleanup on module destroy', () => {
      const userId = 'user123';
      const matchId = 'match456';

      service.addConnection(userId, 'match', { matchId });
      service.onModuleDestroy();

      const stats = service.getConnectionStats();

      // Everything should be cleared
      expect(stats.totalUsers).toBe(0);
      expect(stats.totalConnections).toBe(0);
    });
  });

  describe('Event Emission', () => {
    it('should publish match score updates to Redis', async () => {
      const matchId = 'match123';
      const event: MatchScoreUpdateEvent = {
        matchId,
        teamOneScore: 10,
        teamTwoScore: 5,
        teamOne: {
          id: '',
          name: '',
        },
        teamTwo: {
          id: '',
          name: '',
        },
      };

      await service.emitMatchScoreUpdate(event);

      expect(redisPubSub.publish).toHaveBeenCalledWith(
        'app:match-scores',
        JSON.stringify(event),
      );
    });

    it('should emit heartbeat every 30 seconds', (done) => {
      jest.useFakeTimers();
      let heartbeatCount = 0;

      const subscription = service.getHeartbeat().subscribe((heartbeat) => {
        expect(heartbeat.type).toBe('heartbeat');
        expect(heartbeat.timestamp).toBeDefined();
        heartbeatCount++;

        if (heartbeatCount >= 1) {
          subscription.unsubscribe();
          done();
        }
      });

      jest.advanceTimersByTime(30000);
      jest.useRealTimers();
    });
  });

  describe('Connection Statistics', () => {
    it('should provide accurate connection statistics', () => {
      service.addConnection('user1', 'match', { matchId: 'match1' });
      service.addConnection('user1', 'match', { matchId: 'match2' });
      service.addConnection('user2', 'match', { matchId: 'match1' });
      service.addConnection('user2', 'match', { matchId: 'match3' });

      const stats = service.getConnectionStats();

      expect(stats.totalUsers).toBe(2);
      expect(stats.matchConnections.length).toBe(3);
      expect(stats.totalConnections).toBe(4);

      // Check user1 has 2 matches
      const user1Stats = stats.userConnections.find(
        (u) => u.userId === 'user1',
      );
      expect(user1Stats?.connectionCount).toBe(2);

      // Check match1 has 2 users
      const match1Stats = stats.matchConnections.find(
        (m) => m.matchId === 'match1',
      );
      expect(match1Stats?.connectionCount).toBe(2);
      expect(match1Stats?.uniqueUsers).toBe(2);
    });
  });
});
