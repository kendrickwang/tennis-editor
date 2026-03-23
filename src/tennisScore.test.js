/**
 * tennisScore.test.js
 *
 * Regression tests for the pure scoring engine.
 * Key regressions covered:
 *   - No-ads: game must end immediately at deuce — no advantage state
 *   - Match tiebreak (10-pt): triggered at 1-1 sets, records actual scores
 *   - recomputeScores threads config so no-ads applies throughout a replay
 */

import {
  INITIAL_SCORE,
  addPoint,
  gameDisplayPoints,
  scoreLabel,
  computeServer,
  recomputeScores,
} from './tennisScore';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Play n points all won by `winner` starting from `score`. */
function playPoints(score, winner, n, config = {}) {
  let s = score;
  for (let i = 0; i < n; i++) s = addPoint(s, winner, config);
  return s;
}

/** Play an alternating sequence of winners from `score`. */
function playSequence(score, winners, config = {}) {
  return winners.reduce((s, w) => addPoint(s, w, config), score);
}

/** Win a complete set for `winner` (love sets). */
function winSet(score, winner, config = {}) {
  // 6 games (4 points each) = 24 points
  return playPoints(score, winner, 24, config);
}

// ── gameDisplayPoints ────────────────────────────────────────────────────────

describe('gameDisplayPoints', () => {
  test('shows 0 15 30 40 for normal progress', () => {
    expect(gameDisplayPoints(0, 0, false)).toEqual(['0', '0']);
    expect(gameDisplayPoints(1, 0, false)).toEqual(['15', '0']);
    expect(gameDisplayPoints(2, 1, false)).toEqual(['30', '15']);
    expect(gameDisplayPoints(3, 2, false)).toEqual(['40', '30']);
  });

  test('shows Deuce when both at 3+', () => {
    expect(gameDisplayPoints(3, 3, false)).toEqual(['Deuce', 'Deuce']);
    expect(gameDisplayPoints(4, 4, false)).toEqual(['Deuce', 'Deuce']);
  });

  test('shows Adv for the leading player at deuce', () => {
    expect(gameDisplayPoints(4, 3, false)).toEqual(['Adv', '40']);
    expect(gameDisplayPoints(3, 4, false)).toEqual(['40', 'Adv']);
  });

  test('returns raw counts in tiebreak mode', () => {
    expect(gameDisplayPoints(7, 5, true)).toEqual(['7', '5']);
    expect(gameDisplayPoints(10, 8, true)).toEqual(['10', '8']);
  });
});

// ── scoreLabel ───────────────────────────────────────────────────────────────

describe('scoreLabel', () => {
  test('returns dash-separated score string', () => {
    const score = { ...INITIAL_SCORE, currentGame: [1, 2] };
    expect(scoreLabel(score)).toBe('15–30');
  });

  test('returns Deuce at deuce', () => {
    const score = { ...INITIAL_SCORE, currentGame: [3, 3] };
    expect(scoreLabel(score)).toBe('Deuce');
  });

  test('returns Adv P1 / Adv P2', () => {
    expect(scoreLabel({ ...INITIAL_SCORE, currentGame: [4, 3] })).toBe('Adv P1');
    expect(scoreLabel({ ...INITIAL_SCORE, currentGame: [3, 4] })).toBe('Adv P2');
  });
});

// ── addPoint — no-ads regression ─────────────────────────────────────────────

