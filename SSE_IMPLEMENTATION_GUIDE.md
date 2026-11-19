# SSE (Server-Sent Events) Implementation Guide

## Overview
This guide explains the improved SSE implementation for real-time match score updates with robust connection management, heartbeat mechanism, and memory leak prevention. The implementation supports three types of streams: single match, session-based (all matches in a location/session), and global (all matches).

## Key Features

### ✅ 1. User-Based Connection Tracking
- Each physical connection gets a unique ID: `type:userId:timestamp:random`
- Supports multiple tabs: same user can open same match in multiple tabs
- Each user can have up to 10 concurrent connections (across all types)
- Each match can have up to 500 unique users
- Connections are typed: 'match', 'session', or 'global'
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
- Unique connection IDs prevent duplicate entries
- Empty user Sets automatically removed from Maps
- Connection details include timestamp and type for tracking
- Proper unsubscribe and finalize operators in RxJS streams
- Module lifecycle management with onModuleDestroy
- All Maps cleared on shutdown

## Architecture

### Connection ID Format

Each connection gets a unique identifier:
```typescript
const connectionId = `${type}:${userId}:${timestamp}:${random}`;
// Example: "match:user123:1704672123456:x9k2m5p8q"
```

**Benefits:**
- Supports multiple tabs/windows per user
- Easy to identify connection type from ID
- Timestamp helps with debugging
- Random suffix ensures uniqueness

### MatchEventService
Central service managing all SSE connections and events.

**Key Methods:**
- `addConnection(userId, type, options?)` - Track new connection with type ('match', 'session', or 'global')
- `removeConnection(connectionId)` - Cleanup connection by unique ID
- `canConnect(userId, type, resourceId?)` - Check connection limits based on type
- `emitMatchScoreUpdate(event)` - Emit score updates
- `getScoreUpdates()` - Get score update observable
- `getHeartbeat()` - Get heartbeat observable
- `getConnectionStats()` - Get detailed connection statistics

