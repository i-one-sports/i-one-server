import { scoreRating } from './rating.service';

describe('scoreRating', () => {
  const byKey = (r: any) => Object.fromEntries(r.components.map((c: any) => [c.key, c.score]));

  it('reproduces the Forward profile design: 5.7', () => {
    // 12 sessions, 14 goals + 8 assists, 60% games won, 40% sessions won, 18% vote share
    const r = scoreRating({ sessions: 12, contributions: 22, gamesPlayed: 20, gamesWon: 12, sessionsWon: 4.8, voteShare: 0.18 });
    expect(r.rating).toBe(5.7);
    expect(byKey(r)).toEqual({ contribution: 2.1, setWin: 1.2, sessionWin: 0.6, votes: 1.2, experience: 0.6 });
  });

  it('reproduces the Defender profile design: 5.2 (clean sheets in contribution)', () => {
    // 12 sessions, 1 goal + 2 assists + 11 clean sheets, 65% games won, 60% sessions won, 15% vote share
    const r = scoreRating({ sessions: 12, contributions: 14, gamesPlayed: 20, gamesWon: 13, sessionsWon: 7.2, voteShare: 0.15 });
    expect(r.rating).toBe(5.2);
    expect(byKey(r)).toEqual({ contribution: 1.4, setWin: 1.3, sessionWin: 0.9, votes: 1.0, experience: 0.6 });
  });

  it('caps every part at its maximum: 10 is the ceiling', () => {
    const r = scoreRating({ sessions: 40, contributions: 400, gamesPlayed: 10, gamesWon: 10, sessionsWon: 40, voteShare: 0.9 });
    expect(r.rating).toBe(10);
  });

  it('no counted sessions: no rating', () => {
    expect(scoreRating({ sessions: 0, contributions: 0, gamesPlayed: 0, gamesWon: 0, sessionsWon: 0, voteShare: 0 }).rating).toBeNull();
  });
});