describe('addPoint — no-ads scoring (regression)', () => {
  test('game ends immediately for winner 1 at deuce in no-ads mode', () => {
    // Get to deuce: 3 points each
    let s = playSequence(INITIAL_SCORE, [1, 1, 1, 2, 2, 2]);
    // At deuce (3-3), p1 wins → game should end, no Adv
    s = addPoint(s, 1, { noAds: true });
    expect(s.currentGame).toEqual([0, 0]); // game over → reset
    expect(s.currentSet[0]).toBe(1);       // p1 won a game
  });

  test('game ends immediately for winner 2 at deuce in no-ads mode', () => {
    let s = playSequence(INITIAL_SCORE, [1, 1, 1, 2, 2, 2]); // deuce
    s = addPoint(s, 2, { noAds: true });
    expect(s.currentGame).toEqual([0, 0]);
    expect(s.currentSet[1]).toBe(1); // p2 won a game
  });

  test('advantage IS given in ads mode at deuce', () => {
    let s = playSequence(INITIAL_SCORE, [1, 1, 1, 2, 2, 2]); // deuce
    s = addPoint(s, 1, { noAds: false }); // ads mode
    // Should still be in this game (advantage, not finished)
    expect(s.currentSet[0]).toBe(0);
    expect(s.currentGame[0]).toBeGreaterThan(3); // 4-3 = adv P1
  });

  test('advantage then win in ads mode', () => {
    let s = playSequence(INITIAL_SCORE, [1, 1, 1, 2, 2, 2]); // deuce (3-3)
    s = addPoint(s, 1, {}); // adv P1 (4-3)
    expect(s.currentGame).toEqual([4, 3]);
    s = addPoint(s, 1, {}); // win game
    expect(s.currentGame).toEqual([0, 0]);
    expect(s.currentSet[0]).toBe(1);
  });

  test('advantage reverts to deuce when other player wins point in ads mode', () => {
    let s = playSequence(INITIAL_SCORE, [1, 1, 1, 2, 2, 2]); // deuce (3-3)
    s = addPoint(s, 1, {}); // adv P1 (4-3)
    s = addPoint(s, 2, {}); // back to deuce (3-3)
    expect(s.currentGame).toEqual([3, 3]);
  });

  test('no-ads config: recomputeScores threads config — no adv in replayed sequence', () => {
    // Build a point array that goes through deuce
    const points = [
      { id: 1, startTime: 0,  endTime: 1,  winner: 1 },
      { id: 2, startTime: 1,  endTime: 2,  winner: 1 },
      { id: 3, startTime: 2,  endTime: 3,  winner: 1 },
      { id: 4, startTime: 3,  endTime: 4,  winner: 2 },
      { id: 5, startTime: 4,  endTime: 5,  winner: 2 },
      { id: 6, startTime: 5,  endTime: 6,  winner: 2 },
      // At deuce (3-3 in game). Winner=1 wins next point → game ends in no-ads.
      { id: 7, startTime: 6,  endTime: 7,  winner: 1 },
    ];
    const { finalScore } = recomputeScores(points, 0, { noAds: true });
    // P1 won the game immediately at deuce — 1 game in the set
    expect(finalScore.currentSet[0]).toBe(1);
    expect(finalScore.currentSet[1]).toBe(0);
    // No advantage stuck in game state
    expect(finalScore.currentGame).toEqual([0, 0]);
  });
});

// ── addPoint — standard game flow ────────────────────────────────────────────

describe('addPoint — standard game flow', () => {
  test('love game: 4 points by same player wins the game', () => {
    const s = playPoints(INITIAL_SCORE, 1, 4);
    expect(s.currentSet[0]).toBe(1);
    expect(s.currentGame).toEqual([0, 0]);
  });

  test('points accumulate: 0→1→2→3 before game is won', () => {
    let s = INITIAL_SCORE;
    s = addPoint(s, 1); expect(s.currentGame[0]).toBe(1);
    s = addPoint(s, 1); expect(s.currentGame[0]).toBe(2);
    s = addPoint(s, 1); expect(s.currentGame[0]).toBe(3);
    // Not yet won
    expect(s.currentSet[0]).toBe(0);
  });

  test('does not end match until 2 sets won', () => {
    let s = winSet(INITIAL_SCORE, 1);
    expect(s.sets.length).toBe(1);
    expect(s.matchWinner).toBeNull();
  });

  test('matchWinner set after 2 sets', () => {
    let s = winSet(INITIAL_SCORE, 1);
    s = winSet(s, 1);
    expect(s.matchWinner).toBe(1);
  });

  test('addPoint is a no-op after matchWinner is set', () => {
    let s = winSet(INITIAL_SCORE, 1);
    s = winSet(s, 1);
    const before = s;
    const after = addPoint(s, 2);
    expect(after).toBe(before); // same reference — no mutation
  });
});

// ── addPoint — set transitions ────────────────────────────────────────────────

