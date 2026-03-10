import { useState } from 'react';
import './Scoreboard.css';

// Per-player point display — each row is fully independent
function playerPtDisplay(p1, p2, isTb, playerIdx) {
  const [mine, theirs] = playerIdx === 0 ? [p1, p2] : [p2, p1];
  if (isTb) return String(mine);
  if (mine >= 3 && theirs >= 3) {
    if (mine === theirs) return '40'; // deuce
    return mine > theirs ? 'Ad' : '40';
  }
  return ['0', '15', '30', '40'][mine] ?? '0';
}

function parseSets(str) {
  return str.trim().split(/\s+/).filter(Boolean).map(s => {
    const [a, b] = s.split('-').map(n => parseInt(n, 10));
    return { p1: isNaN(a) ? 0 : a, p2: isNaN(b) ? 0 : b };
  });
}

function displayToPts(val) {
  if (val === 'Ad') return 4;
  return { '0': 0, '15': 1, '30': 2, '40': 3 }[val] ?? 0;
}

function buildDraft(score) {
  const p1d = playerPtDisplay(score.currentGame[0], score.currentGame[1], score.isTiebreak, 0);
  const p2d = playerPtDisplay(score.currentGame[0], score.currentGame[1], score.isTiebreak, 1);
  return {
    setsStr: score.sets.map(s => `${s.p1}-${s.p2}`).join(' '),
    g1: String(score.currentSet[0]),
    g2: String(score.currentSet[1]),
    p1pts: p1d,
    p2pts: p2d,
    isTb: score.isTiebreak,
  };
}

// Always show 3 set columns; fill empty ones with '–'
const MAX_SETS = 3;

export default function Scoreboard({ score, onScoreChange, names = ['P1', 'P2'] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);

  function openEdit() { setDraft(buildDraft(score)); setEditing(true); }
  function set(k, v) { setDraft(d => ({ ...d, [k]: v })); }

  function saveEdit() {
    const sets = parseSets(draft.setsStr);
    let cg;
    if (draft.isTb) {
      cg = [parseInt(draft.p1pts) || 0, parseInt(draft.p2pts) || 0];
    } else {
      let r1 = displayToPts(draft.p1pts);
      let r2 = displayToPts(draft.p2pts);
      if (r1 === 4 && r2 === 4) { r1 = 3; r2 = 3; } // both Adv → deuce
      cg = [r1, r2];
    }
    onScoreChange({
      sets,
      currentSet: [parseInt(draft.g1) || 0, parseInt(draft.g2) || 0],
      currentGame: cg,
      isTiebreak: draft.isTb,
      matchWinner: null,
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="sb sb--edit">
        <div className="sb__edit-title">Edit Score</div>
        <div className="sb__edit-field">
          <label>Past sets (e.g.&nbsp;6-3&nbsp;7-5)</label>
          <input value={draft.setsStr} placeholder="6-3 7-5"
            onChange={e => set('setsStr', e.target.value)} />
        </div>
        <div className="sb__edit-field">
          <label>Current set games</label>
          <div className="sb__edit-pair">
            <input type="number" min="0" max="7" value={draft.g1} onChange={e => set('g1', e.target.value)} />
            <span className="sb__dash">–</span>
            <input type="number" min="0" max="7" value={draft.g2} onChange={e => set('g2', e.target.value)} />
          </div>
        </div>
        <div className="sb__edit-field">
          <label>Points{draft.isTb ? ' (tiebreak)' : ''}</label>
          {draft.isTb ? (
            <div className="sb__edit-pair">
              <input type="number" min="0" value={draft.p1pts} onChange={e => set('p1pts', e.target.value)} />
              <span className="sb__dash">–</span>
              <input type="number" min="0" value={draft.p2pts} onChange={e => set('p2pts', e.target.value)} />
            </div>
          ) : (
            <div className="sb__edit-pair">
              <select value={draft.p1pts} onChange={e => set('p1pts', e.target.value)}>
                {['0','15','30','40','Ad'].map(v => <option key={v}>{v}</option>)}
              </select>
              <span className="sb__dash">–</span>
              <select value={draft.p2pts} onChange={e => set('p2pts', e.target.value)}>
                {['0','15','30','40','Ad'].map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
          )}
        </div>
        <label className="sb__edit-check">
          <input type="checkbox" checked={draft.isTb} onChange={e => set('isTb', e.target.checked)} />
          Tiebreak
        </label>
        <div className="sb__edit-actions">
          <button className="sb__btn sb__btn--save" onClick={saveEdit}>Save</button>
          <button className="sb__btn sb__btn--cancel" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  // Build exactly MAX_SETS set columns
  const setCols = Array.from({ length: MAX_SETS }, (_, i) => score.sets[i] ?? null);
  const currentSetIdx = score.sets.length; // 0-based index of the in-progress set

  return (
    <div className="sb">
      {/* Header row */}
      <div className="sb__header-row">
        <div className="sb__cell sb__cell--name" />
        {setCols.map((_, i) => (
          <div key={i} className={`sb__cell sb__cell--set-hd ${i === currentSetIdx ? 'sb__cell--active-hd' : ''}`}>
            {i + 1}
          </div>
        ))}
        <div className="sb__cell sb__cell--game-hd">
          {score.isTiebreak ? 'TB' : 'GAME'}
        </div>
        <div className="sb__cell sb__cell--edit-hd">
          <button className="sb__edit-btn" onClick={openEdit} title="Edit score">✏</button>
        </div>
      </div>

      {/* Divider */}
      <div className="sb__divider" />

      {/* Player rows */}
      {[0, 1].map(pi => {
        const ptVal = playerPtDisplay(
          score.currentGame[0], score.currentGame[1], score.isTiebreak, pi
        );
        const isWinner = score.matchWinner === pi + 1;
        return (
          <div key={pi} className={`sb__player-row ${pi === 1 ? 'sb__player-row--last' : ''}`}>
            <div className={`sb__cell sb__cell--name ${isWinner ? 'sb__cell--winner' : ''}`}>
              {names[pi]}
            </div>
            {setCols.map((s, si) => {
              const mine   = s ? (pi === 0 ? s.p1 : s.p2) : null;
              const theirs = s ? (pi === 0 ? s.p2 : s.p1) : null;
              const won    = s && mine > theirs;
              const isCurrent = si === currentSetIdx;
              return (
                <div
                  key={si}
                  className={`sb__cell sb__cell--set
                    ${won ? 'sb__cell--set-win' : ''}
                    ${isCurrent ? 'sb__cell--set-current' : ''}
                    ${!s ? 'sb__cell--set-empty' : ''}`}
                >
                  {s != null ? mine : ''}
                </div>
              );
            })}
            <div className={`sb__cell sb__cell--game ${ptVal === 'Ad' ? 'sb__cell--adv' : ''}`}>
              {ptVal}
            </div>
            <div className="sb__cell sb__cell--edit-hd" /> {/* spacer to align with header */}
          </div>
        );
      })}

      {/* Match winner banner */}
      {score.matchWinner && (
        <div className="sb__winner-banner">
          {names[score.matchWinner - 1]} wins the match
        </div>
      )}
    </div>
  );
}
