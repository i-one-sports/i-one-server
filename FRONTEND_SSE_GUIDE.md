# 🔥 Real-Time Match Updates - Frontend Integration Guide

## 🎯 Overview
This guide shows how to integrate **Server-Sent Events (SSE)** for real-time match score updates in React Native and React applications.

---

## 📡 Available SSE Endpoints

### **1. Single Match Updates**
```
GET /i-one/matches/stream/{matchId}
```
**Use Case:** Watch live scores for a specific match

### **2. All Matches Updates**  
```
GET /i-one/matches/stream
```
**Use Case:** Admin dashboard, tournament overview

---

## ⚛️ React Implementation

### **Installation**
```bash
npm install eventsource
# or
yarn add eventsource
```

### **Basic Hook for Single Match**
```javascript
import { useState, useEffect } from 'react';

const useMatchScore = (matchId) => {
  const [matchData, setMatchData] = useState({
    teamOneScore: 0,
    teamTwoScore: 0,
    connected: false,
    error: null
  });

  useEffect(() => {
    if (!matchId) return;

    const eventSource = new EventSource(
      `http://localhost:3000/i-one/matches/stream/${matchId}`
    );

    eventSource.onopen = () => {
      console.log('✅ SSE Connected to match:', matchId);
      setMatchData(prev => ({ ...prev, connected: true, error: null }));
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'connected') {
          console.log('🎯 Match stream connected:', data.message);
          return;
        }

        if (data.type === 'heartbeat') {
          console.log('💓 Heartbeat received');
          return;
        }

        if (data.type === 'error') {
          console.log('⚠️ Stream error:', data.message);
          setMatchData(prev => ({ ...prev, error: data.message }));
          return;
        }

        // Score update
        if (data.matchId && data.teamOneScore !== undefined) {
          setMatchData(prev => ({
            ...prev,
            teamOneScore: data.teamOneScore,
            teamTwoScore: data.teamTwoScore,
            error: null
          }));
        }
      } catch (error) {
        console.error('❌ Failed to parse SSE data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('❌ SSE Error:', error);
      setMatchData(prev => ({ 
        ...prev, 
        connected: false, 
        error: 'Connection lost. Retrying...' 
      }));
    };

    return () => {
      eventSource.close();
      console.log('🔌 SSE Connection closed for match:', matchId);
    };
  }, [matchId]);

  return matchData;
};

export default useMatchScore;
```

### **React Component Example**
```javascript
import React from 'react';
import useMatchScore from './hooks/useMatchScore';

const MatchScoreboard = ({ matchId }) => {
  const { teamOneScore, teamTwoScore, connected, error } = useMatchScore(matchId);

  return (
    <div className="scoreboard">
      <div className="connection-status">
        {connected ? (
          <span style={{ color: 'green' }}>🟢 Live</span>
        ) : (
          <span style={{ color: 'red' }}>🔴 Connecting...</span>
        )}
        {error && <span style={{ color: 'orange' }}>⚠️ {error}</span>}
      </div>
      
      <div className="scores">
        <div className="team">
          <h3>Team One</h3>
          <span className="score">{teamOneScore}</span>
        </div>
        
        <div className="vs">VS</div>
        
        <div className="team">
          <h3>Team Two</h3>
          <span className="score">{teamTwoScore}</span>
        </div>
      </div>
    </div>
  );
};

export default MatchScoreboard;
```

---

## 📱 React Native Implementation

### **Installation**
```bash
npm install react-native-sse
# or
yarn add react-native-sse
```

### **React Native Hook**
```javascript
import { useState, useEffect } from 'react';
import { EventSource } from 'react-native-sse';

const useMatchScore = (matchId) => {
  const [matchData, setMatchData] = useState({
    teamOneScore: 0,
    teamTwoScore: 0,
    connected: false,
    error: null
  });

  useEffect(() => {
    if (!matchId) return;

    const eventSource = new EventSource(
      `http://localhost:3000/i-one/matches/stream/${matchId}`,
      {
        headers: {
          'Cache-Control': 'no-cache',
        },
      }
    );

    eventSource.addEventListener('open', () => {
      console.log('✅ SSE Connected to match:', matchId);
      setMatchData(prev => ({ ...prev, connected: true, error: null }));
    });

    eventSource.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'connected') {
          console.log('🎯 Match stream connected:', data.message);
          return;
        }

        if (data.type === 'heartbeat') {
          console.log('💓 Heartbeat received');
          return;
        }

        if (data.type === 'error') {
          console.log('⚠️ Stream error:', data.message);
          setMatchData(prev => ({ ...prev, error: data.message }));
          return;
        }

        // Score update
        if (data.matchId && data.teamOneScore !== undefined) {
          setMatchData(prev => ({
            ...prev,
            teamOneScore: data.teamOneScore,
            teamTwoScore: data.teamTwoScore,
            error: null
          }));
        }
      } catch (error) {
        console.error('❌ Failed to parse SSE data:', error);
      }
    });

    eventSource.addEventListener('error', (error) => {
      console.error('❌ SSE Error:', error);
      setMatchData(prev => ({ 
        ...prev, 
        connected: false, 
        error: 'Connection lost. Retrying...' 
      }));
    });

    return () => {
      eventSource.close();
      console.log('🔌 SSE Connection closed for match:', matchId);
    };
  }, [matchId]);

  return matchData;
};