describe('addPoint — set and tiebreak transitions', () => {
  test('set won at 6-0', () => {
    const s = winSet(INITIAL_SCORE, 1);
    expect(s.sets).toEqual([{ p1: 6, p2: 0 }]);
    expect(s.currentSet).toEqual([0, 0]);
  });

  test('set won at 6-4 (not before)', () => {
    // Win 6 games, opponent wins 4
    let s = INITIAL_SCORE;
    for (let i = 0; i < 4; i++) {
      s = playPoints(s, 1, 4); // p1 wins a game
      s = playPoints(s, 2, 4); // p2 wins a game
    }
    // 4-4 so far; now p1 wins 2 more
    s = playPoints(s, 1, 4);
    s = playPoints(s, 1, 4);
    expect(s.sets).toEqual([{ p1: 6, p2: 4 }]);
  });

  test('tiebreak triggered at 6-6', () => {
    // Play to 6-6 by alternating game wins
    let s = INITIAL_SCORE;
    for (let i = 0; i < 6; i++) {
      s = playPoints(s, 1, 4);
      s = playPoints(s, 2, 4);
    }
    expect(s.isTiebreak).toBe(true);
    expect(s.currentSet).toEqual([6, 6]);
  });

  test('regular tiebreak won at 7-5 (win by 2)', () => {
    // Get to 6-6 tiebreak
    let s = INITIAL_SCORE;
    for (let i = 0; i < 6; i++) {
      s = playPoints(s, 1, 4);
      s = playPoints(s, 2, 4);
    }
    expect(s.isTiebreak).toBe(true);
    // P1 wins 7-5 in tiebreak
    for (let i = 0; i < 5; i++) { s = addPoint(s, 1); s = addPoint(s, 2); } // 5-5
    s = addPoint(s, 1); // 6-5
    s = addPoint(s, 1); // 7-5 → set won
    expect(s.sets[0]).toEqual({ p1: 7, p2: 6, tiebreak: 5 });
    expect(s.isTiebreak).toBe(false);
  });

  test('regular tiebreak does not end at 7-6 (must win by 2)', () => {
    let s = INITIAL_SCORE;
    for (let i = 0; i < 6; i++) {
      s = playPoints(s, 1, 4);
      s = playPoints(s, 2, 4);
    }
    // Get to 6-6 in tiebreak
    for (let i = 0; i < 6; i++) { s = addPoint(s, 1); s = addPoint(s, 2); }
    s = addPoint(s, 1); // 7-6 — not over yet
    expect(s.isTiebreak).toBe(true);
    expect(s.currentGame).toEqual([7, 6]);
  });
});

// ── addPoint — match tiebreak ─────────────────────────────────────────────────

describe('addPoint — match tiebreak (10-pt) config', () => {
  /** Helper: play to exactly 1-1 in sets */
  function getToOneOne(config = {}) {
    let s = winSet(INITIAL_SCORE, 1, config);
    s = winSet(s, 2, config);
    return s;
  }

  test('at 1-1 sets with matchTiebreak config → enters 10-pt tiebreak', () => {
    const s = getToOneOne({ matchTiebreak: true });
    expect(s.isTiebreak).toBe(true);
    expect(s.matchTiebreakActive).toBe(true);
    expect(s.currentSet).toEqual([0, 0]);
  });

  test('at 1-1 sets WITHOUT matchTiebreak config → plays normal 3rd set', () => {
    const s = getToOneOne({});
    expect(s.isTiebreak).toBe(false);
    expect(s.matchTiebreakActive).toBe(false);
  });

  test('match tiebreak does not end at 9-8 (must reach 10, win by 2)', () => {
    let s = getToOneOne({ matchTiebreak: true });
    for (let i = 0; i < 8; i++) { s = addPoint(s, 1, { matchTiebreak: true }); s = addPoint(s, 2, { matchTiebreak: true }); }
    s = addPoint(s, 1, { matchTiebreak: true }); // 9-8
    expect(s.isTiebreak).toBe(true);
    expect(s.matchTiebreakActive).toBe(true);
  });

  test('match tiebreak won at 10-8 (10+ and lead by 2)', () => {
    let s = getToOneOne({ matchTiebreak: true });
    for (let i = 0; i < 8; i++) { s = addPoint(s, 1, { matchTiebreak: true }); s = addPoint(s, 2, { matchTiebreak: true }); }
    s = addPoint(s, 1, { matchTiebreak: true }); // 9-8
    s = addPoint(s, 1, { matchTiebreak: true }); // 10-8 → won
    expect(s.isTiebreak).toBe(false);
    expect(s.matchTiebreakActive).toBe(false);
    expect(s.matchWinner).toBe(1);
  });

  test('match tiebreak records actual scores (not 7-6)', () => {
    let s = getToOneOne({ matchTiebreak: true });
    // P1 wins 10-7
    for (let i = 0; i < 7; i++) { s = addPoint(s, 1, { matchTiebreak: true }); s = addPoint(s, 2, { matchTiebreak: true }); }
    s = addPoint(s, 1, { matchTiebreak: true }); // 8-7
    s = addPoint(s, 1, { matchTiebreak: true }); // 9-7
    s = addPoint(s, 1, { matchTiebreak: true }); // 10-7 → won
    const lastSet = s.sets[s.sets.length - 1];
    expect(lastSet.p1).toBe(10);
    expect(lastSet.p2).toBe(7);
    expect(lastSet.tiebreak).toBeUndefined(); // match tiebreak doesn't use tiebreak superscript
  });
});

