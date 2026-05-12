import React, { useMemo } from 'react';
import { addPoint } from './tennisScore';
import './StatsPanel.css';

// ── Formatting helpers ────────────────────────────────────────
function pct(num, denom) {
  if (!denom) return null;
  return Math.round((num / denom) * 100);
}

function fmt(num, denom) {
  const p = pct(num, denom);
  if (p === null) return '—';
  return `${p}% (${num}/${denom})`;
}

// ── Game detection helpers ────────────────────────────────────

// Did this point end a game?
function isGameEndingPoint(pt, matchConfig) {
  const after = addPoint(pt.scoreBefore, pt.winner, matchConfig);
  return (
    after.currentSet[0] !== pt.scoreBefore.currentSet[0] ||
    after.currentSet[1] !== pt.scoreBefore.currentSet[1] ||
    after.sets.length !== pt.scoreBefore.sets.length
  );
}

// Is this point a break point opportunity for the returner?
// Excludes tiebreaks (no traditional break points).
function isBreakPoint(pt, noAds) {
  if (pt.scoreBefore.isTiebreak) return false;
  const serverPts   = pt.scoreBefore.currentGame[pt.serving];
  const returnerPts = pt.scoreBefore.currentGame[1 - pt.serving];
  // noAds: deuce (3-3) is also a break point
  if (noAds) return returnerPts >= 3 && returnerPts >= serverPts;
  // Standard: returner is ahead at 3+ pts (30-40, 0-40, 15-40, Ad-out)
  return returnerPts >= 3 && returnerPts > serverPts;
}

// If the server holds this game-ending point, would it complete the set?
function serverWouldWinSet(pt, matchConfig) {
  const serverWinnerNum = pt.serving + 1; // 1-indexed
  const simAfter = addPoint(pt.scoreBefore, serverWinnerNum, matchConfig);
  return simAfter.sets.length > pt.scoreBefore.sets.length;
}

// ── Main computation ──────────────────────────────────────────
function computeStats(points, matchConfig) {
  const serveMode   = matchConfig?.serveMode ?? 'disabled';
  const noAds       = matchConfig?.noAds ?? false;
  const serveTracking = serveMode === 'all-serves';

  return [0, 1].map(playerIdx => {
    const playerNum = playerIdx + 1;
    const served    = points.filter(pt => pt.serving === playerIdx);
    const returned  = points.filter(pt => pt.serving !== playerIdx);
    const total     = points.length;

    // ── Serve stats (serve-tracking mode only) ────────────────
    const serviceWon = served.filter(pt => pt.winner === playerNum);
    const returnWon  = returned.filter(pt => pt.winner === playerNum);
    const totalWon   = points.filter(pt => pt.winner === playerNum);

    const firstServeIn      = served.filter(pt => pt.firstServeTime == null && !pt.isDoubleFault);
    const firstServeFaulted = served.filter(pt => pt.firstServeTime != null);
    const secondServeIn     = served.filter(pt => pt.firstServeTime != null && !pt.isDoubleFault);
    const doubleFaults      = served.filter(pt => pt.isDoubleFault);
    const firstServeWon     = firstServeIn.filter(pt => pt.winner === playerNum);
    const secondServeWon    = secondServeIn.filter(pt => pt.winner === playerNum);

    // ── Break points ──────────────────────────────────────────
    // Faced (serving) — server must save them
    const bpFaced     = served.filter(pt => isBreakPoint(pt, noAds));
    const bpSaved     = bpFaced.filter(pt => pt.winner === playerNum);
    // Created (returning) — returner tries to convert
    const bpOpps      = returned.filter(pt => isBreakPoint(pt, noAds));
    const bpConverted = bpOpps.filter(pt => pt.winner === playerNum);

    // ── Games (exclude tiebreaks from hold/break/sfSet) ───────
    const gameEnders    = points.filter(pt => !pt.scoreBefore.isTiebreak && isGameEndingPoint(pt, matchConfig));
    const allGameEnders = points.filter(pt => isGameEndingPoint(pt, matchConfig));

    const serviceGames = gameEnders.filter(pt => pt.serving === playerIdx);
    const holds        = serviceGames.filter(pt => pt.winner === playerNum);
    const returnGames  = gameEnders.filter(pt => pt.serving !== playerIdx);
    const breaks       = returnGames.filter(pt => pt.winner === playerNum);

    const gamesWon  = allGameEnders.filter(pt => pt.winner === playerNum).length;
    const gamesLost = allGameEnders.filter(pt => pt.winner !== playerNum).length;

    // Serving-for-set: game-ending service games where a hold would win the set
    const sfSetOpps = serviceGames.filter(pt => serverWouldWinSet(pt, matchConfig));
    const sfSetWon  = sfSetOpps.filter(pt => pt.winner === playerNum);

    return {
      serveTracking,
      // Serve (only in serve-tracking mode)
      firstServePct:     fmt(firstServeIn.length, served.length),
      secondServePct:    fmt(secondServeIn.length, firstServeFaulted.length),
      doubleFaults:      doubleFaults.length,
      firstServeWinPct:  fmt(firstServeWon.length, firstServeIn.length),
      secondServeWinPct: fmt(secondServeWon.length, secondServeIn.length),
      // Break points
      bpSavedPct:        fmt(bpSaved.length, bpFaced.length),
      bpConvPct:         fmt(bpConverted.length, bpOpps.length),
      // Games
      gamesWL:           gamesWon + gamesLost > 0 ? `${gamesWon}–${gamesLost}` : '—',
      holdPct:           fmt(holds.length, serviceGames.length),
      breakPct:          fmt(breaks.length, returnGames.length),
      sfSetPct:          sfSetOpps.length > 0 ? fmt(sfSetWon.length, sfSetOpps.length) : '—',
      // Points
      servicePointsWon:  fmt(serviceWon.length, served.length),
      returnPointsWon:   fmt(returnWon.length, returned.length),
      totalWon:          fmt(totalWon.length, total),
    };
  });
}

