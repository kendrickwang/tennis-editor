import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Scoreboard from './Scoreboard';
import ScoreboardCustomizer, { ScorePreview, PREVIEW_SCORE_S1, PREVIEW_SCORE_TB } from './ScoreboardCustomizer';
import PointTimeline from './PointTimeline';
import VideoExporter from './VideoExporter';
import { INITIAL_SCORE, addPoint, scoreLabel, gameScoreLabel, recomputeScores, computeServer } from './tennisScore';
import { canBrowserPlayNatively, transcodeToH264 } from './transcodeVideo';
import { DEFAULT_THEME } from './scoreboardTheme';
import { drawScoreboardToCanvas } from './scoreboardCanvas';
import './TennisEditor.css';

function fmtTime(s) {
  if (!isFinite(s)) return '0:00.0';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const t = Math.floor((s % 1) * 10);
  return `${m}:${String(sec).padStart(2, '0')}.${t}`;
}

// ── Score edit helpers ─────────────────────────────────────────
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

function ptDisplayStr(g1, g2, isTb, idx) {
  const [mine, theirs] = idx === 0 ? [g1, g2] : [g2, g1];
  if (isTb) return String(mine);
  if (mine >= 3 && theirs >= 3) {
    if (mine === theirs) return '40';
    return mine > theirs ? 'Ad' : '40';
  }
  return ['0', '15', '30', '40'][mine] ?? '0';
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
  const [editScoreId, setEditScoreId] = useState(null);
  const [editScoreDraft, setEditScoreDraft] = useState(null);
  // null = not transcoding; 0–1 = in progress
  const [transcodeProgress, setTranscodeProgress] = useState(null);
  const [scoreboardTheme, setScoreboardTheme] = useState(DEFAULT_THEME);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [volume, setVolume] = useState(1);
  const [videoGlow, setVideoGlow] = useState(null); // null | 'info' | 'success' | 'warn'
  const [matchConfig, setMatchConfig] = useState({ noAds: false, matchTiebreak: false });
  const [matchSettingsOpen, setMatchSettingsOpen] = useState(true);
  const [playerSetupOpen, setPlayerSetupOpen] = useState(true);
  const [pendingDelete, setPendingDelete] = useState(false);
  // null = no prompt; object = saved session to offer restoring
  const [restorePrompt, setRestorePrompt] = useState(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [scoreboardSectionOpen, setScoreboardSectionOpen] = useState(true);

  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const sessionFileInputRef = useRef(null);
  const glowTimerRef = useRef(null);
  const matchConfigRef = useRef({ noAds: false, matchTiebreak: false });
  const pendingDeleteRef = useRef(false);
  const deleteTimerRef = useRef(null);
  // Undo stack — each entry is { points, pendingStart } snapshot taken before
  // a destructive action. Ctrl+Z pops the top and restores.
  const undoStackRef = useRef([]);

  function pushUndo() {
    undoStackRef.current = [
      ...undoStackRef.current,
      { points: pointsRef.current, pendingStart: pendingStartRef.current },
    ].slice(-50); // cap at 50 steps
  }

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
  useEffect(() => { matchConfigRef.current = matchConfig; }, [matchConfig]);
  useEffect(() => { pendingDeleteRef.current = pendingDelete; }, [pendingDelete]);

  // ── Auto-save session to localStorage ──────────────────────
  // Fires whenever points change (and there's something worth saving).
  // Silently skips if storage is full or unavailable.
  useEffect(() => {
    if (points.length === 0) return;
    try {
      localStorage.setItem('tennis-editor-session', JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        fileName,
        p1Name,
        p2Name,
        initialServer,
        matchConfig,
        scoreboardTheme,
        points,
      }));
    } catch (_) {}
  // scoreboardTheme intentionally omitted — it changes too often (color pickers)
  // and is non-critical for clip recovery. All other values are cheap strings/arrays.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

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
        displayScore = addPoint(pt.scoreBefore, pt.winner, matchConfig);
        displayServing = computeServer(displayScore, initialServer);
      }
    }
    return { score: displayScore, serving: displayServing };
  }, [points, currentTime, initialServer, matchConfig]);

  // Video time + play/pause tracking
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime  = () => setCurrentTime(video.currentTime);
    const onPlay  = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('play',       onPlay);
    video.addEventListener('pause',      onPause);
    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('play',       onPlay);
      video.removeEventListener('pause',      onPause);
    };
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
    setRestorePrompt(null);

    // Offer to restore a previous auto-saved session for this file
    try {
      const saved = JSON.parse(localStorage.getItem('tennis-editor-session'));
      if (saved?.points?.length > 0 && saved.fileName === file.name) {
        setRestorePrompt(saved);
      }
    } catch (_) {}

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

  // ── Sample video loader ────────────────────────────────────
  async function loadSampleVideo() {
    if (sampleLoading) return;
    setSampleLoading(true);
    try {
      const res = await fetch(`${process.env.PUBLIC_URL}/demo/demo.mp4`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], 'demo.mp4', { type: 'video/mp4' });
      await handleFile(file);
    } catch (err) {
      console.error('[sample] failed to load demo video:', err);
    } finally {
      setSampleLoading(false);
    }
  }

  // ── Keyboard shortcuts ─────────────────────────────────────
  // All mutable values read from refs → no deps needed → stable handler
  const keyHandler = useCallback((e) => {
    // Don't capture inside form inputs — EXCEPT let Delete/Backspace through
    // so the shortcut still works even if a name field hasn't been blurred yet.
    // For Delete/Backspace inside an input: blur the input first, then handle.
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
      if (e.code === 'Delete' || e.code === 'Backspace') {
        // Only intercept if the input is empty — otherwise user is editing text
        if (e.target.value !== '') return;
        e.target.blur();
        // fall through to delete handler below
      } else if (
        (e.code === 'ArrowLeft' || e.code === 'ArrowRight') &&
        e.target.type === 'range'
      ) {
        // fall through — the ±3s seek handler below runs;
        // its e.preventDefault() suppresses the native ±step behavior
      } else {
        return;
      }
    }

    // Ctrl+Z — undo last point action
    if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const stack = undoStackRef.current;
      if (stack.length === 0) return;
      const prev = stack[stack.length - 1];
      undoStackRef.current = stack.slice(0, -1);
      const { points: restored, finalScore } = recomputeScores(prev.points, initialServerRef.current, matchConfigRef.current);
      setPoints(restored);
      setScore(finalScore);
      scoreRef.current = finalScore;
      setPendingStart(prev.pendingStart);
      pendingStartRef.current = prev.pendingStart;
      setStatus({ text: `Undone — ${restored.length} point${restored.length !== 1 ? 's' : ''}`, kind: 'info' });
      clearTimeout(glowTimerRef.current);
      setVideoGlow('info');
      glowTimerRef.current = setTimeout(() => setVideoGlow(null), 1200);
      return;
    }

    // Cancel pending delete if user presses anything other than Delete/Backspace
    if (pendingDeleteRef.current && e.code !== 'Delete' && e.code !== 'Backspace') {
      setPendingDelete(false);
      pendingDeleteRef.current = false;
      clearTimeout(deleteTimerRef.current);
      setVideoGlow(null);
    }

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
      const direction = e.code === 'ArrowLeft' ? -1 : 1;
      video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + direction * 3));
      return;
    }

    if (e.code === 'Delete' || e.code === 'Backspace') {
      e.preventDefault();
      const pts = pointsRef.current;
      if (pendingDeleteRef.current) {
        // Second press — confirm delete
        const lastPt = pts[pts.length - 1];
        if (lastPt) {
          pushUndo();
          const { points: recomputed, finalScore } = recomputeScores(
            pts.filter(p => p.id !== lastPt.id),
            initialServerRef.current,
            matchConfigRef.current
          );
          setPoints(recomputed);
          setScore(finalScore);
          scoreRef.current = finalScore;
          video.currentTime = lastPt.startTime;
          setStatus({ text: `Point #${pts.length} deleted — rewound to ${fmtTime(lastPt.startTime)}`, kind: 'warn' });
          clearTimeout(glowTimerRef.current);
          setVideoGlow('warn');
          glowTimerRef.current = setTimeout(() => setVideoGlow(null), 1500);
        }
        setPendingDelete(false);
        pendingDeleteRef.current = false;
        clearTimeout(deleteTimerRef.current);
      } else {
        // First press — request confirmation
        if (pts.length === 0) {
          setStatus({ text: 'No points recorded yet — press S then E or R to tag one', kind: 'warn' });
          clearTimeout(glowTimerRef.current);
          setVideoGlow('warn');
          glowTimerRef.current = setTimeout(() => setVideoGlow(null), 1500);
          return;
        }
        setPendingDelete(true);
        pendingDeleteRef.current = true;
        setStatus({ text: `Delete point #${pts.length}? Press Delete again to confirm`, kind: 'warn' });
        clearTimeout(glowTimerRef.current);
        setVideoGlow('warn');
        deleteTimerRef.current = setTimeout(() => {
          setPendingDelete(false);
          pendingDeleteRef.current = false;
          setVideoGlow(null);
          setStatus({ text: '', kind: 'idle' });
        }, 3000);
      }
      return;
    }

    if (!['KeyS', 'KeyE', 'KeyR'].includes(e.code)) return;
    e.preventDefault();

    if (e.code === 'KeyS') {
      const t = video.currentTime;
      pushUndo(); // save state so S can be undone (cancels pending start)
      pendingStartRef.current = t;
      setPendingStart(t);
      setStatus({ text: `Start: ${fmtTime(t)} — now press E (P1 wins) or R (P2 wins)`, kind: 'info' });
      clearTimeout(glowTimerRef.current);
      setVideoGlow('info'); // persists until E or R clears it
      return;
    }

    // E or R — end point
    const ps = pendingStartRef.current;
    if (ps === null) {
      setStatus({ text: 'Press S first to mark the rally start', kind: 'warn' });
      clearTimeout(glowTimerRef.current);
      setVideoGlow('warn');
      glowTimerRef.current = setTimeout(() => setVideoGlow(null), 1500);
      return;
    }

    let startTime = ps;
    let endTime = video.currentTime;
    if (Math.abs(endTime - startTime) < 0.05) {
      setStatus({ text: 'Start and end are too close — seek further from S', kind: 'warn' });
      clearTimeout(glowTimerRef.current);
      setVideoGlow('warn');
      glowTimerRef.current = setTimeout(() => setVideoGlow(null), 1500);
      return;
    }
    // Allow marking if user seeked backwards (swap times)
    if (endTime < startTime) [startTime, endTime] = [endTime, startTime];

    const winner = e.code === 'KeyE' ? 1 : 2;
    pushUndo(); // save state before adding point
    const newPt = { id: Date.now(), startTime, endTime, winner };
    const { points: recomputed, finalScore } = recomputeScores([...pointsRef.current, newPt], initialServerRef.current, matchConfigRef.current);

    setPoints(recomputed);
    setScore(finalScore);
    scoreRef.current = finalScore;
    pendingStartRef.current = null;
    setPendingStart(null);

    // Find this point's scoreBefore to show the score at that moment in the video
    const inserted = recomputed.find(p => p.id === newPt.id);
    const scoreAfterThisPoint = addPoint(inserted.scoreBefore, winner, matchConfigRef.current);
    const label = scoreLabel(scoreAfterThisPoint);
    setStatus({
      text: `${winner === 1 ? p1NameRef.current : p2NameRef.current} wins · Score: ${label} · Games: ${scoreAfterThisPoint.currentSet[0]}–${scoreAfterThisPoint.currentSet[1]}`,
      kind: 'success',
    });
    clearTimeout(glowTimerRef.current);
    setVideoGlow('success');
    glowTimerRef.current = setTimeout(() => setVideoGlow(null), 1200);
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
    pushUndo();
    const { points: recomputed, finalScore } = recomputeScores(points.filter(p => p.id !== id), initialServer, matchConfigRef.current);
    setPoints(recomputed);
    setScore(finalScore);
    scoreRef.current = finalScore;
  }

  function editPointWinner(id, newWinner) {
    const { points: recomputed, finalScore } = recomputeScores(
      points.map(p => p.id === id ? { ...p, winner: newWinner } : p),
      initialServer, matchConfigRef.current
    );
    setPoints(recomputed);
    setScore(finalScore);
    scoreRef.current = finalScore;
  }

  function openEditScore(pt) {
    const s = pt.scoreBefore;
    setEditScoreDraft({
      setsStr: s.sets.map(s => `${s.p1}-${s.p2}`).join(' '),
      g1: String(s.currentSet[0]),
      g2: String(s.currentSet[1]),
      p1pts: ptDisplayStr(s.currentGame[0], s.currentGame[1], s.isTiebreak, 0),
      p2pts: ptDisplayStr(s.currentGame[0], s.currentGame[1], s.isTiebreak, 1),
      isTb: s.isTiebreak,
    });
    setEditScoreId(pt.id);
  }

  function saveEditScore() {
    const sets = parseSets(editScoreDraft.setsStr);
    let cg;
    if (editScoreDraft.isTb) {
      cg = [parseInt(editScoreDraft.p1pts) || 0, parseInt(editScoreDraft.p2pts) || 0];
    } else {
      let r1 = displayToPts(editScoreDraft.p1pts);
      let r2 = displayToPts(editScoreDraft.p2pts);
      if (r1 === 4 && r2 === 4) { r1 = 3; r2 = 3; }
      cg = [r1, r2];
    }
    const override = {
      sets,
      currentSet: [parseInt(editScoreDraft.g1) || 0, parseInt(editScoreDraft.g2) || 0],
      currentGame: cg,
      isTiebreak: editScoreDraft.isTb,
      matchWinner: null,
    };
    const updated = points.map(p => p.id === editScoreId ? { ...p, scoreOverride: override } : p);
    const { points: recomputed, finalScore } = recomputeScores(updated, initialServer, matchConfigRef.current);
    setPoints(recomputed);
    setScore(finalScore);
    scoreRef.current = finalScore;

    // Auto-advance to next point in the same game so the user can keep
    // correcting consecutive wrong points without reopening the menu.
    // Stops at any game boundary (game won, set won, match won).
    const editedPt = recomputed.find(p => p.id === editScoreId);
    if (editedPt) {
      const scoreAfter = addPoint(editedPt.scoreBefore, editedPt.winner, matchConfigRef.current);
      const gameOngoing =
        scoreAfter.currentSet[0] === editedPt.scoreBefore.currentSet[0] &&
        scoreAfter.currentSet[1] === editedPt.scoreBefore.currentSet[1] &&
        scoreAfter.sets.length === editedPt.scoreBefore.sets.length &&
        !scoreAfter.matchWinner;
      const idx = recomputed.findIndex(p => p.id === editScoreId);
      const nextPt = recomputed[idx + 1];
      if (gameOngoing && nextPt) {
        openEditScore(nextPt);
        return;
      }
    }
    setEditScoreId(null);
    setEditScoreDraft(null);
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
    const { points: recomputed, finalScore } = recomputeScores(points, initialServer, matchConfigRef.current);
    setPoints(recomputed);
    setScore(finalScore);
    scoreRef.current = finalScore;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialServer]);

  // Recompute all points whenever match config changes
  useEffect(() => {
    if (points.length === 0) return;
    const { points: recomputed, finalScore } = recomputeScores(points, initialServer, matchConfig);
    setPoints(recomputed);
    setScore(finalScore);
    scoreRef.current = finalScore;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchConfig]);

  // ── Session save / load ────────────────────────────────────
  function saveSession() {
    const session = {
      version: 1,
      savedAt: new Date().toISOString(),
      fileName,
      p1Name,
      p2Name,
      initialServer,
      matchConfig,
      scoreboardTheme,
      points,
    };
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(fileName || 'session').replace(/\.[^/.]+$/, '')}-session.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function applySession(session) {
    try {
      const s = typeof session === 'string' ? JSON.parse(session) : session;
      if (!s?.points?.length) return;
      const cfg = s.matchConfig || { noAds: false, matchTiebreak: false };
      const srv = s.initialServer ?? 0;
      setP1Name(s.p1Name || 'Player 1');
      setP2Name(s.p2Name || 'Player 2');
      setInitialServer(srv);
      setMatchConfig(cfg);
      if (s.scoreboardTheme) setScoreboardTheme(s.scoreboardTheme);
      const { points: recomputed, finalScore } = recomputeScores(s.points, srv, cfg);
      setPoints(recomputed);
      pointsRef.current = recomputed;
      setScore(finalScore);
      scoreRef.current = finalScore;
      setRestorePrompt(null);
    } catch (err) {
      console.error('[session] load failed:', err);
    }
  }

  // ── Capture frame ──────────────────────────────────────────
  function captureFrame() {
    const videoEl = videoRef.current;
    if (!videoEl || !videoEl.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width  = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    const sbCanvas = drawScoreboardToCanvas(
      displayState.score,
      [p1Name, p2Name],
      displayState.serving,
      scoreboardTheme
    );
    const margin = Math.round(canvas.height * 0.025);
    // sbCanvas renders at 2×; divide by 2 to get CSS-pixel size
    ctx.drawImage(sbCanvas, margin, margin, sbCanvas.width / 2, sbCanvas.height / 2);
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName || 'thumbnail'}-${fmtTime(currentTime).replace(/:/g, '-')}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/jpeg', 0.92);
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className={`te${videoSrc ? ' te--workspace' : ''}`}>
      {showHelp && (
        <HelpModal names={[p1Name, p2Name]} onAccept={() => setShowHelp(false)} />
      )}
      {!videoSrc && <h1 className="te__title">Court Clipper</h1>}

      {!videoSrc ? (
        <>
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
        {transcodeProgress === null && (
          <button
            className="te__sample-btn"
            onClick={loadSampleVideo}
            disabled={sampleLoading}
          >
            {sampleLoading ? 'Loading sample…' : 'or try a sample match video →'}
          </button>
        )}
        </>
      ) : (
        <div className="te__workspace">
          {/* Top bar */}
          <div className="te__topbar">
            <span className="te__topbar-logo">Court Clipper</span>
            <span className="te__topbar-file">🎬 {fileName}</span>
            <div className="te__topbar-spacer" />
            <button className="te__topbar-btn" onClick={() => setShowHelp(true)} title="How to use">?</button>
            <div className="te__topbar-sep" />
            {points.length > 0 && (
              <button className="te__topbar-btn" onClick={saveSession} title="Download edits as a JSON backup">↓ Save</button>
            )}
            <label className="te__topbar-btn" title="Restore edits from a saved session file">
              ↑ Load
              <input ref={sessionFileInputRef} type="file" accept=".json,application/json"
                className="te__file-input"
                onChange={e => {
                  const f = e.target.files[0];
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = evt => applySession(evt.target.result);
                  reader.readAsText(f);
                  e.target.value = '';
                }} />
            </label>
            <button className="te__topbar-btn" onClick={() => fileInputRef.current.click()}>Change video</button>
            <input ref={fileInputRef} type="file" accept="video/*"
              onChange={e => handleFile(e.target.files[0])} className="te__file-input" />
          </div>

          {/* Restore prompt */}
          {restorePrompt && (
            <div className="te__restore-banner">
              <span className="te__restore-text">
                Found <strong>{restorePrompt.points.length} saved point{restorePrompt.points.length !== 1 ? 's' : ''}</strong> from your last session with this file.
              </span>
              <div className="te__restore-btns">
                <button className="te__restore-yes" onClick={() => applySession(restorePrompt)}>Restore</button>
                <button className="te__restore-no" onClick={() => setRestorePrompt(null)}>Dismiss</button>
              </div>
            </div>
          )}

          {/* Two-column body: content + sidebar */}
          <div className="te__body">
          <div className="te__content">

          {/* Video + scoreboard overlay + custom controls */}
          <div
            className={`te__video-wrap${videoGlow ? ` te__video-wrap--glow-${videoGlow}` : ''}`}
            onMouseDown={() => { if (document.activeElement?.tagName === 'INPUT') document.activeElement.blur(); }}
          >
            <video
              ref={videoRef}
              src={videoSrc}
              className="te__video"
              onLoadedMetadata={() => setDuration(videoRef.current.duration)}
            />
            <div className="te__sb-overlay">
              <Scoreboard
                score={displayState.score}
                names={[p1Name, p2Name]}
                serving={displayState.serving}
                onServingChange={s => { if (s !== serving) setInitialServer(1 - initialServer); }}
                theme={scoreboardTheme}
              />
            </div>
            {/* Custom controls — replaces native browser controls to avoid focus trap */}
            <div className="te__controls">
              <button
                className="te__ctrl-btn"
                onClick={() => { videoRef.current.currentTime = 0; }}
                title="Go to start"
              >⏮</button>
              <button
                className="te__ctrl-btn te__ctrl-btn--play"
                onClick={() => { const v = videoRef.current; if (v.paused) v.play(); else v.pause(); }}
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >{isPlaying ? '⏸' : '▶'}</button>
              <span className="te__ctrl-time">{fmtTime(currentTime)} / {fmtTime(duration)}</span>
              <input
                type="range"
                className="te__ctrl-seek"
                min={0}
                max={duration || 1}
                step={0.01}
                value={currentTime}
                onChange={e => { videoRef.current.currentTime = Number(e.target.value); }}
              />
              <div className="te__vol">
                <button
                  className="te__ctrl-btn"
                  onClick={() => {
                    const next = !isMuted;
                    videoRef.current.muted = next;
                    setIsMuted(next);
                  }}
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{display:'block'}}>
                    <path d="M2 5.5h3l4-3v9l-4-3H2V5.5z" fill="currentColor"/>
                    {(isMuted || volume === 0) ? (
                      <>
                        <line x1="11.5" y1="5.5" x2="15" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        <line x1="15" y1="5.5" x2="11.5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </>
                    ) : volume < 0.4 ? (
                      <path d="M12 6.5a2.5 2.5 0 0 1 0 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none"/>
                    ) : (
                      <>
                        <path d="M12 6a2.5 2.5 0 0 1 0 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none"/>
                        <path d="M13.5 4.5a5 5 0 0 1 0 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none"/>
                      </>
                    )}
                  </svg>
                </button>
                <input
                  type="range"
                  className="te__vol-slider"
                  min={0}
                  max={1}
                  step={0.02}
                  value={isMuted ? 0 : volume}
                  onChange={e => {
                    const v = Number(e.target.value);
                    setVolume(v);
                    videoRef.current.volume = v;
                    if (v > 0 && isMuted) { videoRef.current.muted = false; setIsMuted(false); }
                    if (v === 0 && !isMuted) { videoRef.current.muted = true; setIsMuted(true); }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Status bar — only rendered when there's something to show */}
          {(status.text || pendingStart !== null) && (
            <div className={`te__status te__status--${status.kind}`}>
              {pendingStart !== null && (
                <span className="te__status-marker">● Start: {fmtTime(pendingStart)}</span>
              )}
              {status.text}
            </div>
          )}

          {/* Keyboard hints */}
          <div className="te__hints">
            <span><kbd>Space</kbd> Play / Pause</span>
            <span><kbd>←</kbd><kbd>→</kbd> ±3 sec</span>
            <span><kbd>S</kbd> Mark start</span>
            <span><kbd>E</kbd> P1 wins</span>
            <span><kbd>R</kbd> P2 wins</span>
            <span><kbd>Del</kbd><kbd>Del</kbd> Delete last</span>
            <span><kbd>⌘Z</kbd> Undo</span>
          </div>

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
                                {pt.serving === 0 ? p1Name : p2Name} serving
                              </div>
                              <button
                                className="te__point-menu-item"
                                onClick={() => { openEditScore(pt); setOpenMenuId(null); }}
                              >
                                ✎ Edit score at this point
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
                      {editScoreId === pt.id && editScoreDraft && (
                        <div className="te__edit-score" onClick={e => e.stopPropagation()}>
                          <div className="te__edit-score-title">Edit score before point #{i + 1}</div>
<div className="te__edit-score-row">
                            <label>Past sets</label>
                            <input
                              className="te__edit-score-input"
                              value={editScoreDraft.setsStr}
                              placeholder="e.g. 6-3 7-5"
                              onChange={e => setEditScoreDraft(d => ({ ...d, setsStr: e.target.value }))}
                            />
                          </div>
                          <div className="te__edit-score-row">
                            <label>Current set games</label>
                            <div className="te__edit-score-pair">
                              <input type="number" min="0" max="7" className="te__edit-score-num"
                                value={editScoreDraft.g1}
                                onChange={e => setEditScoreDraft(d => ({ ...d, g1: e.target.value }))} />
                              <span className="te__edit-score-dash">–</span>
                              <input type="number" min="0" max="7" className="te__edit-score-num"
                                value={editScoreDraft.g2}
                                onChange={e => setEditScoreDraft(d => ({ ...d, g2: e.target.value }))} />
                            </div>
                          </div>
                          <div className="te__edit-score-row">
                            <label>Points{editScoreDraft.isTb ? ' (tiebreak)' : ''}</label>
                            {editScoreDraft.isTb ? (
                              <div className="te__edit-score-pair">
                                <input type="number" min="0" className="te__edit-score-num"
                                  value={editScoreDraft.p1pts}
                                  onChange={e => setEditScoreDraft(d => ({ ...d, p1pts: e.target.value }))} />
                                <span className="te__edit-score-dash">–</span>
                                <input type="number" min="0" className="te__edit-score-num"
                                  value={editScoreDraft.p2pts}
                                  onChange={e => setEditScoreDraft(d => ({ ...d, p2pts: e.target.value }))} />
                              </div>
                            ) : (
                              <div className="te__edit-score-pair">
                                <select className="te__edit-score-sel"
                                  value={editScoreDraft.p1pts}
                                  onChange={e => setEditScoreDraft(d => ({ ...d, p1pts: e.target.value }))}>
                                  {['0','15','30','40','Ad'].map(v => <option key={v}>{v}</option>)}
                                </select>
                                <span className="te__edit-score-dash">–</span>
                                <select className="te__edit-score-sel"
                                  value={editScoreDraft.p2pts}
                                  onChange={e => setEditScoreDraft(d => ({ ...d, p2pts: e.target.value }))}>
                                  {['0','15','30','40','Ad'].map(v => <option key={v}>{v}</option>)}
                                </select>
                              </div>
                            )}
                          </div>
                          <label className="te__edit-score-check">
                            <input type="checkbox" checked={editScoreDraft.isTb}
                              onChange={e => setEditScoreDraft(d => ({ ...d, isTb: e.target.checked }))} />
                            Tiebreak
                          </label>
                          {pt.scoreOverride && (
                            <div className="te__edit-score-override-note">
                              <span>⚠ Override active —</span>
                              <button className="te__edit-score-clear-override"
                                onClick={() => {
                                  const updated = points.map(p => p.id === pt.id ? { ...p, scoreOverride: undefined } : p);
                                  const { points: recomputed, finalScore } = recomputeScores(updated, initialServer, matchConfigRef.current);
                                  setPoints(recomputed); setScore(finalScore); scoreRef.current = finalScore;
                                  setEditScoreId(null); setEditScoreDraft(null);
                                }}>
                                clear override
                              </button>
                            </div>
                          )}
                          <div className="te__edit-score-actions">
                            <button className="te__edit-score-save" onClick={saveEditScore}>Save</button>
                            <button className="te__edit-score-cancel" onClick={() => { setEditScoreId(null); setEditScoreDraft(null); }}>Cancel</button>
                          </div>
                        </div>
                      )}
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

          </div>{/* end te__content */}

          {/* ── Persistent settings sidebar ──────── */}
          <div className={`te__sidebar${sidebarOpen ? '' : ' te__sidebar--collapsed'}`}>
            <div className="te__sidebar-body">

              {/* Players section */}
              <div className="te__sb-section">
                <button
                  className="te__sb-section-hdr"
                  onClick={() => sidebarOpen ? setPlayerSetupOpen(o => !o) : setSidebarOpen(true)}
                  title="Players"
                >
                  <span className="te__sb-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                  </span>
                  {sidebarOpen && <span className="te__sb-label">Players</span>}
                  {sidebarOpen && <span className="te__sb-chevron">{playerSetupOpen
                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>}</span>}
                </button>
                {sidebarOpen && playerSetupOpen && (
                  <div className="te__sb-section-body">
                    <div className="te__names te__names--panel">
                      <div className="te__name-field te__name-field--p1">
                        <input id="p1-name-sb" type="text" value={p1Name}
                          onChange={e => setP1Name(e.target.value.slice(0, 20))}
                          maxLength={20} placeholder=" " />
                        <label htmlFor="p1-name-sb">Player/Team 1</label>
                      </div>
                      <div className="te__name-field te__name-field--p2">
                        <input id="p2-name-sb" type="text" value={p2Name}
                          onChange={e => setP2Name(e.target.value.slice(0, 20))}
                          maxLength={20} placeholder=" " />
                        <label htmlFor="p2-name-sb">Player/Team 2</label>
                      </div>
                    </div>
                    <div className="te__serve-picker">
                      <span className="te__serve-picker-label">Serves first</span>
                      <button className={`te__serve-pill te__serve-pill--p1${initialServer === 0 ? ' te__serve-pill--active' : ''}`}
                        onClick={() => setInitialServer(0)}>🎾 {p1Name}</button>
                      <button className={`te__serve-pill te__serve-pill--p2${initialServer === 1 ? ' te__serve-pill--active' : ''}`}
                        onClick={() => setInitialServer(1)}>🎾 {p2Name}</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Match Settings section */}
              <div className="te__sb-section">
                <button
                  className="te__sb-section-hdr"
                  onClick={() => sidebarOpen ? setMatchSettingsOpen(o => !o) : setSidebarOpen(true)}
                  title="Match Settings"
                >
                  <span className="te__sb-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                  </span>
                  {sidebarOpen && <span className="te__sb-label">Match Settings</span>}
                  {sidebarOpen && <span className="te__sb-chevron">{matchSettingsOpen
                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>}</span>}
                </button>
                {sidebarOpen && matchSettingsOpen && (
                  <div className="te__sb-section-body">
                    <div className="te__setting-row">
                      <span className="te__setting-row-label">3rd Set</span>
                      <div className="te__setting-pills">
                        <button className={`te__setting-pill${!matchConfig.matchTiebreak ? ' te__setting-pill--active' : ''}`}
                          onClick={() => setMatchConfig(c => ({ ...c, matchTiebreak: false }))}>Full Set</button>
                        <button className={`te__setting-pill${matchConfig.matchTiebreak ? ' te__setting-pill--active' : ''}`}
                          onClick={() => setMatchConfig(c => ({ ...c, matchTiebreak: true }))}>Match Tiebreak</button>
                      </div>
                    </div>
                    <div className="te__setting-row">
                      <span className="te__setting-row-label">Scoring</span>
                      <div className="te__setting-pills">
                        <button className={`te__setting-pill${!matchConfig.noAds ? ' te__setting-pill--active' : ''}`}
                          onClick={() => setMatchConfig(c => ({ ...c, noAds: false }))}>Ads</button>
                        <button className={`te__setting-pill${matchConfig.noAds ? ' te__setting-pill--active' : ''}`}
                          onClick={() => setMatchConfig(c => ({ ...c, noAds: true }))}>No-Ads</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Scoreboard section */}
              <div className="te__sb-section">
                <button
                  className="te__sb-section-hdr"
                  onClick={() => sidebarOpen ? setScoreboardSectionOpen(o => !o) : setSidebarOpen(true)}
                  title="Scoreboard"
                >
                  <span className="te__sb-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/></svg>
                  </span>
                  {sidebarOpen && <span className="te__sb-label">Scoreboard</span>}
                  {sidebarOpen && <span className="te__sb-chevron">{scoreboardSectionOpen
                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>}</span>}
                </button>
                {sidebarOpen && scoreboardSectionOpen && (
                  <div className="te__sb-section-body">
                    <ScorePreview
                      score={displayState.score}
                      names={[p1Name, p2Name]}
                      serving={displayState.serving}
                      theme={scoreboardTheme}
                      scale={0.78}
                    />
                    <button className="te__customize-btn" onClick={() => setShowCustomizer(true)}>✦ Customize scoreboard</button>
                    <button className="te__capture-btn" onClick={captureFrame} title="Download current frame with scoreboard as JPEG">📷 Capture frame</button>
                  </div>
                )}
              </div>

              {/* Export section */}
              <div className="te__sb-section">
                <button
                  className="te__sb-section-hdr"
                  onClick={() => sidebarOpen ? null : setSidebarOpen(true)}
                  title="Export"
                  style={{ cursor: sidebarOpen ? 'default' : 'pointer' }}
                >
                  <span className="te__sb-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3"/><polyline points="7 10 12 15 17 10"/><path d="M3 17v1a3 3 0 003 3h12a3 3 0 003-3v-1"/></svg>
                  </span>
                  {sidebarOpen && <span className="te__sb-label">Export</span>}
                </button>
                {sidebarOpen && (
                  <div className="te__sb-section-body">
                    <VideoExporter
                      videoFile={videoFile}
                      points={points}
                      fileName={fileName}
                      names={[p1Name, p2Name]}
                      serving={serving}
                      scoreboardTheme={scoreboardTheme}
                    />
                  </div>
                )}
              </div>

            </div>

            {/* Collapse toggle — bottom of sidebar like Mailchimp */}
            <button
              className="te__sidebar-toggle"
              onClick={() => setSidebarOpen(o => !o)}
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {/* sidebar-panel icon — left panel fills when open, flips when collapsed */}
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1.5" y="1.5" width="15" height="15" rx="2.5"/>
                <line x1="6.5" y1="1.5" x2="6.5" y2="16.5"/>
                {sidebarOpen
                  ? <rect x="1.5" y="1.5" width="5" height="15" rx="2.5" fill="currentColor" fillOpacity="0.35" stroke="none"/>
                  : <rect x="11.5" y="1.5" width="5" height="15" rx="2.5" fill="currentColor" fillOpacity="0.35" stroke="none"/>}
              </svg>
            </button>
          </div>

          </div>{/* end te__body */}

          {/* ── Scoreboard customizer modal ──────── */}
          {showCustomizer && (
            <div className="te__customize-overlay" onClick={() => setShowCustomizer(false)}>
              <div className="te__customize-modal" onClick={e => e.stopPropagation()}>
                <div className="te__customize-modal-header">
                  <span className="te__customize-modal-title">✦ Scoreboard Customizer</span>
                  <button className="te__customize-modal-close" onClick={() => setShowCustomizer(false)}>✕</button>
                </div>
                <div className="te__customize-modal-body">
                  <div className="te__customize-modal-preview">
                    <div className="te__customize-preview-label">1st set</div>
                    <ScorePreview
                      score={PREVIEW_SCORE_S1}
                      theme={scoreboardTheme}
                      scale={0.95}
                    />
                    <div className="te__customize-preview-divider" />
                    <div className="te__customize-preview-label">3rd set tiebreak</div>
                    <ScorePreview
                      score={PREVIEW_SCORE_TB}
                      theme={scoreboardTheme}
                      scale={0.95}
                    />
                  </div>
                  <div className="te__customize-modal-controls">
                    <ScoreboardCustomizer
                      theme={scoreboardTheme}
                      onChange={setScoreboardTheme}
                      embedded
                    />
                  </div>
                </div>
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
