import { useRef, useState, useEffect } from 'react';
import { scoreLabel } from './tennisScore';
import './PointTimeline.css';

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// Pick a ruler interval that gives ~5-7 marks across the visible window
function rulerInterval(viewDuration) {
  const target = 6;
  const nice = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 3600];
  return nice.find(p => viewDuration / p <= target) ?? nice[nice.length - 1];
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 20;
const ZOOM_STEP = 1.6; // per button click or scroll tick

export default function PointTimeline({ points, duration, currentTime, pendingStart, onSeek, names = ['P1', 'P2'] }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(0); // left edge as fraction of total duration

  const trackRef = useRef(null);

  // ── Derived window ──────────────────────────────────────────
  const maxPan = Math.max(0, 1 - 1 / zoom);
  const safePan = Math.min(pan, maxPan);
  const viewDuration = duration ? duration / zoom : 0;
  const viewStart = safePan * (duration || 0);
  const viewEnd = viewStart + viewDuration;

  function timeToPercent(t) {
    return ((t - viewStart) / viewDuration) * 100;
  }

  // ── Zoom helpers ────────────────────────────────────────────
  function applyZoom(newZoom, anchorFrac) {
    newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    const anchorTime = viewStart + anchorFrac * viewDuration;
    const newViewDuration = (duration || 0) / newZoom;
    const newViewStart = anchorTime - anchorFrac * newViewDuration;
    const newMaxPan = Math.max(0, 1 - 1 / newZoom);
    setPan(Math.max(0, Math.min(newMaxPan, newViewStart / (duration || 1))));
    setZoom(newZoom);
  }

  function zoomIn()  { applyZoom(zoom * ZOOM_STEP, duration ? currentTime / duration : 0.5); }
  function zoomOut() { applyZoom(zoom / ZOOM_STEP, duration ? currentTime / duration : 0.5); }
  function zoomReset() { setZoom(1); setPan(0); }

  // ── Wheel: passive:false so we can preventDefault ───────────
  // Must be above the early return to satisfy Rules of Hooks
  useEffect(() => {
    const el = trackRef.current;
    if (!el || !duration) return;

    function onWheel(e) {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseFrac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

      const isTrackpad = Math.abs(e.deltaY) < 50 && !e.ctrlKey;

      if (!isTrackpad || e.ctrlKey) {
        // Mouse wheel or pinch → zoom
        const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
        if (newZoom === zoom) return;
        const anchorTime = viewStart + mouseFrac * viewDuration;
        const newViewDuration = duration / newZoom;
        const newViewStart = anchorTime - mouseFrac * newViewDuration;
        const newMaxPan = Math.max(0, 1 - 1 / newZoom);
        setPan(Math.max(0, Math.min(newMaxPan, newViewStart / duration)));
        setZoom(newZoom);
      } else {
        // Trackpad two-finger scroll → pan
        const panDelta = (e.deltaX || e.deltaY) / rect.width;
        const newMaxPan = Math.max(0, 1 - 1 / zoom);
        setPan(prev => Math.max(0, Math.min(newMaxPan, prev + panDelta)));
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom, pan, duration, viewStart, viewDuration]);

  // Early return must come after all hooks
  if (!duration) return null;

  // ── Click on track → seek to that time ─────────────────────
  function handleTrackClick(e) {
    const rect = trackRef.current.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(Math.max(0, Math.min(duration, viewStart + frac * viewDuration)));
  }

  // ── Ruler marks ─────────────────────────────────────────────
  const interval = rulerInterval(viewDuration);
  const firstMark = Math.ceil(viewStart / interval) * interval;
  const rulerMarks = [];
  for (let t = firstMark; t <= viewEnd + 0.001; t += interval) {
    rulerMarks.push(t);
  }

  const playheadPct = timeToPercent(currentTime);
  const zoomLabel = zoom <= 1 ? '1×' : `${zoom.toFixed(zoom < 2 ? 1 : 0)}×`;

  return (
    <div className="ptl">
      {/* Header */}
      <div className="ptl__header">
        <div className="ptl__header-left">
          <span className="ptl__title">Timeline</span>
          <span className="ptl__count">{points.length} point{points.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="ptl__zoom-controls">
          <button className="ptl__zoom-btn" onClick={zoomOut} disabled={zoom <= MIN_ZOOM} title="Zoom out">−</button>
          <button className="ptl__zoom-label" onClick={zoomReset} title="Reset zoom">{zoomLabel}</button>
          <button className="ptl__zoom-btn" onClick={zoomIn}  disabled={zoom >= MAX_ZOOM} title="Zoom in">+</button>
        </div>
      </div>

      {/* Scrollable viewport hint (only when zoomed) */}
      {zoom > 1 && (
        <div className="ptl__minimap">
          <div
            className="ptl__minimap-window"
            style={{ left: `${safePan * 100}%`, width: `${(1 / zoom) * 100}%` }}
          />
        </div>
      )}

      {/* Main track */}
      <div className="ptl__track-wrap" ref={trackRef} onClick={handleTrackClick}>
        <div className="ptl__track-bg" />

        {/* Point segments — only render if visible */}
        {points.map(pt => {
          if (pt.endTime < viewStart || pt.startTime > viewEnd) return null;
          const leftPct  = timeToPercent(pt.startTime);
          const rightPct = timeToPercent(pt.endTime);
          const clampedLeft  = Math.max(0, leftPct);
          const clampedRight = Math.min(100, rightPct);
          const widthPct = Math.max(clampedRight - clampedLeft, 0.3);
          const label = scoreLabel(pt.scoreBefore);
          return (
            <div
              key={pt.id}
              className={`ptl__segment ${pt.winner === 1 ? 'ptl__segment--p1' : 'ptl__segment--p2'}`}
              style={{ left: `${clampedLeft}%`, width: `${widthPct}%` }}
              title={`${fmtTime(pt.startTime)}–${fmtTime(pt.endTime)} · ${label} · ${pt.winner === 1 ? names[0] : names[1]} wins`}
              onClick={e => { e.stopPropagation(); onSeek(pt.startTime); }}
            >
              {widthPct > 2.5 && <span className="ptl__label">{label}</span>}
            </div>
          );
        })}

        {/* Pending start marker */}
        {pendingStart !== null && pendingStart >= viewStart && pendingStart <= viewEnd && (
          <div
            className="ptl__pending-marker"
            style={{ left: `${timeToPercent(pendingStart)}%` }}
            title={`Rally start: ${fmtTime(pendingStart)}`}
          />
        )}

        {/* Playhead */}
        {playheadPct >= 0 && playheadPct <= 100 && (
          <div className="ptl__playhead" style={{ left: `${playheadPct}%` }} />
        )}
      </div>

      {/* Ruler */}
      <div className="ptl__ruler-wrap">
        {rulerMarks.map(t => (
          <div
            key={t}
            className="ptl__ruler-mark"
            style={{ left: `${timeToPercent(t)}%` }}
          >
            {fmtTime(t)}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="ptl__legend">
        <span className="ptl__legend-item ptl__legend-item--p1">{names[0]} wins</span>
        <span className="ptl__legend-item ptl__legend-item--p2">{names[1]} wins</span>
        <span className="ptl__legend-item ptl__legend-item--gap">Gap</span>
        {zoom > 1 && <span className="ptl__legend-item ptl__legend-item--scroll">Scroll to pan · Pinch or scroll to zoom</span>}
      </div>
    </div>
  );
}
