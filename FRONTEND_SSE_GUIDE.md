# 🔥 Real-Time Match Updates - Frontend Guide

## 📡 SSE Endpoints

### **Single Match Updates**
```
GET /i-one/matches/stream/{matchId}
Authorization: Bearer <your-token>
Accept: text/event-stream
```

### **All Matches Updates**  
```
GET /i-one/matches/stream
Authorization: Bearer <your-token>
Accept: text/event-stream
```

---

## ⚛️ React Implementation

### **Install Package**
```bash
npm install eventsource
```

### **Basic Hook**
```javascript
import { useState, useEffect } from 'react';

const useMatchScore = (matchId) => {
  const [scores, setScores] = useState({
    teamOneScore: 0,
    teamTwoScore: 0,
    connected: false
  });

  useEffect(() => {
    if (!matchId) return;

    const eventSource = new EventSource(
      `http://localhost:3000/i-one/matches/stream/${matchId}`
    );

    eventSource.onopen = () => {
      setScores(prev => ({ ...prev, connected: true }));
    };

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      // Score update
      if (data.teamOneScore !== undefined) {
        setScores(prev => ({
          ...prev,
          teamOneScore: data.teamOneScore,
          teamTwoScore: data.teamTwoScore
        }));
      }
    };

    eventSource.onerror = () => {
      setScores(prev => ({ ...prev, connected: false }));
    };

    return () => eventSource.close();
  }, [matchId]);

  return scores;
};

export default useMatchScore;
```

### **Component Usage**
```javascript
import useMatchScore from './useMatchScore';

const Scoreboard = ({ matchId }) => {
  const { teamOneScore, teamTwoScore, connected } = useMatchScore(matchId);

  return (
    <div>
      <div>Status: {connected ? '🟢 Live' : '🔴 Offline'}</div>
      <div>Team One: {teamOneScore}</div>
      <div>Team Two: {teamTwoScore}</div>
    </div>
  );
};
```

---

## 📱 React Native Implementation

### **Install Package**
```bash
npm install react-native-sse
```

### **Basic Hook**
```javascript
import { useState, useEffect } from 'react';
import { EventSource } from 'react-native-sse';

const useMatchScore = (matchId) => {
  const [scores, setScores] = useState({
    teamOneScore: 0,
    teamTwoScore: 0,
    connected: false
  });

  useEffect(() => {
    if (!matchId) return;

    const eventSource = new EventSource(
      `http://localhost:3000/i-one/matches/stream/${matchId}`
    );

    eventSource.addEventListener('open', () => {
      setScores(prev => ({ ...prev, connected: true }));
    });

    eventSource.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      
      if (data.teamOneScore !== undefined) {
        setScores(prev => ({
          ...prev,
          teamOneScore: data.teamOneScore,
          teamTwoScore: data.teamTwoScore
        }));
      }
    });

    eventSource.addEventListener('error', () => {
      setScores(prev => ({ ...prev, connected: false }));
    });

    return () => eventSource.close();
  }, [matchId]);

  return scores;
};

export default useMatchScore;
```

### **Component Usage**
```javascript
import { View, Text } from 'react-native';
import useMatchScore from './useMatchScore';

const Scoreboard = ({ matchId }) => {
  const { teamOneScore, teamTwoScore, connected } = useMatchScore(matchId);

  return (
    <View>
      <Text>Status: {connected ? '🟢 Live' : '🔴 Offline'}</Text>
      <Text>Team One: {teamOneScore}</Text>
      <Text>Team Two: {teamTwoScore}</Text>
    </View>
  );
};
```

---

## 🔧 What You Get

### **Connection Events:**
```javascript
data: {"type": "connected", "message": "Connection established"}
```

### **Score Updates:**
```javascript
data: {"matchId": "123", "teamOneScore": 2, "teamTwoScore": 1}
```

### **Heartbeat (every 30s):**
```javascript
data: {"type": "heartbeat", "timestamp": 1732896234567}
```

---

## 🧪 Test Your Connection

```javascript
// Simple test
const eventSource = new EventSource(
  'http://localhost:3000/i-one/matches/stream/your-match-id'
);

eventSource.onmessage = (event) => {
  console.log('Received:', event.data);
};
```

---

## 🚀 That's It!

Use the hooks above to get live match scores. The connection handles reconnection automatically.