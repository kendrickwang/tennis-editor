export const INITIAL_SCORE = {
  sets: [],            // [{p1, p2}, ...] completed sets
  currentSet: [0, 0],  // games in current set
  currentGame: [0, 0], // raw point counts (0-4 scale; tiebreak = raw counts)
  isTiebreak: false,
  matchWinner: null,   // 1 | 2 | null
};

const PTS = ['0', '15', '30', '40'];

// Returns display strings for both players' current game points
export function gameDisplayPoints(p1, p2, isTiebreak) {
  if (isTiebreak) return [String(p1), String(p2)];
  if (p1 >= 3 && p2 >= 3) {
    if (p1 === p2) return ['Deuce', 'Deuce'];
    return p1 > p2 ? ['Adv', '40'] : ['40', 'Adv'];
  }
  return [PTS[Math.min(p1, 3)] ?? '?', PTS[Math.min(p2, 3)] ?? '?'];
}

// Compact label for timeline use
export function scoreLabel(score) {
  const [d1, d2] = gameDisplayPoints(
    score.currentGame[0], score.currentGame[1], score.isTiebreak
  );
  if (d1 === 'Deuce') return 'Deuce';
  if (d1 === 'Adv') return 'Adv P1';
  if (d2 === 'Adv') return 'Adv P2';
  return `${d1}–${d2}`;
}

// Game score label for the current set (e.g. "3–2")
export function gameScoreLabel(score) {
  return `${score.currentSet[0]}–${score.currentSet[1]}`;
}

function scoreGamePoint(p1, p2, winner) {
  // Both at 3+ → deuce/advantage territory
  if (p1 >= 3 && p2 >= 3) {
    if (p1 === p2) {
      // Deuce → one player gets advantage
      return { newPoints: winner === 1 ? [p1 + 1, p2] : [p1, p2 + 1], gameWinner: 0 };
    }
    if ((winner === 1 && p1 > p2) || (winner === 2 && p2 > p1)) {
      // Advantage player wins the game
      return { newPoints: [p1, p2], gameWinner: winner };
    }
    // Advantage lost → back to deuce
    return { newPoints: [3, 3], gameWinner: 0 };
  }
  const np = [winner === 1 ? p1 + 1 : p1, winner === 2 ? p2 + 1 : p2];
  if (np[0] >= 4) return { newPoints: np, gameWinner: 1 };
  if (np[1] >= 4) return { newPoints: np, gameWinner: 2 };
  return { newPoints: np, gameWinner: 0 };
}

function setsWon(sets) {
  return [sets.filter(s => s.p1 > s.p2).length, sets.filter(s => s.p2 > s.p1).length];
}

export function addPoint(score, winner) {
  if (score.matchWinner) return score;
  let { sets, currentSet, currentGame, isTiebreak } = score;
  sets = [...sets];
  currentSet = [...currentSet];
  currentGame = [...currentGame];

  // ── Tiebreak ──────────────────────────────────────────────
  if (isTiebreak) {
    currentGame[winner - 1]++;
    const [t1, t2] = currentGame;
    const tw = (t1 >= 7 && t1 - t2 >= 2) ? 1 : (t2 >= 7 && t2 - t1 >= 2) ? 2 : 0;
    if (tw) {
      const tbLoser = tw === 1 ? t2 : t1; // loser's tiebreak points
      sets.push(tw === 1 ? { p1: 7, p2: 6, tiebreak: tbLoser } : { p1: 6, p2: 7, tiebreak: tbLoser });
      const [p1s, p2s] = setsWon(sets);
      return { sets, currentSet: [0, 0], currentGame: [0, 0], isTiebreak: false,
        matchWinner: p1s >= 2 ? 1 : p2s >= 2 ? 2 : null };
    }
    return { sets, currentSet, currentGame, isTiebreak: true, matchWinner: null };
  }

  // ── Normal game ───────────────────────────────────────────
  const { newPoints, gameWinner } = scoreGamePoint(currentGame[0], currentGame[1], winner);
  currentGame = newPoints;

  if (gameWinner) {
    currentSet[gameWinner - 1]++;
    currentGame = [0, 0];
    const [g1, g2] = currentSet;

    // Enter tiebreak
    if (g1 === 6 && g2 === 6) {
      return { sets, currentSet, currentGame, isTiebreak: true, matchWinner: null };
    }
    // Set won
    const sw = (g1 >= 6 && g1 - g2 >= 2) ? 1 : (g2 >= 6 && g2 - g1 >= 2) ? 2 : 0;
    if (sw) {
      sets.push({ p1: g1, p2: g2 });
      const [p1s, p2s] = setsWon(sets);
      return { sets, currentSet: [0, 0], currentGame: [0, 0], isTiebreak: false,
        matchWinner: p1s >= 2 ? 1 : p2s >= 2 ? 2 : null };
    }
  }

  return { sets, currentSet, currentGame, isTiebreak, matchWinner: null };
}

// Returns 0 (P1) or 1 (P2) — who is serving for a given score state.
// initialServer is 0|1 — who served the very first game of the match.
// Handles normal alternation and tiebreak rotation (1 then every 2 points).
export function computeServer(scoreBefore, initialServer) {
  const totalGames =
    scoreBefore.sets.reduce((s, set) => s + set.p1 + set.p2, 0) +
    scoreBefore.currentSet[0] + scoreBefore.currentSet[1];
  const gameServer = (initialServer + totalGames) % 2;
  if (!scoreBefore.isTiebreak) return gameServer;
  // Tiebreak: first point served by gameServer, then other player for 2, then alternate every 2
  const tbPoints = scoreBefore.currentGame[0] + scoreBefore.currentGame[1];
  if (tbPoints === 0) return gameServer;
  const offset = Math.floor((tbPoints + 1) / 2) % 2;
  return offset === 0 ? gameServer : 1 - gameServer;
}

// Re-sort points by startTime and recompute every scoreBefore from scratch.
// Call this after any mutation (insert, delete, edit winner) to keep scores consistent.
// Accepts points with or without scoreBefore — always overwrites it.
// initialServer: 0|1 — who served the first game; used to stamp serving on each point.
// A point with servingManual set will use that value instead of auto-computed.
export function recomputeScores(points, initialServer = 0) {
  const sorted = [...points].sort((a, b) => a.startTime - b.startTime);
  let score = INITIAL_SCORE;
  const recomputed = sorted.map(pt => {
    // Manual score override — reset computation chain at this point
    if (pt.scoreOverride) { score = pt.scoreOverride; }
    const scoreBefore = score;
    const serving = pt.servingManual !== undefined
      ? pt.servingManual
      : computeServer(scoreBefore, initialServer);
    score = addPoint(score, pt.winner);
    return { ...pt, scoreBefore, serving };
  });
  return { points: recomputed, finalScore: score };
}
