import React, { useState, useRef, useEffect, useCallback } from 'react';
import Scoreboard from './Scoreboard';
import PointTimeline from './PointTimeline';
import VideoExporter from './VideoExporter';
import { INITIAL_SCORE, addPoint, scoreLabel, gameScoreLabel, recomputeScores } from './tennisScore';
import './TennisEditor.css';

function fmtTime(s) {
  if (!isFinite(s)) return '0:00.0';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const t = Math.floor((s % 1) * 10);
  return `${m}:${String(sec).padStart(2, '0')}.${t}`;
}

export default function TennisEditor() {
  const [showHelp, setShowHelp] = useState(true);
  const [p1Name, setP1Name] = useState('Player 1');
  const [p2Name, setP2Name] = useState('Player 2');
  const [videoSrc, setVideoSrc] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [score, setScore] = useState(INITIAL_SCORE);
  const [serving, setServing] = useState(0); // 0 = P1, 1 = P2
  const [points, setPoints] = useState([]);
  const [pendingStart, setPendingStart] = useState(null);
  const [status, setStatus] = useState({ text: 'Press S to mark a rally start, then E (P1) or R (P2) to end it', kind: 'idle' });
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const videoRef = useRef(null);
  const fileInputRef = useRef(null);

  // Refs so keyboard handler never has stale closures
  const scoreRef = useRef(INITIAL_SCORE);
  const pendingStartRef = useRef(null);
  const pointsRef = useRef([]);
  const p1NameRef = useRef('Player 1');
  const p2NameRef = useRef('Player 2');

  // Keep refs in sync with state
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { pendingStartRef.current = pendingStart; }, [pendingStart]);
  useEffect(() => { pointsRef.current = points; }, [points]);
  useEffect(() => { p1NameRef.current = p1Name; }, [p1Name]);
  useEffect(() => { p2NameRef.current = p2Name; }, [p2Name]);

  // Video time tracking
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => setCurrentTime(video.currentTime);
    video.addEventListener('timeupdate', onTime);
    return () => video.removeEventListener('timeupdate', onTime);
  }, [videoSrc]);

  // ── File handling ──────────────────────────────────────────
  function handleFile(file) {
    if (!file || !file.type.startsWith('video/')) return;
    const url = URL.createObjectURL(file);
    setVideoSrc(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
    setVideoFile(file);
    setFileName(file.name);
    setDuration(0);
    setScore(INITIAL_SCORE);
    setServing(0);
    setPoints([]);
    setPendingStart(null);
    setStatus({ text: 'Press S to mark a rally start, then E (P1) or R (P2) to end it', kind: 'idle' });
  }

  // ── Keyboard shortcuts ─────────────────────────────────────
  // All mutable values read from refs → no deps needed → stable handler
  const keyHandler = useCallback((e) => {
    // Don't capture inside form inputs
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

    const video = videoRef.current;
    if (!video) return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (e.repeat) return; // ignore key-repeat — one press = one toggle
      if (video.paused) video.play(); else video.pause();
      return;
    }

    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
      if (e.repeat) return; // one press = one 3-second skip, no auto-repeat
      const delta = e.code === 'ArrowLeft' ? -3 : 3;
      video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
      return;
    }

    if (!['KeyS', 'KeyE', 'KeyR'].includes(e.code)) return;
    e.preventDefault();

    if (e.code === 'KeyS') {
      const t = video.currentTime;
      pendingStartRef.current = t;
      setPendingStart(t);
      setStatus({ text: `Start: ${fmtTime(t)} — now press E (P1 wins) or R (P2 wins)`, kind: 'info' });
      return;
    }

    // E or R — end point
    const ps = pendingStartRef.current;
    if (ps === null) {
      setStatus({ text: 'Press S first to mark the rally start', kind: 'warn' });
      return;
    }

    let startTime = ps;
    let endTime = video.currentTime;
    if (Math.abs(endTime - startTime) < 0.05) {
      setStatus({ text: 'Start and end are too close — seek further from S', kind: 'warn' });
      return;
    }
    // Allow marking if user seeked backwards (swap times)
    if (endTime < startTime) [startTime, endTime] = [endTime, startTime];

    const winner = e.code === 'KeyE' ? 1 : 2;
    const newPt = { id: Date.now(), startTime, endTime, winner };
    const { points: recomputed, finalScore } = recomputeScores([...pointsRef.current, newPt]);

    setPoints(recomputed);
    setScore(finalScore);
    scoreRef.current = finalScore;
    pendingStartRef.current = null;
    setPendingStart(null);

    // Find this point's scoreBefore to show the score at that moment in the video
    const inserted = recomputed.find(p => p.id === newPt.id);
    const scoreAfterThisPoint = addPoint(inserted.scoreBefore, winner);
    const label = scoreLabel(scoreAfterThisPoint);
    setStatus({
      text: `${winner === 1 ? p1NameRef.current : p2NameRef.current} wins · Score: ${label} · Games: ${scoreAfterThisPoint.currentSet[0]}–${scoreAfterThisPoint.currentSet[1]}`,
      kind: 'success',
    });
  }, []); // stable — reads from refs only

  useEffect(() => {
    // Capture phase (true) so our handler fires before the native <video controls>
    // handler. This lets e.preventDefault() actually block the browser's built-in
    // Space/Arrow behaviour instead of fighting with it after the fact.
    window.addEventListener('keydown', keyHandler, true);
    return () => window.removeEventListener('keydown', keyHandler, true);
  }, [keyHandler]);

  function seekTo(t) {
    if (videoRef.current) videoRef.current.currentTime = t;
  }

  function removePoint(id) {
    const { points: recomputed, finalScore } = recomputeScores(points.filter(p => p.id !== id));
    setPoints(recomputed);
    setScore(finalScore);
    scoreRef.current = finalScore;
  }

  function editPointWinner(id, newWinner) {
    const { points: recomputed, finalScore } = recomputeScores(
      points.map(p => p.id === id ? { ...p, winner: newWinner } : p)
    );
    setPoints(recomputed);
    setScore(finalScore);
    scoreRef.current = finalScore;
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="te">
      {showHelp && (
        <HelpModal names={[p1Name, p2Name]} onAccept={() => setShowHelp(false)} />
      )}
      <h1 className="te__title">Tennis Match Editor</h1>

      {!videoSrc ? (
        <div
          className={`te__drop${isDragging ? ' te__drop--active' : ''}`}
          onClick={() => fileInputRef.current.click()}
          onDrop={e => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]); }}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
        >
          <UploadIcon />
          <p className="te__drop-prompt">Drop a video here or <span>browse</span></p>
          <p className="te__drop-hint">MP4, MOV, AVI, WebM and more</p>
          <input ref={fileInputRef} type="file" accept="video/*"
            onChange={e => handleFile(e.target.files[0])} className="te__file-input" />
        </div>
      ) : (
        <div className="te__workspace">
          {/* File bar */}
          <div className="te__file-bar">
            <span className="te__file-name">{fileName}</span>
            <button className="te__change-btn" onClick={() => fileInputRef.current.click()}>
              Change video
            </button>
            <input ref={fileInputRef} type="file" accept="video/*"
              onChange={e => handleFile(e.target.files[0])} className="te__file-input" />
          </div>

          {/* Player names */}
          <div className="te__names">
            <label className="te__name-field te__name-field--p1">
              <span>Player 1</span>
              <input
                type="text"
                value={p1Name}
                onChange={e => setP1Name(e.target.value.slice(0, 20))}
                maxLength={20}
                placeholder="Player 1"
              />
            </label>
            <label className="te__name-field te__name-field--p2">
              <span>Player 2</span>
              <input
                type="text"
                value={p2Name}
                onChange={e => setP2Name(e.target.value.slice(0, 20))}
                maxLength={20}
                placeholder="Player 2"
              />
            </label>
          </div>

          {/* Video + scoreboard overlay */}
          <div className="te__video-wrap">
            <video
              ref={videoRef}
              src={videoSrc}
              controls
              className="te__video"
              onLoadedMetadata={() => setDuration(videoRef.current.duration)}
            />
            <div className="te__sb-overlay">
              <Scoreboard
                score={score}
                onScoreChange={newScore => { setScore(newScore); scoreRef.current = newScore; }}
                names={[p1Name, p2Name]}
                serving={serving}
                onServingChange={setServing}
              />
            </div>
          </div>

          {/* Status bar — directly below the video */}
          <div className={`te__status te__status--${status.kind}`}>
            {pendingStart !== null && (
              <span className="te__status-marker">● Start: {fmtTime(pendingStart)}</span>
            )}
            {status.text}
          </div>

          {/* Keyboard hints */}
          <div className="te__hints">
            <span><kbd>Space</kbd> Play / Pause</span>
            <span><kbd>←</kbd><kbd>→</kbd> ±3 sec</span>
            <span><kbd>S</kbd> Mark start</span>
            <span><kbd>E</kbd> P1 wins</span>
            <span><kbd>R</kbd> P2 wins</span>
          </div>

          {/* Export */}
          <VideoExporter
            videoFile={videoFile}
            points={points}
            fileName={fileName}
            names={[p1Name, p2Name]}
            serving={serving}
          />

          {/* Point timeline */}
          <PointTimeline
            points={points}
            duration={duration}
            currentTime={currentTime}
            pendingStart={pendingStart}
            onSeek={seekTo}
            names={[p1Name, p2Name]}
          />

          {/* Points list */}
          {points.length > 0 && (
            <div className="te__points-list">
              <div className="te__points-header">
                <span>Recorded points</span>
                <button className="te__clear-btn" onClick={() => setShowClearConfirm(true)}>Clear all</button>
              </div>
              {showClearConfirm && (
                <div className="te__clear-confirm">
                  <span>Clear all {points.length} recorded point{points.length !== 1 ? 's' : ''}? This cannot be undone.</span>
                  <div className="te__clear-confirm-btns">
                    <button className="te__clear-confirm-cancel" onClick={() => setShowClearConfirm(false)}>Cancel</button>
                    <button className="te__clear-confirm-ok" onClick={() => {
                      setPoints([]);
                      setScore(INITIAL_SCORE);
                      scoreRef.current = INITIAL_SCORE;
                      pointsRef.current = [];
                      setShowClearConfirm(false);
                    }}>Yes, clear all</button>
                  </div>
                </div>
              )}
              <div className="te__points-col-headers">
                <span className="te__point-num"></span>
                <span className="te__point-score">
                  <span className="te__col-label">Game</span>
                  <span className="te__col-label">Point</span>
                </span>
                <span className="te__col-label te__col-label--time">Time</span>
              </div>
              <div className="te__points-rows">
                {points.map((pt, i) => {
                  const scoreAfter = addPoint(pt.scoreBefore, pt.winner);
                  const setCompleted = scoreAfter.sets.length > pt.scoreBefore.sets.length;
                  const gameWon = setCompleted
                    || scoreAfter.currentSet[0] !== pt.scoreBefore.currentSet[0]
                    || scoreAfter.currentSet[1] !== pt.scoreBefore.currentSet[1];
                  const matchWon = !!scoreAfter.matchWinner;
                  const winnerName = pt.winner === 1 ? p1Name : p2Name;
                  let bannerText = null;
                  if (gameWon) {
                    if (matchWon) {
                      bannerText = `${winnerName} wins the match`;
                    } else if (setCompleted) {
                      const s = scoreAfter.sets[scoreAfter.sets.length - 1];
                      bannerText = `${winnerName} wins the set — ${s.p1}–${s.p2}`;
                    } else {
                      const [g1, g2] = scoreAfter.currentSet;
                      bannerText = `${winnerName} wins the game — ${g1}–${g2}`;
                    }
                  }
                  return (
                    <React.Fragment key={pt.id}>
                      <div className={`te__point-row te__point-row--p${pt.winner}`} onClick={() => seekTo(pt.startTime)} style={{ cursor: 'pointer' }}>
                        <span className="te__point-num">#{i + 1}</span>
                        <span className="te__point-score">
                          <span className="te__point-game-score">{gameScoreLabel(pt.scoreBefore)}</span>
                          <span className="te__point-pt-score">{scoreLabel(pt.scoreBefore)}</span>
                        </span>
                        <span className="te__point-time">{fmtTime(pt.startTime)} – {fmtTime(pt.endTime)}</span>
                        <button
                          className={`te__point-winner te__point-winner--btn te__point-winner--p${pt.winner}`}
                          onClick={e => { e.stopPropagation(); editPointWinner(pt.id, pt.winner === 1 ? 2 : 1); }}
                          title="Click to swap winner"
                        >
                          {pt.winner === 1 ? p1Name : p2Name} ⇄
                        </button>
                        <button className="te__point-del" onClick={e => { e.stopPropagation(); removePoint(pt.id); }} title="Remove">×</button>
                      </div>
                      {bannerText && (
                        <div className={`te__game-banner te__game-banner--p${pt.winner}${matchWon ? ' te__game-banner--match' : setCompleted ? ' te__game-banner--set' : ''}`}>
                          {bannerText}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HelpModal({ names, onAccept }) {
  const [p1, p2] = names;
  return (
    <div className="te__modal-backdrop">
      <div className="te__modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="te__modal-header">
          <span className="te__modal-icon">🎾</span>
          <h2 id="modal-title" className="te__modal-title">How to use the editor</h2>
          <p className="te__modal-sub">Tag every point in your match video using just three keys</p>
        </div>

        <div className="te__modal-keys">
          <div className="te__modal-key">
            <kbd className="te__modal-kbd">S</kbd>
            <span>Mark <strong>start</strong> of rally</span>
          </div>
          <div className="te__modal-key">
            <kbd className="te__modal-kbd te__modal-kbd--p1">E</kbd>
            <span><strong>{p1}</strong> wins the point</span>
          </div>
          <div className="te__modal-key">
            <kbd className="te__modal-kbd te__modal-kbd--p2">R</kbd>
            <span><strong>{p2}</strong> wins the point</span>
          </div>
        </div>

        <ol className="te__modal-steps">
          <li>
            <span className="te__modal-step-num">1</span>
            <span>Upload your match video and press <kbd>Space</kbd> to play</span>
          </li>
          <li>
            <span className="te__modal-step-num">2</span>
            <span>When a rally starts, press <kbd>S</kbd> to mark the beginning of each point</span>
          </li>
          <li>
            <span className="te__modal-step-num">3</span>
            <span>When the point ends, press <kbd>E</kbd> if <strong>{p1}</strong> won or <kbd>R</kbd> if <strong>{p2}</strong> won — the score updates automatically</span>
          </li>
          <li>
            <span className="te__modal-step-num">4</span>
            <span>Repeat through the whole video, then hit <strong>Export</strong> to download every point as a clip</span>
          </li>
        </ol>

        <button className="te__modal-accept" onClick={onAccept}>
          Got it — let's start
        </button>
      </div>
    </div>
  );
}

function UploadIcon() {
  return (
    <div className="te__drop-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
    </div>
  );
}
