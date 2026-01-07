# SSE (Server-Sent Events) Implementation Guide

## Overview
This guide explains the improved SSE implementation for real-time match score updates with robust connection management, heartbeat mechanism, and memory leak prevention.

## Key Features

### ✅ 1. User-Based Connection Tracking
- Connections are tracked per user, not just per match
- Each user can connect to multiple matches (max 10)
- Each match can have multiple users connected (max 500)
- Prevents abuse by limiting connections per user

### ✅ 2. Heartbeat Mechanism
- Automatic heartbeat sent every 30 seconds
- Keeps connections alive
- Helps detect dead connections
- Event type: `heartbeat` with timestamp

### ✅ 3. Proper Cleanup
- Automatic cleanup on disconnect
- Empty Sets are removed from Maps (prevents memory leaks)
- `onModuleDestroy` lifecycle hook ensures cleanup on shutdown
- Subject completion prevents Observable leaks

### ✅ 4. Memory Leak Prevention
- Maps cleared when empty
- Connection details tracked with timestamps
- Proper unsubscribe and finalize operators
- Module lifecycle management

## Architecture

### MatchEventService
Central service managing all SSE connections and events.

**Key Methods:**
- `addConnection(userId, matchId)` - Track new connection
- `removeConnection(userId, matchId)` - Cleanup connection
- `canConnect(userId, matchId)` - Check connection limits
- `emitMatchScoreUpdate(event)` - Emit score updates
- `getScoreUpdates()` - Get score update observable
- `getHeartbeat()` - Get heartbeat observable
- `getConnectionStats()` - Get connection statistics

**Data Structures:**
```typescript
userConnections: Map<userId, Set<matchId>>
matchConnections: Map<matchId, Set<userId>>
connectionDetails: Map<connectionId, ConnectionInfo>
```

### MatchesController
Handles SSE endpoints with proper authentication and cleanup.

**Endpoints:**

#### 1. Single Match Stream
```
GET /matches/stream/:matchId
```
- Requires JWT authentication
- Tracks user connection to specific match
- Filters events for the specific match
- Includes heartbeat

**Response Format:**
```json
{
  "type": "connected",
  "message": "Connection established",
  "matchId": "match123",
  "userId": "user456",
  "timestamp": 1704672000000
}
```

#### 2. Global Stream
```
GET /matches/stream
```
- Requires JWT authentication
- Receives all match updates
- Includes heartbeat
- Uses pseudo-matchId for tracking

#### 3. Connection Statistics
```
GET /matches/connections/stats
```
- Returns current connection statistics
- Useful for monitoring and debugging

**Response Format:**
```json
{
  "totalUsers": 5,
  "totalMatches": 3,
  "totalConnections": 8,
  "userConnections": [
    { "userId": "user1", "matchCount": 2 }
  ],
  "matchConnections": [
    { "matchId": "match1", "userCount": 3 }
  ]
}
```

## Frontend Integration

### Connecting to Single Match Stream
```javascript
const matchId = 'match123';
const eventSource = new EventSource(
  `/matches/stream/${matchId}`,
  { withCredentials: true }
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch(data.type) {
    case 'connected':
      console.log('Connected to match stream');
      break;
    
    case 'heartbeat':
      console.log('Heartbeat received:', data.timestamp);
      break;
    
    case 'score-update':
      console.log('Score update:', data);
      // Update UI with new scores
      updateScores(data.teamOneScore, data.teamTwoScore);
      break;
    
    case 'error':
      console.error('Stream error:', data.message);
      break;
  }
};

eventSource.onerror = (error) => {
  console.error('EventSource error:', error);
  // Reconnection is automatic
};

// Cleanup on component unmount
eventSource.close();
```

### Connecting to Global Stream
```javascript
const eventSource = new EventSource(
  '/matches/stream',
  { withCredentials: true }
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'score-update') {
    // Handle updates for any match
    updateMatchScore(data.matchId, data.teamOneScore, data.teamTwoScore);
  }
};
```

## Event Types

