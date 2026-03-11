import { useState } from 'react';
import './Scoreboard.css';

function playerPtDisplay(p1, p2, isTb, idx) {
  const [mine, theirs] = idx === 0 ? [p1, p2] : [p2, p1];
  if (isTb) return String(mine);
  if (mine >= 3 && theirs >= 3) {
    if (mine === theirs) return '40'; // deuce — both show 40
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

const MAX_SETS = 3;

export default function Scoreboard({ score, onScoreChange, names = ['P1', 'P2'], serving = 0, onServingChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);

  function openEdit() {
    const p1d = playerPtDisplay(score.currentGame[0], score.currentGame[1], score.isTiebreak, 0);
    const p2d = playerPtDisplay(score.currentGame[0], score.currentGame[1], score.isTiebreak, 1);
    setDraft({
      setsStr: score.sets.map(s => `${s.p1}-${s.p2}`).join(' '),
      g1: String(score.currentSet[0]),
      g2: String(score.currentSet[1]),
      p1pts: p1d,
      p2pts: p2d,
      isTb: score.isTiebreak,
      serving,
    });
    setEditing(true);
  }

  function set(k, v) { setDraft(d => ({ ...d, [k]: v })); }

  function saveEdit() {
    const sets = parseSets(draft.setsStr);
    let cg;
    if (draft.isTb) {
      cg = [parseInt(draft.p1pts) || 0, parseInt(draft.p2pts) || 0];
    } else {
      let r1 = displayToPts(draft.p1pts);
      let r2 = displayToPts(draft.p2pts);
      if (r1 === 4 && r2 === 4) { r1 = 3; r2 = 3; }
      cg = [r1, r2];
    }
    onServingChange?.(draft.serving);
    onScoreChange({
      sets,
      currentSet: [parseInt(draft.g1) || 0, parseInt(draft.g2) || 0],
      currentGame: cg,
      isTiebreak: draft.isTb,
      matchWinner: null,
    });
    setEditing(false);
  }

  // Build all set columns: completed sets + current set + future empty slots
  const allSets = Array.from({ length: MAX_SETS }, (_, i) => {
    if (i < score.sets.length) {
      return { p1: score.sets[i].p1, p2: score.sets[i].p2, status: 'completed' };
    }
    if (i === score.sets.length && !score.matchWinner) {
      return { p1: score.currentSet[0], p2: score.currentSet[1], status: 'current' };
    }
    return null;
  });

  if (editing) {
    return (
      <div className="sb sb--edit">
        <div className="sb__edit-title">Edit Score</div>
        <div className="sb__edit-field">
          <label>Past sets (e.g. 6-3 7-5)</label>
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
        <div className="sb__edit-field">
          <label>Serving</label>
          <div className="sb__edit-pair">
            <button
              type="button"
              className={`sb__serve-btn ${draft.serving === 0 ? 'sb__serve-btn--active' : ''}`}
              onClick={() => set('serving', 0)}
            >{names[0].toUpperCase()}</button>
            <button
              type="button"
              className={`sb__serve-btn ${draft.serving === 1 ? 'sb__serve-btn--active' : ''}`}
              onClick={() => set('serving', 1)}
            >{names[1].toUpperCase()}</button>
          </div>
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

  return (
    <div className="sb">
      <table className="sb__table">
        <thead>
          <tr className="sb__head-row">
            <th className="sb__th sb__th--dot"></th>
            <th className="sb__th sb__th--name"></th>
            {allSets.map((s, i) => (
              <th key={i} className={`sb__th sb__th--set ${s?.status === 'current' ? 'sb__th--current-set' : ''}`}>
                {i + 1}
              </th>
            ))}
            <th className="sb__th sb__th--pt">{score.isTiebreak ? 'TB' : 'Pt'}</th>
            <th className="sb__th sb__th--btn"></th>
          </tr>
        </thead>
        <tbody>
          {[0, 1].map(pi => {
            const pt = playerPtDisplay(score.currentGame[0], score.currentGame[1], score.isTiebreak, pi);
            const isServing = serving === pi;
            return (
              <tr key={pi} className="sb__row">
                <td
                  className={`sb__td sb__td--dot ${isServing ? 'sb__td--serving' : ''}`}
                  onClick={() => onServingChange?.(pi)}
                  title="Click to set server"
                >
                  ●
                </td>
                <td className={`sb__td sb__td--name ${score.matchWinner === pi + 1 ? 'sb__td--winner' : ''}`}>
                  {names[pi].toUpperCase()}
                </td>
                {allSets.map((s, si) => {
                  const isCurrent = s?.status === 'current';
                  const mine   = s !== null ? (pi === 0 ? s.p1 : s.p2) : null;
                  const theirs = s !== null ? (pi === 0 ? s.p2 : s.p1) : null;
                  const isSetWon = s?.status === 'completed' && mine > theirs;
                  return (
                    <td key={si} className={`sb__td sb__td--set ${isCurrent ? 'sb__td--current-set' : ''} ${s === null ? 'sb__td--empty-set' : ''} ${isSetWon ? 'sb__td--set-win' : ''}`}>
                      {s !== null ? mine : ''}
                    </td>
                  );
                })}
                <td className={`sb__td sb__td--pt ${pt === 'Ad' ? 'sb__td--adv' : ''}`}>
                  {pt}
                </td>
                {pi === 0 && (
                  <td className="sb__td sb__td--btn" rowSpan={2}>
                    <button className="sb__edit-btn" onClick={openEdit} title="Edit score">✏</button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {score.matchWinner && (
        <div className="sb__winner">{names[score.matchWinner - 1].toUpperCase()} WINS</div>
      )}
    </div>
  );
}