export default useMatchScore;
```

### **React Native Component**
```javascript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import useMatchScore from './hooks/useMatchScore';

const MatchScoreboard = ({ matchId }) => {
  const { teamOneScore, teamTwoScore, connected, error } = useMatchScore(matchId);

  return (
    <View style={styles.container}>
      <View style={styles.statusBar}>
        <Text style={[styles.status, { color: connected ? 'green' : 'red' }]}>
          {connected ? '🟢 Live' : '🔴 Connecting...'}
        </Text>
        {error && <Text style={styles.error}>⚠️ {error}</Text>}
      </View>
      
      <View style={styles.scoreboard}>
        <View style={styles.team}>
          <Text style={styles.teamName}>Team One</Text>
          <Text style={styles.score}>{teamOneScore}</Text>
        </View>
        
        <Text style={styles.vs}>VS</Text>
        
        <View style={styles.team}>
          <Text style={styles.teamName}>Team Two</Text>
          <Text style={styles.score}>{teamTwoScore}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    margin: 10,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  status: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  error: {
    fontSize: 12,
    color: 'orange',
  },
  scoreboard: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  team: {
    alignItems: 'center',
  },
  teamName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  score: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  vs: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
  },
});

export default MatchScoreboard;
```

---

## 🏆 Advanced: Tournament Dashboard (All Matches)

### **Hook for All Matches**
```javascript
const useTournamentMatches = () => {
  const [matches, setMatches] = useState({});
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource(
      `http://localhost:3000/i-one/matches/stream`
    );

    eventSource.onopen = () => {
      console.log('✅ Connected to tournament stream');
      setConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'connected' || data.type === 'heartbeat') {
          return;
        }

        if (data.matchId && data.teamOneScore !== undefined) {
          setMatches(prev => ({
            ...prev,
            [data.matchId]: {
              teamOneScore: data.teamOneScore,
              teamTwoScore: data.teamTwoScore,
              lastUpdate: new Date().toISOString()
            }
          }));
        }
      } catch (error) {
        console.error('❌ Failed to parse tournament data:', error);
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
    };

    return () => eventSource.close();
  }, []);

  return { matches, connected };
};
```

---

## 🔧 Configuration & Tips

### **Environment Setup**
```javascript
// config.js
export const API_BASE_URL = __DEV__ 
  ? 'http://localhost:3000' 
  : 'https://your-production-api.com';

export const SSE_ENDPOINTS = {
  singleMatch: (matchId) => `${API_BASE_URL}/i-one/matches/stream/${matchId}`,
  allMatches: () => `${API_BASE_URL}/i-one/matches/stream`
};
```

### **Error Handling Best Practices**
```javascript
const useSSEWithRetry = (url, maxRetries = 3) => {
  const [retryCount, setRetryCount] = useState(0);
  
  useEffect(() => {
    if (retryCount >= maxRetries) {
      console.log('❌ Max retries reached');
      return;
    }

    const eventSource = new EventSource(url);
    
    eventSource.onerror = () => {
      setTimeout(() => {
        setRetryCount(prev => prev + 1);
      }, 1000 * Math.pow(2, retryCount)); // Exponential backoff
    };

    return () => eventSource.close();
  }, [url, retryCount, maxRetries]);
};
```

### **Performance Optimization**
```javascript
// Debounce rapid updates
import { useDebouncedCallback } from 'use-debounce';

const debouncedScoreUpdate = useDebouncedCallback((newScore) => {
  setMatchData(newScore);
}, 100); // Wait 100ms between updates
```

---

## 🧪 Testing Your Integration

### **1. Basic Connection Test**
```javascript
const testSSE = (matchId) => {
  const eventSource = new EventSource(
    `http://localhost:3000/i-one/matches/stream/${matchId}`
  );
  
  eventSource.onmessage = (event) => {
    console.log('📡 Received:', event.data);
  };
  
  // Close after 30 seconds
  setTimeout(() => eventSource.close(), 30000);
};
```

### **2. Trigger Score Updates**
Use Postman or curl to test score updates:
```bash
curl -X PUT "http://localhost:3000/i-one/matches/increment-score/{matchId}?team=teamOne"
```

---

## 🔍 Troubleshooting

### **Common Issues:**

| Problem | Solution |
|---------|----------|
| Connection fails | Check URL includes `/i-one` prefix |
| No data received | Verify matchId exists in database |
| Frequent disconnects | Implement exponential backoff retry |
| Memory leaks | Always close EventSource in cleanup |
| CORS errors | Ensure proper headers in backend |

### **Debug Logs:**
```javascript
// Add to your hooks for debugging
console.log('🔍 SSE URL:', url);
console.log('🔍 Match ID:', matchId);
console.log('🔍 Connection state:', connected);
console.log('🔍 Current scores:', teamOneScore, teamTwoScore);
```

---

## 🚀 Ready to Go!

You now have everything needed to implement real-time match updates in your React/React Native apps. The SSE connection will automatically handle reconnections, provide heartbeat monitoring, and deliver instant score updates with minimal latency.

**Start with the single match hook and expand from there!** 🎯