**Data Structures:**
```typescript
userConnections: Map<userId, Set<connectionId>>
connectionDetails: Map<connectionId, ConnectionInfo>

interface ConnectionInfo {
  connectionId: string;      // Unique ID per connection
  userId: string;            // Who is connected
  type: 'match' | 'session' | 'global';  // Stream type
  matchId?: string;          // For match streams
  sessionId?: string;        // For session streams
  connectedAt: Date;         // When connected
}
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

#### 2. Session Stream
```
GET /matches/stream/session/:sessionId
```
- Requires JWT authentication
- Tracks user connection to specific session
- Filters events for all matches in the session
- Includes heartbeat
- **Use Case**: User viewing all matches at a specific location/session

**Response Format:**
```json
{
  "type": "connected",
  "message": "Session stream connected",
  "sessionId": "session789",
  "userId": "user456",
  "timestamp": 1704672000000
}
```

#### 3. Global Stream
```
GET /matches/stream
```
- Requires JWT authentication
- Receives all match updates across all sessions
- Includes heartbeat
- Uses pseudo-matchId for tracking
- **Use Case**: Admin dashboard showing all matches

#### 4. Connection Statistics
```
GET /matches/connections/stats
```
- Returns current connection statistics
- Useful for monitoring and debugging

**Response Format:**
```json
{
  "totalUsers": 5,
  "totalConnections": 12,
  "byType": {
    "match": 8,
    "session": 3,
    "global": 1
  },
  "userConnections": [
    {
      "userId": "user1",
      "connectionCount": 3,
      "byType": {
        "match": 2,
        "session": 1,
        "global": 0
      }
    }
  ],
  "matchConnections": [
    {
      "matchId": "match1",
      "connectionCount": 5,
      "uniqueUsers": 3
    }
  ],
  "sessionConnections": [
    {
      "sessionId": "session456",
      "connectionCount": 3,
      "uniqueUsers": 2
    }
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
      // Update UI with team names and scores
      updateMatchDisplay({
        teamOneName: data.teamOne.name,
        teamOneScore: data.teamOneScore,
        teamTwoName: data.teamTwo.name,
        teamTwoScore: data.teamTwoScore
      });
      // Example: "Thunder Strikers 3 - 2 Lightning Warriors"
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

### Connecting to Session Stream
```javascript
const sessionId = 'session789';
const eventSource = new EventSource(
  `/matches/stream/session/${sessionId}`,
  { withCredentials: true }
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch(data.type) {
    case 'connected':
      console.log('Connected to session stream');
      break;
    
    case 'score-update':
      // Update specific match in the session with team names
      updateMatchInSession({
        matchId: data.matchId,
        teamOneName: data.teamOne.name,
        teamOneScore: data.teamOneScore,
        teamTwoName: data.teamTwo.name,
        teamTwoScore: data.teamTwoScore
      });
      // Display: "Thunder Strikers 3 - 2 Lightning Warriors"
      break;
    
    case 'heartbeat':
      console.log('Heartbeat:', data.timestamp);
      break;
  }
};

// Cleanup
eventSource.close();
```

**Example: Display All Matches in a Session**
```javascript
// Store matches in state
const [sessionMatches, setSessionMatches] = useState({});

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'score-update') {
    setSessionMatches(prev => ({
      ...prev,
      [data.matchId]: {
        teamOne: data.teamOne.name,
        teamTwo: data.teamTwo.name,
        score: `${data.teamOneScore} - ${data.teamTwoScore}`
      }
    }));
  }
};

// Render:
// Match 1: Thunder Strikers 3 - 2 Lightning Warriors
// Match 2: Fire Dragons 1 - 0 Ice Phoenix
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
    // Handle updates for any match across all sessions with full team info
    updateMatchScore({
      matchId: data.matchId,
      sessionId: data.sessionId,
      teamOne: data.teamOne.name,
      teamTwo: data.teamTwo.name,
      score: `${data.teamOneScore} - ${data.teamTwoScore}`
    });
    
    // Example display:
    // "Location A: Thunder Strikers 3 - 2 Lightning Warriors"
    // "Location B: Fire Dragons 1 - 0 Ice Phoenix"
  }
};
```

**Example: Admin Dashboard Displaying All Matches**
```javascript
const [allMatches, setAllMatches] = useState({});

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'score-update') {
    setAllMatches(prev => ({
      ...prev,
      [data.matchId]: {
        sessionId: data.sessionId,
        matchup: `${data.teamOne.name} vs ${data.teamTwo.name}`,
        score: `${data.teamOneScore} - ${data.teamTwoScore}`,
        lastUpdate: new Date(data.timestamp)
      }
    }));
  }
};

// Render all matches grouped by session:
// Session Location A:
//   - Thunder Strikers 3 - 2 Lightning Warriors (Updated 2s ago)
//   - Fire Dragons 1 - 0 Ice Phoenix (Updated 45s ago)
// Session Location B:
//   - Storm Eagles 2 - 2 Wave Riders (Updated 10s ago)
```

## Stream Types Comparison

| Stream Type | Endpoint | Filter | Use Case | Example |
|-------------|----------|--------|----------|----------|
| **Single Match** | `/matches/stream/:matchId` | `matchId` only | User watching one specific match | Match details page |
| **Session Stream** | `/matches/stream/session/:sessionId` | `sessionId` (all matches in session) | User viewing matches at a location | Location/Session dashboard |
| **Global Stream** | `/matches/stream` | No filter (all matches) | Admin monitoring all matches | Admin panel |

### How Filtering Works

```typescript
// Score update is emitted with both matchId and sessionId
emitMatchScoreUpdate({
  matchId: 'match123',
  sessionId: 'session456',
  teamOneScore: 3,
  teamTwoScore: 2
});

// Single match stream: filters by matchId
filter(update => update.matchId === 'match123')

// Session stream: filters by sessionId
filter(update => update.sessionId === 'session456')

// Global stream: no filter, receives everything
```

### Real-World Example

**Scenario**: Location A has Match 1 & Match 2, Location B has Match 3

```javascript
// User connects to Location A session stream
GET /matches/stream/session/locationA

// When Match 1 scores:
// ✅ Session A stream receives update
// ✅ Global stream receives update
// ❌ Session B stream does NOT receive

// When Match 3 scores:
// ✅ Session B stream receives update
// ✅ Global stream receives update
// ❌ Session A stream does NOT receive
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
  sessionId?: string,
  locationId?: string,
  teamOne: {
    id: string,
    name: string
  },
  teamTwo: {
    id: string,
    name: string
  },
  teamOneScore: number,
  teamTwoScore: number,
  timestamp: number
}
```

**Example:**
```json
{
  "type": "score-update",
  "matchId": "64f8a1b2c3d4e5f6a7b8c9d0",
  "sessionId": "64f8a1b2c3d4e5f6a7b8c9d1",
  "teamOne": {
    "id": "64f8a1b2c3d4e5f6a7b8c9d2",
    "name": "Thunder Strikers"
  },
  "teamTwo": {
    "id": "64f8a1b2c3d4e5f6a7b8c9d3",
    "name": "Lightning Warriors"
  },
  "teamOneScore": 3,
  "teamTwoScore": 2,
  "timestamp": 1704672123456
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
