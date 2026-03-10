import { useState, useRef, useEffect, useCallback } from 'react';
import Scoreboard from './Scoreboard';
import PointTimeline from './PointTimeline';
import { INITIAL_SCORE, addPoint, scoreLabel } from './tennisScore';
import './TennisEditor.css';

function fmtTime(s) {
  if (!isFinite(s)) return '0:00.0';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const t = Math.floor((s % 1) * 10);
  return `${m}:${String(sec).padStart(2, '0')}.${t}`;
}

export default function TennisEditor() {
  const [videoSrc, setVideoSrc] = useState(null);
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [score, setScore] = useState(INITIAL_SCORE);
  const [points, setPoints] = useState([]);
  const [pendingStart, setPendingStart] = useState(null);
  const [status, setStatus] = useState({ text: 'Press S to mark a rally start, then E (P1) or R (P2) to end it', kind: 'idle' });

  const videoRef = useRef(null);
  const fileInputRef = useRef(null);

  // Refs so keyboard handler never has stale closures
  const scoreRef = useRef(INITIAL_SCORE);
  const pendingStartRef = useRef(null);
  const pointsRef = useRef([]);

  // Keep refs in sync with state
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { pendingStartRef.current = pendingStart; }, [pendingStart]);
  useEffect(() => { pointsRef.current = points; }, [points]);

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
    setFileName(file.name);
    setDuration(0);
    setScore(INITIAL_SCORE);
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
    const scoreBefore = scoreRef.current;
    const scoreAfter = addPoint(scoreBefore, winner);
    const newPt = { id: Date.now(), startTime, endTime, winner, scoreBefore };

    setPoints(prev => [...prev, newPt]);
    setScore(scoreAfter);
    scoreRef.current = scoreAfter;
    pendingStartRef.current = null;
    setPendingStart(null);

    const label = scoreLabel(scoreAfter);
    setStatus({
      text: `${winner === 1 ? 'Kendrick' : 'Joey'} wins · Score: ${label} · Games: ${scoreAfter.currentSet[0]}–${scoreAfter.currentSet[1]}`,
      kind: 'success',
    });
  }, []); // stable — reads from refs only

  useEffect(() => {
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [keyHandler]);

  function seekTo(t) {
    if (videoRef.current) videoRef.current.currentTime = t;
  }

  function removePoint(id) {
    setPoints(prev => prev.filter(p => p.id !== id));
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="te">
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
                names={['Kendrick', 'Joey']}
              />
            </div>
          </div>

          {/* Keyboard hints */}
          <div className="te__hints">
            <span><kbd>Space</kbd> Play / Pause</span>
            <span><kbd>←</kbd><kbd>→</kbd> ±3 sec</span>
            <span><kbd>S</kbd> Mark start</span>
            <span><kbd>E</kbd> P1 wins</span>
            <span><kbd>R</kbd> P2 wins</span>
          </div>

          {/* Status bar */}
          <div className={`te__status te__status--${status.kind}`}>
            {pendingStart !== null && (
              <span className="te__status-marker">● Start: {fmtTime(pendingStart)}</span>
            )}
            {status.text}
          </div>

          {/* Point timeline */}
          <PointTimeline
            points={points}
            duration={duration}
            currentTime={currentTime}
            pendingStart={pendingStart}
            onSeek={seekTo}
          />

          {/* Points list */}
          {points.length > 0 && (
            <div className="te__points-list">
              <div className="te__points-header">
                <span>Recorded points</span>
                <button className="te__clear-btn" onClick={() => {
                  setPoints([]);
                  setScore(INITIAL_SCORE);
                  scoreRef.current = INITIAL_SCORE;
                }}>Clear all</button>
              </div>
              <div className="te__points-rows">
                {points.map((pt, i) => (
                  <div key={pt.id} className={`te__point-row te__point-row--p${pt.winner}`}>
                    <span className="te__point-num">#{i + 1}</span>
                    <span className="te__point-score">{scoreLabel(pt.scoreBefore)}</span>
                    <span className="te__point-time">{fmtTime(pt.startTime)} – {fmtTime(pt.endTime)}</span>
                    <span className="te__point-winner">P{pt.winner}</span>
                    <button className="te__point-del" onClick={() => removePoint(pt.id)} title="Remove">×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
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