### 1. Connected Event
```typescript
{
  type: 'connected',
  message: 'Connection established',
  matchId: string,
  userId: string,
  timestamp: number
}
```

### 2. Heartbeat Event
```typescript
{
  type: 'heartbeat',
  timestamp: number,
  message: 'Connection alive'
}
```

### 3. Score Update Event
```typescript
{
  type: 'score-update',
  matchId: string,
  teamOneScore: number,
  teamTwoScore: number,
  timestamp: number
}
```

### 4. Error Event
```typescript
{
  type: 'error',
  message: string,
  timestamp: number,
  matchId?: string
}
```

## Configuration

### Connection Limits
```typescript
MAX_CONNECTIONS_PER_USER = 10    // Each user can connect to 10 matches
MAX_CONNECTIONS_PER_MATCH = 500  // Each match can have 500 users
```

### Heartbeat Interval
```typescript
HEARTBEAT_INTERVAL = 30000  // 30 seconds
```

## Error Handling

### Too Many Connections (429)
```json
{
  "statusCode": 429,
  "message": "User has reached maximum connections (10)"
}
```

### Unauthorized (401)
```json
{
  "statusCode": 401,
  "message": "User authentication required"
}
```

## Monitoring & Debugging

### Check Connection Statistics
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/matches/connections/stats
```

### Logs to Watch For
- `Connection added: User X to Match Y`
- `Connection removed: User X from Match Y`
- `SSE connection established`
- `SSE connection cleaned up`
- `Cleaning up MatchEventService resources`

## Best Practices

### 1. Always Close Connections
```javascript
// React example
useEffect(() => {
  const eventSource = new EventSource(url);
  
  return () => {
    eventSource.close(); // Cleanup
  };
}, [url]);
```

### 2. Handle Reconnection
```javascript
let reconnectAttempts = 0;
const maxReconnects = 5;

eventSource.onerror = () => {
  if (reconnectAttempts < maxReconnects) {
    reconnectAttempts++;
    setTimeout(() => {
      // Recreate EventSource
    }, 1000 * reconnectAttempts);
  }
};
```

### 3. Monitor Heartbeats
```javascript
let lastHeartbeat = Date.now();

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'heartbeat') {
    lastHeartbeat = Date.now();
  }
};

// Check for stale connections
setInterval(() => {
  if (Date.now() - lastHeartbeat > 60000) {
    console.warn('No heartbeat received in 60s');
    eventSource.close();
    // Reconnect
  }
}, 10000);
```

## Testing

### Run Unit Tests
```bash
npm test -- match-event.service.spec.ts
```

### Test Memory Leaks
The test suite includes:
- Connection cycle tests (1000 iterations)
- Cleanup verification
- Map emptying validation
- Module destroy testing

### Load Testing
```bash
# Test with multiple concurrent connections
# Use tools like artillery or k6
artillery quick --count 100 --num 10 http://localhost:3000/matches/stream/match123
```

## Scalability Considerations

### Horizontal Scaling
For multiple server instances:
- Use Redis Pub/Sub for event distribution
- Shared connection tracking in Redis
- Sticky sessions or connection migration

### Vertical Scaling
- Current implementation supports up to 500 users per match
- Can handle thousands of concurrent connections
- Monitor memory usage with connection stats endpoint

## Troubleshooting

### Connections Not Cleaning Up
- Check response listeners are attached
- Verify finalize operator is used
- Check onModuleDestroy is called

### Memory Usage Growing
- Use `/matches/connections/stats` endpoint
- Check for empty Maps
- Verify cleanup in logs
- Run memory leak tests

### Heartbeat Not Received
- Check interval observable
- Verify merge operator
- Check client-side timeout settings

## Summary

This SSE implementation provides:
- ✅ Per-user connection tracking
- ✅ Automatic heartbeat every 30s
- ✅ Proper cleanup on disconnect
- ✅ Memory leak prevention
- ✅ Scalable architecture
- ✅ Comprehensive testing
- ✅ Connection statistics monitoring

The code is production-ready, well-documented, and designed for scalability.