// ── recomputeScores ───────────────────────────────────────────────────────────

describe('recomputeScores', () => {
  test('empty points array → finalScore equals INITIAL_SCORE', () => {
    const { points, finalScore } = recomputeScores([], 0);
    expect(points).toEqual([]);
    expect(finalScore).toEqual(INITIAL_SCORE);
  });

  test('stamps scoreBefore on each point', () => {
    const pts = [
      { id: 1, startTime: 0, endTime: 1, winner: 1 },
      { id: 2, startTime: 1, endTime: 2, winner: 1 },
    ];
    const { points } = recomputeScores(pts, 0);
    expect(points[0].scoreBefore).toEqual(INITIAL_SCORE);
    expect(points[1].scoreBefore.currentGame[0]).toBe(1); // after first point
  });

  test('returns correct finalScore.matchWinner after 2 sets won', () => {
    // Build 48 points: p1 wins everything (2 sets × 6 games × 4 pts)
    const pts = Array.from({ length: 48 }, (_, i) => ({
      id: i + 1, startTime: i, endTime: i + 1, winner: 1,
    }));
    const { finalScore } = recomputeScores(pts, 0);
    expect(finalScore.matchWinner).toBe(1);
  });

  test('sorts points by startTime before replaying', () => {
    // Out-of-order input — should still compute the same result
    const pts = [
      { id: 2, startTime: 1, endTime: 2, winner: 1 },
      { id: 1, startTime: 0, endTime: 1, winner: 1 },
    ];
    const { points } = recomputeScores(pts, 0);
    expect(points[0].id).toBe(1); // sorted first
    expect(points[1].id).toBe(2);
  });
});

// ── computeServer ─────────────────────────────────────────────────────────────

describe('computeServer', () => {
  test('first game served by initialServer', () => {
    expect(computeServer(INITIAL_SCORE, 0)).toBe(0);
    expect(computeServer(INITIAL_SCORE, 1)).toBe(1);
  });

  test('server alternates each game', () => {
    // After 1 game (e.g. sets:[], currentSet:[1,0])
    const afterOneGame = { ...INITIAL_SCORE, currentSet: [1, 0] };
    expect(computeServer(afterOneGame, 0)).toBe(1);
    expect(computeServer(afterOneGame, 1)).toBe(0);
  });

  test('server at start of tiebreak is correct (total games = 12)', () => {
    // 6-6 in set, no completed sets → totalGames=12, gameServer = (init+12)%2
    const tbScore = { ...INITIAL_SCORE, currentSet: [6, 6], isTiebreak: true, currentGame: [0, 0] };
    // initialServer=0: 12%2=0 → still P1
    expect(computeServer(tbScore, 0)).toBe(0);
  });

  test('tiebreak server alternates: first 1 pt, then every 2 pts', () => {
    const base = { ...INITIAL_SCORE, currentSet: [6, 6], isTiebreak: true };
    // tbPoints=0 → gameServer
    expect(computeServer({ ...base, currentGame: [0, 0] }, 0)).toBe(0);
    // tbPoints=1 → other server
    expect(computeServer({ ...base, currentGame: [1, 0] }, 0)).toBe(1);
    // tbPoints=2 → other server (same as point 1)
    expect(computeServer({ ...base, currentGame: [2, 0] }, 0)).toBe(1);
    // tbPoints=3 → back to original
    expect(computeServer({ ...base, currentGame: [3, 0] }, 0)).toBe(0);
  });
});
