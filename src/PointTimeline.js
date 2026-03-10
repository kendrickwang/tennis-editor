import { useRef } from 'react';
import { scoreLabel } from './tennisScore';
import './PointTimeline.css';

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function PointTimeline({ points, duration, currentTime, pendingStart, onSeek }) {
  const trackRef = useRef(null);

  if (!duration) return null;

  function handleClick(e) {
    const rect = trackRef.current.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(frac * duration);
  }

  const playheadPct = (currentTime / duration) * 100;

  return (
    <div className="ptl">
      <div className="ptl__header">
        <span className="ptl__title">Timeline</span>
        <span className="ptl__count">{points.length} point{points.length !== 1 ? 's' : ''} recorded</span>
      </div>

      <div className="ptl__track-wrap" ref={trackRef} onClick={handleClick}>
        {/* Gray base track */}
        <div className="ptl__track-bg" />

        {/* Recorded point segments */}
        {points.map(pt => {
          const left = (pt.startTime / duration) * 100;
          const width = Math.max(((pt.endTime - pt.startTime) / duration) * 100, 0.3);
          const label = scoreLabel(pt.scoreBefore);
          const isP1 = pt.winner === 1;
          return (
            <div
              key={pt.id}
              className={`ptl__segment ${isP1 ? 'ptl__segment--p1' : 'ptl__segment--p2'}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${fmtTime(pt.startTime)}–${fmtTime(pt.endTime)} · ${label} · P${pt.winner} wins`}
            >
              {width > 2.5 && <span className="ptl__label">{label}</span>}
            </div>
          );
        })}

        {/* Pending start marker */}
        {pendingStart !== null && (
          <div
            className="ptl__pending-marker"
            style={{ left: `${(pendingStart / duration) * 100}%` }}
            title={`Rally start: ${fmtTime(pendingStart)}`}
          />
        )}

        {/* Playhead */}
        <div className="ptl__playhead" style={{ left: `${playheadPct}%` }} />
      </div>

      {/* Time ruler */}
      <div className="ptl__ruler">
        <span>0:00</span>
        <span>{fmtTime(duration * 0.25)}</span>
        <span>{fmtTime(duration * 0.5)}</span>
        <span>{fmtTime(duration * 0.75)}</span>
        <span>{fmtTime(duration)}</span>
      </div>

      {/* Legend */}
      <div className="ptl__legend">
        <span className="ptl__legend-item ptl__legend-item--p1">P1 wins</span>
        <span className="ptl__legend-item ptl__legend-item--p2">P2 wins</span>
        <span className="ptl__legend-item ptl__legend-item--gap">Gap</span>
      </div>
    </div>
  );
}