// ── Row definitions ───────────────────────────────────────────
const SERVE_ROWS = [
  { key: 'firstServePct',     label: '1st serve %' },
  { key: 'secondServePct',    label: '2nd serve %' },
  { key: 'doubleFaults',      label: 'Double faults' },
  { key: 'firstServeWinPct',  label: '1st serve win %' },
  { key: 'secondServeWinPct', label: '2nd serve win %' },
];

const BP_ROWS = [
  { key: 'bpSavedPct', label: 'Break points saved' },
  { key: 'bpConvPct',  label: 'Break points converted' },
];

const GAMES_ROWS = [
  { key: 'gamesWL',  label: 'Total games won' },
  { key: 'holdPct',  label: 'Hold %' },
  { key: 'breakPct', label: 'Break %' },
];

const POINTS_ROWS = [
  { key: 'servicePointsWon', label: 'Service points won' },
  { key: 'returnPointsWon',  label: 'Return points won' },
];

// ── Component ─────────────────────────────────────────────────
export default function StatsPanel({ points, names, matchConfig }) {
  const [p1Name, p2Name] = names;
  const stats = useMemo(() => computeStats(points, matchConfig), [points, matchConfig]);
  const serveTracking = matchConfig?.serveMode === 'all-serves';

  if (points.length === 0) return null;

  return (
    <div className="sp__panel">
      <div className="sp__title">Match Stats</div>
      <table className="sp__table">
        <thead>
          <tr>
            <th className="sp__th sp__th--label"></th>
            <th className="sp__th sp__th--p1">{p1Name}</th>
            <th className="sp__th sp__th--p2">{p2Name}</th>
          </tr>
        </thead>
        <tbody>
          {/* ── Points — top block ── */}
          <tr className="sp__section-header"><td colSpan={3}>Points Breakdown</td></tr>
          <tr className="sp__row sp__row--total">
            <td className="sp__label">Total points won</td>
            <td className="sp__val sp__val--p1">{stats[0].totalWon}</td>
            <td className="sp__val sp__val--p2">{stats[1].totalWon}</td>
          </tr>
          {POINTS_ROWS.map(row => (
            <tr key={row.key} className="sp__row">
              <td className="sp__label">{row.label}</td>
              <td className="sp__val sp__val--p1">{stats[0][row.key]}</td>
              <td className="sp__val sp__val--p2">{stats[1][row.key]}</td>
            </tr>
          ))}

          {/* ── Serve ── */}
          <tr className="sp__section-header"><td colSpan={3}>Serve</td></tr>
          {serveTracking ? (
            SERVE_ROWS.map(row => (
              <tr key={row.key} className="sp__row">
                <td className="sp__label">{row.label}</td>
                <td className="sp__val sp__val--p1">{stats[0][row.key]}</td>
                <td className="sp__val sp__val--p2">{stats[1][row.key]}</td>
              </tr>
            ))
          ) : (
            <tr className="sp__row sp__row--muted">
              <td colSpan={3} className="sp__serve-off">
                Enable <strong>serve tracking</strong> in Match Settings for serve stats
              </td>
            </tr>
          )}

          {/* ── Break Points ── */}
          <tr className="sp__section-header"><td colSpan={3}>Break Points</td></tr>
          {BP_ROWS.map(row => (
            <tr key={row.key} className="sp__row">
              <td className="sp__label">{row.label}</td>
              <td className="sp__val sp__val--p1">{stats[0][row.key]}</td>
              <td className="sp__val sp__val--p2">{stats[1][row.key]}</td>
            </tr>
          ))}

          {/* ── Games ── */}
          <tr className="sp__section-header"><td colSpan={3}>Games</td></tr>
          {GAMES_ROWS.map(row => (
            <tr key={row.key} className="sp__row">
              <td className="sp__label">{row.label}</td>
              <td className="sp__val sp__val--p1">{stats[0][row.key]}</td>
              <td className="sp__val sp__val--p2">{stats[1][row.key]}</td>
            </tr>
          ))}

        </tbody>
      </table>
    </div>
  );
}
