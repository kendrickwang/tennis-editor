import { useState, useRef, useEffect, useCallback } from 'react';
import './ClipTrimmer.css';

function fmt(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const tenths = Math.floor((s % 1) * 10);
  return `${m}:${String(sec).padStart(2, '0')}.${tenths}`;
}

function ClipTrimmer({ videoRef, duration }) {
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Refs hold live values so pointer handlers never go stale
  const startRef = useRef(0);
  const endRef = useRef(0);
  const durationRef = useRef(0);
  const timelineRef = useRef(null);
  const draggingRef = useRef(null);

  // Reset when a new video / duration arrives
  useEffect(() => {
    durationRef.current = duration || 0;
    startRef.current = 0;
    endRef.current = duration || 0;
    setStartTime(0);
    setEndTime(duration || 0);
    setCurrentTime(0);
  }, [duration]);

  // Sync playback state from the video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.currentTime >= endRef.current) {
        video.pause();
        video.currentTime = endRef.current;
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, [videoRef]);

  const getFrac = useCallback((clientX) => {
    const rect = timelineRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  // Stable pointer-move handler — reads exclusively from refs
  const onPointerMove = useCallback((e) => {
    if (!draggingRef.current) return;
    const dur = durationRef.current;
    if (!dur) return;
    const time = getFrac(e.clientX) * dur;
    const video = videoRef.current;
    const type = draggingRef.current;

    if (type === 'start') {
      const t = Math.max(0, Math.min(time, endRef.current - 0.1));
      startRef.current = t;
      setStartTime(t);
      if (video) video.currentTime = t;
    } else if (type === 'end') {
      const t = Math.min(dur, Math.max(time, startRef.current + 0.1));
      endRef.current = t;
      setEndTime(t);
      if (video) video.currentTime = t;
    } else if (type === 'playhead') {
      const t = Math.max(startRef.current, Math.min(endRef.current, time));
      setCurrentTime(t);
      if (video) video.currentTime = t;
    }
  }, [getFrac, videoRef]);

  const onPointerUp = useCallback(() => {
    draggingRef.current = null;
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
  }, [onPointerMove]);

  const startDrag = (type) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = type;
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  };

  const handleTrackClick = (e) => {
    if (draggingRef.current) return;
    const dur = durationRef.current;
    if (!dur) return;
    const t = Math.max(startRef.current, Math.min(endRef.current, getFrac(e.clientX) * dur));
    setCurrentTime(t);
    if (videoRef.current) videoRef.current.currentTime = t;
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
    } else {
      if (video.currentTime >= endRef.current || video.currentTime < startRef.current) {
        video.currentTime = startRef.current;
      }
      video.play();
    }
  };

  const dur = duration || 0;
  const startFrac = dur ? startTime / dur : 0;
  const endFrac = dur ? endTime / dur : 1;
  const currentFrac = dur ? currentTime / dur : 0;

  return (
    <div className="trimmer">
      <div className="trimmer__labels">
        <span className="trimmer__label-in">In &nbsp;{fmt(startTime)}</span>
        <span className="trimmer__label-now">{fmt(currentTime)}</span>
        <span className="trimmer__label-out">Out &nbsp;{fmt(endTime)}</span>
      </div>

      <div className="trimmer__timeline" ref={timelineRef} onClick={handleTrackClick}>
        {/* Full-width track */}
        <div className="trimmer__track-bg" />

        {/* Highlighted clip region */}
        <div
          className="trimmer__region"
          style={{ left: `${startFrac * 100}%`, width: `${(endFrac - startFrac) * 100}%` }}
        />

        {/* Start (in) handle */}
        <div
          className="trimmer__handle trimmer__handle--start"
          style={{ left: `${startFrac * 100}%` }}
          onPointerDown={startDrag('start')}
        />

        {/* End (out) handle */}
        <div
          className="trimmer__handle trimmer__handle--end"
          style={{ left: `${endFrac * 100}%` }}
          onPointerDown={startDrag('end')}
        />

        {/* Playhead */}
        <div
          className="trimmer__playhead"
          style={{ left: `${currentFrac * 100}%` }}
          onPointerDown={startDrag('playhead')}
        />
      </div>

      <div className="trimmer__controls">
        <button className="trimmer__play-btn" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <span className="trimmer__clip-len">Clip: {fmt(Math.max(0, endTime - startTime))}</span>
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
      <path d="M6 3l15 9-15 9V3z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
      <rect x="5" y="3" width="4" height="18" rx="1" />
      <rect x="15" y="3" width="4" height="18" rx="1" />
    </svg>
  );
}

export default ClipTrimmer;
