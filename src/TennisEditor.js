import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Scoreboard from './Scoreboard';
import ScoreboardCustomizer from './ScoreboardCustomizer';
import PointTimeline from './PointTimeline';
import VideoExporter from './VideoExporter';
import { INITIAL_SCORE, addPoint, scoreLabel, gameScoreLabel, recomputeScores, computeServer } from './tennisScore';
import { canBrowserPlayNatively, transcodeToH264 } from './transcodeVideo';
import { DEFAULT_THEME } from './scoreboardTheme';
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
  const [initialServer, setInitialServer] = useState(0); // 0 = P1 serves first, 1 = P2 serves first
  const [points, setPoints] = useState([]);
  const [pendingStart, setPendingStart] = useState(null);
  const [status, setStatus] = useState({ text: 'Press S to mark a rally start, then E (P1) or R (P2) to end it', kind: 'idle' });
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  // null = not transcoding; 0–1 = in progress
  const [transcodeProgress, setTranscodeProgress] = useState(null);
  const [scoreboardTheme, setScoreboardTheme] = useState(DEFAULT_THEME);

  const videoRef = useRef(null);
  const fileInputRef = useRef(null);

  // Refs so keyboard handler never has stale closures
  const scoreRef = useRef(INITIAL_SCORE);
  const pendingStartRef = useRef(null);
  const pointsRef = useRef([]);
  const p1NameRef = useRef('Player 1');
  const p2NameRef = useRef('Player 2');
  const initialServerRef = useRef(0);

  // Keep refs in sync with state
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { pendingStartRef.current = pendingStart; }, [pendingStart]);
  useEffect(() => { pointsRef.current = points; }, [points]);
  useEffect(() => { p1NameRef.current = p1Name; }, [p1Name]);
  useEffect(() => { p2NameRef.current = p2Name; }, [p2Name]);
  useEffect(() => { initialServerRef.current = initialServer; }, [initialServer]);

  // Derive current serving from score + initialServer (auto-computed, no extra state)
  const serving = computeServer(score, initialServer);

  // Scoreboard display: reflect the score/serving at the current video timestamp.
  // Walks the sorted points array to find where currentTime falls.
  const displayState = useMemo(() => {
    if (points.length === 0) {
      return { score: INITIAL_SCORE, serving: computeServer(INITIAL_SCORE, initialServer) };
    }
    let displayScore = INITIAL_SCORE;
    let displayServing = computeServer(INITIAL_SCORE, initialServer);
    for (const pt of points) {
      if (pt.startTime > currentTime) break;
      displayScore = pt.scoreBefore;
      displayServing = pt.serving;
      if (currentTime >= pt.endTime) {
        displayScore = addPoint(pt.scoreBefore, pt.winner);
        displayServing = computeServer(displayScore, initialServer);
      }
    }
    return { score: displayScore, serving: displayServing };
  }, [points, currentTime, initialServer]);

  // Video time tracking
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => setCurrentTime(video.currentTime);
    video.addEventListener('timeupdate', onTime);
    return () => video.removeEventListener('timeupdate', onTime);
  }, [videoSrc]);

  // ── File handling ──────────────────────────────────────────
  async function handleFile(file) {
    if (!file) return;
    // Accept video/* MIME types, or files with no detected type (exotic formats)
    if (file.type && !file.type.startsWith('video/')) return;

    // Reset match state immediately
    setDuration(0);
    setScore(INITIAL_SCORE);
    setInitialServer(0);
    setPoints([]);
    setPendingStart(null);
    setFileName(file.name);
    setTranscodeProgress(null);

    // ── Check native support ──────────────────────────────────
    const nativeOk = await canBrowserPlayNatively(file);

    if (nativeOk) {
      const url = URL.createObjectURL(file);
      setVideoSrc(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
      setVideoFile(file);
      setStatus({ text: 'Press S to mark a rally start, then E (P1) or R (P2) to end it', kind: 'idle' });
      return;
    }

    // ── Transcode to H.264 MP4 via FFmpeg WASM ────────────────
    setTranscodeProgress(0);
    setStatus({ text: 'Converting video for browser compatibility…', kind: 'transcoding' });

    try {
      const blob = await transcodeToH264(file, (p) => setTranscodeProgress(p));
      const url = URL.createObjectURL(blob);
      setVideoSrc(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
      setVideoFile(blob);
      setStatus({ text: 'Press S to mark a rally start, then E (P1) or R (P2) to end it', kind: 'idle' });
    } catch (err) {
      console.error('Transcode failed:', err);
      setStatus({ text: `Could not convert video: ${err.message}`, kind: 'error' });
    } finally {
      setTranscodeProgress(null);
    }
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
    const { points: recomputed, finalScore } = recomputeScores([...pointsRef.current, newPt], initialServerRef.current);

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
    const { points: recomputed, finalScore } = recomputeScores(points.filter(p => p.id !== id), initialServer);
    setPoints(recomputed);
    setScore(finalScore);
    scoreRef.current = finalScore;
  }

  function editPointWinner(id, newWinner) {
    const { points: recomputed, finalScore } = recomputeScores(
      points.map(p => p.id === id ? { ...p, winner: newWinner } : p),
      initialServer
    );
    setPoints(recomputed);
    setScore(finalScore);
    scoreRef.current = finalScore;
  }

  function overridePointServing(id) {
    // Toggle servingManual: if already overridden, clear it; otherwise set to opposite of current
    const pt = points.find(p => p.id === id);
    const next = pt.servingManual !== undefined ? undefined : 1 - pt.serving;
    const updated = points.map(p => p.id === id ? { ...p, servingManual: next } : p);
    const { points: recomputed, finalScore } = recomputeScores(updated, initialServer);
    setPoints(recomputed);
    setScore(finalScore);
    scoreRef.current = finalScore;
  }

  // Close point menu on any outside click
  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openMenuId]);

  // Recompute all points whenever initialServer changes
  useEffect(() => {
    if (points.length === 0) return;
    const { points: recomputed, finalScore } = recomputeScores(points, initialServer);
    setPoints(recomputed);
    setScore(finalScore);
    scoreRef.current = finalScore;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialServer]);

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="te">
      {showHelp && (
        <HelpModal names={[p1Name, p2Name]} onAccept={() => setShowHelp(false)} />
      )}
      <h1 className="te__title">Tennis Match Editor</h1>

      {!videoSrc ? (
        <div
          className={`te__drop${isDragging ? ' te__drop--active' : ''}${transcodeProgress !== null ? ' te__drop--transcoding' : ''}`}
          onClick={() => transcodeProgress === null && fileInputRef.current.click()}
          onDrop={e => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]); }}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
        >
          {transcodeProgress !== null ? (
            <div className="te__transcode">
              <div className="te__transcode-spinner" />
              <p className="te__transcode-label">Converting video…</p>
              <div className="te__transcode-bar-wrap">
                <div
                  className="te__transcode-bar-fill"
                  style={{ width: `${Math.round(transcodeProgress * 100)}%` }}
                />
              </div>
              <p className="te__transcode-pct">{Math.round(transcodeProgress * 100)}%</p>
              <p className="te__transcode-hint">Transcoding to H.264 for browser compatibility. This may take a few minutes for long videos.</p>
            </div>
          ) : (
            <>
              <UploadIcon />
              <p className="te__drop-prompt">Drop a video here or <span>browse</span></p>
              <p className="te__drop-hint">MP4, MOV, AVI, MKV, WebM, and more — HEVC/H.265 auto-converted</p>
              <input ref={fileInputRef} type="file" accept="video/*"
                onChange={e => handleFile(e.target.files[0])} className="te__file-input" />
            </>
          )}
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

          {/* Player names + first server */}
          <div className="te__names">
            <div className="te__name-field te__name-field--p1">
              <input
                id="p1-name"
                type="text"
                value={p1Name}
                onChange={e => setP1Name(e.target.value.slice(0, 20))}
                maxLength={20}
                placeholder=" "
              />
              <label htmlFor="p1-name">Player/Team 1</label>
            </div>
            <div className="te__name-field te__name-field--p2">
              <input
                id="p2-name"
                type="text"
                value={p2Name}
                onChange={e => setP2Name(e.target.value.slice(0, 20))}
                maxLength={20}
                placeholder=" "
              />
              <label htmlFor="p2-name">Player/Team 2</label>
            </div>
          </div>
          <div className="te__serve-picker">
            <span className="te__serve-picker-label">Serves first</span>
            <button
              className={`te__serve-pill te__serve-pill--p1${initialServer === 0 ? ' te__serve-pill--active' : ''}`}
              onClick={() => setInitialServer(0)}
            >🎾 {p1Name}</button>
            <button
              className={`te__serve-pill te__serve-pill--p2${initialServer === 1 ? ' te__serve-pill--active' : ''}`}
              onClick={() => setInitialServer(1)}
            >🎾 {p2Name}</button>
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
                score={displayState.score}
                onScoreChange={newScore => { setScore(newScore); scoreRef.current = newScore; }}
                names={[p1Name, p2Name]}
                serving={displayState.serving}
                onServingChange={s => { if (s !== serving) setInitialServer(1 - initialServer); }}
                theme={scoreboardTheme}
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

          {/* Scoreboard customizer */}
          <ScoreboardCustomizer theme={scoreboardTheme} onChange={setScoreboardTheme} />

          {/* Export */}
          <VideoExporter
            videoFile={videoFile}
            points={points}
            fileName={fileName}
            names={[p1Name, p2Name]}
            serving={serving}
            scoreboardTheme={scoreboardTheme}
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
                  const isManualServe = pt.servingManual !== undefined;
                  const tiebreakStarted = gameWon && !setCompleted && scoreAfter.isTiebreak;
                  const nextServer = gameWon && !matchWon ? computeServer(scoreAfter, initialServer) : null;
                  const nextServerName = nextServer === 0 ? p1Name : p2Name;
                  return (
                    <React.Fragment key={pt.id}>
                      <div className={`te__point-row te__point-row--p${pt.winner}`} onClick={() => seekTo(pt.startTime)} style={{ cursor: 'pointer' }}>
                        <span className="te__point-num">#{i + 1}</span>
                        <span className="te__point-score">
                          <span className="te__point-game-score">{gameScoreLabel(pt.scoreBefore)}</span>
                          <span className="te__point-pt-score">{scoreLabel(pt.scoreBefore)}</span>
                        </span>
                        <span className="te__point-time">{fmtTime(pt.startTime)} – {fmtTime(pt.endTime)}</span>
                        <span className="te__point-menu-wrap">
                          <button
                            className="te__point-menu-btn"
                            onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === pt.id ? null : pt.id); }}
                            title="More options"
                          >⋮</button>
                          {openMenuId === pt.id && (
                            <div className="te__point-menu" onClick={e => e.stopPropagation()}>
                              <div className="te__point-menu-info">
                                <span className={`te__point-menu-dot te__point-menu-dot--p${pt.serving + 1}`}>●</span>
                                {pt.serving === 0 ? p1Name : p2Name} serving{isManualServe ? ' ✎' : ''}
                              </div>
                              <button
                                className="te__point-menu-item"
                                onClick={() => { overridePointServing(pt.id); setOpenMenuId(null); }}
                              >
                                {isManualServe ? '↺ Clear server override' : '⇄ Switch server'}
                              </button>
                            </div>
                          )}
                        </span>
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
                          <span>{bannerText}</span>
                          {!matchWon && !tiebreakStarted && (
                            <span className="te__banner-serve">
                              🎾 {nextServerName} to serve
                              <button
                                className="te__banner-swap"
                                onClick={() => setInitialServer(1 - initialServer)}
                                title="Swap who serves next"
                              >↺ swap</button>
                            </span>
                          )}
                        </div>
                      )}
                      {tiebreakStarted && (
                        <div className="te__tiebreak-banner">
                          <span>Tiebreak</span>
                          <span className="te__banner-serve">
                            🎾 {nextServerName} to serve first
                            <button
                              className="te__banner-swap"
                              onClick={() => setInitialServer(1 - initialServer)}
                              title="Swap who serves first in the tiebreak"
                            >↺ swap</button>
                          </span>
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
