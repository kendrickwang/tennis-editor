import { useState, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { drawScoreboardToCanvas, canvasToUint8Array } from './scoreboardCanvas';
import './VideoExporter.css';

// Maximum parallel FFmpeg workers. Each worker needs ~50 MB (32 MB WASM heap +
// worker overhead). 6 workers keeps peak overhead ~300 MB — fine on modern machines.
const PARALLEL = 6;

// Returns a scale filter fragment that downscales to at most `res` lines.
// Returns null for 'source' (no scaling needed).
function scaleFilter(res) {
  const h = { '1080': 1080, '720': 720, '480': 480 }[res];
  return h ? `scale=-2:min(${h}\\,ih)` : null;
}

// Compute the output width in pixels for a given resolution setting and
// source video dimensions (used to size the scoreboard proportionally).
// For known resolutions, width = height * (16/9). For 'source', use
// the probed source width directly.
export function outputWidthForRes(res, sourceWidth, sourceHeight) {
  const h = { '1080': 1080, '720': 720, '480': 480 }[res];
  if (!h) return sourceWidth; // 'source'
  // If source is narrower than target, don't upscale
  if (sourceHeight <= h) return sourceWidth;
  return Math.round(sourceWidth * (h / sourceHeight));
}

// Build the FFmpeg filter_complex string for scoreboard overlay.
// Exported for unit testing — this is the contract that must never break.
//
// Rules:
//   1. Video is scaled to output resolution BEFORE overlay (saves decode work).
//   2. Scoreboard canvas (SCALE=2, ~680px wide) is scaled to match the
//      proportion it occupies in the web app overlay (~26.6% of 1280px = 340px).
//      For other output widths: sbPx = round(outputWidth × 340 / 1280), even.
//   3. Audio must be re-encoded (not copied) with reset timestamps to stay in
//      sync with the re-encoded video stream.
export function buildFilterComplex(sf, sbPx) {
  // Round scoreboard px to nearest even number (libx264 requirement)
  const sb = Math.round(sbPx / 2) * 2;
  const sbFilter = `[1:v]scale=${sb}:-2[sb]`;
  if (sf) {
    // Scale video down first, then composite scoreboard
    return `[0:v]${sf}[scaled];${sbFilter};[scaled][sb]overlay=14:14[vout]`;
  }
  // Source resolution — no video scaling
  return `${sbFilter};[0:v][sb]overlay=14:14[vout]`;
}

// Probe the natural dimensions of a video File using the browser's video
// element — free, no FFmpeg required.
export function probeVideoDimensions(videoFile) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const { videoWidth, videoHeight } = video;
      URL.revokeObjectURL(video.src);
      resolve({ width: videoWidth, height: videoHeight });
    };
    video.onerror = reject;
    video.src = URL.createObjectURL(videoFile);
  });
}

export default function VideoExporter({ videoFile, points, fileName, names = ['P1', 'P2'], serving = 0, scoreboardTheme }) {
  const [phase, setPhase] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [stepLabel, setStepLabel] = useState('');
  const [secsLeft, setSecsLeft] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [outputRes, setOutputRes] = useState('720');

  const startedAt = useRef(null);
  const phaseRef = useRef('idle');

  const canExport = Boolean(videoFile && points.length > 0);
  const isRunning = phase === 'loading' || phase === 'working';

  function tick(prog) {
    setProgress(prog);
    if (!startedAt.current || prog < 0.02) return;
    const elapsed = (Date.now() - startedAt.current) / 1000;
    setSecsLeft(Math.max(0, Math.ceil((elapsed / prog) - elapsed)));
  }

  async function runExport() {
    if (!canExport || isRunning) return;

    setPhase('loading');
    phaseRef.current = 'loading';
    setProgress(0);
    setStepLabel('Initialising FFmpeg…');
    setSecsLeft(null);
    setErrorMsg('');
    startedAt.current = Date.now();

    try {
      // ── 1. Fetch WASM as blob URLs once — all workers share them ────────
      const base = `${window.location.origin}${process.env.PUBLIC_URL}/ffmpeg`;
      const coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm');

      setPhase('working');
      phaseRef.current = 'working';

      // Pre-load any custom web font before canvas rendering
      if (showScoreboard && scoreboardTheme?.fontFamily) {
        try { await document.fonts.load(`700 16px ${scoreboardTheme.fontFamily}`); } catch (_) {}
      }

      // ── 2. Spin up workers and process clips in parallel ─────────────────
      // Divide points into contiguous chunks — each worker seeks forward
      // through its own portion of the video, minimising seek distance.
      const workers = Math.min(PARALLEL, points.length);
      const chunkSize = Math.ceil(points.length / workers);
      const chunks = Array.from({ length: workers }, (_, wi) => {
        const start = wi * chunkSize;
        return points
          .slice(start, start + chunkSize)
          .map((pt, j) => ({ pt, idx: start + j }));
      }).filter(c => c.length > 0);

      // segDataByIdx[i] will hold the Uint8Array for clip i once encoded
      const segDataByIdx = new Array(points.length);
      let completedClips = 0;

      tick(0.05);
      setStepLabel(`Extracting clips… 0 / ${points.length}`);

      const sf = showScoreboard ? scaleFilter(outputRes) : null;

      // Probe source dimensions so we can size the scoreboard proportionally
      // to the output frame, matching the overlay proportion in the web app.
      let sbPx = 340; // default: 26.6% of 1280px (720p)
      if (showScoreboard) {
        try {
          const { width: srcW, height: srcH } = await probeVideoDimensions(videoFile);
          const outW = outputWidthForRes(outputRes, srcW, srcH);
          sbPx = Math.round(outW * 340 / 1280);
        } catch (_) { /* fallback to 340 */ }
      }

      await Promise.all(chunks.map(async (chunk) => {
        const ff = new FFmpeg();
        await ff.load({ coreURL, wasmURL });
        await ff.createDir('/input');
        // WORKERFS mounts the File object read-only — safe to mount the
        // same File across multiple workers without copying it into memory.
        await ff.mount('WORKERFS', { blobs: [{ name: 'video.mp4', data: videoFile }] }, '/input');

        for (const { pt, idx } of chunk) {
          if (showScoreboard) {
            // Render scoreboard for this point and burn it in
            const canvas = drawScoreboardToCanvas(
              pt.scoreBefore, names, pt.serving ?? serving, scoreboardTheme
            );
            const pngData = await canvasToUint8Array(canvas);
            await ff.writeFile('overlay.png', pngData);

            const fc = buildFilterComplex(sf, sbPx);

            await ff.exec([
              '-ss', pt.startTime.toFixed(3),
              '-to', pt.endTime.toFixed(3),
              '-i', '/input/video.mp4',
              '-i', 'overlay.png',
              '-filter_complex', fc,
              '-map', '[vout]',
              '-map', '0:a?',
              '-c:v', 'libx264',
              // Re-encode audio (NOT copy) so timestamps reset with the video
              // stream. -c:a copy + -reset_timestamps causes audio/video drift.
              '-c:a', 'aac', '-b:a', '128k',
              '-preset', 'ultrafast',
              '-crf', '23',
              '-avoid_negative_ts', 'make_zero',
              '-reset_timestamps', '1',
              'seg.mp4',
            ]);

            await ff.deleteFile('overlay.png');
          } else {
            // No scoreboard — stream-copy (no re-encode, very fast)
            await ff.exec([
              '-ss', pt.startTime.toFixed(3),
              '-to', pt.endTime.toFixed(3),
              '-i', '/input/video.mp4',
              '-c', 'copy',
              '-avoid_negative_ts', 'make_zero',
              '-reset_timestamps', '1',
              'seg.mp4',
            ]);
          }

          segDataByIdx[idx] = await ff.readFile('seg.mp4');
          await ff.deleteFile('seg.mp4');

          // completedClips++ is safe: JS is single-threaded; async callbacks
          // from multiple workers interleave on the main thread without races.
          completedClips++;
          tick(0.05 + (completedClips / points.length) * 0.60);
          setStepLabel(`Extracting clips… ${completedClips} / ${points.length}`);
        }

        await ff.unmount('/input');
        // Terminate the worker immediately — releasing its ~50 MB WASM heap.
        // With 6 workers this frees ~300 MB before the concat phase starts.
        try { ff.terminate(); } catch (_) {}
      }));

      // ── 3. Concatenate all segments ──────────────────────────────────────
      tick(0.68);
      setStepLabel('Stitching clips…');

      const concatFF = new FFmpeg();
      concatFF.on('progress', ({ progress: p }) => {
        tick(0.70 + Math.min(p, 1) * 0.25);
      });
      await concatFF.load({ coreURL, wasmURL });

      for (let i = 0; i < segDataByIdx.length; i++) {
        await concatFF.writeFile(`seg${i}.mp4`, segDataByIdx[i]);
        // Null out the JS reference immediately after writing to the WASM FS
        // so the GC can reclaim it. Without this, all 110 clips (~400 MB) sit
        // in both JS memory and the WASM heap simultaneously.
        segDataByIdx[i] = null;
      }
      const manifest = segDataByIdx.map((_, i) => `file 'seg${i}.mp4'`).join('\n');
      await concatFF.writeFile('list.txt', manifest);

      phaseRef.current = 'concat';
      await concatFF.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'list.txt',
        '-c', 'copy',
        'output.mp4',
      ]);

      // Free segments from WASM heap before reading output
      await concatFF.deleteFile('list.txt');
      for (let i = 0; i < segDataByIdx.length; i++) {
        try { await concatFF.deleteFile(`seg${i}.mp4`); } catch (_) {}
      }

      // ── 4. Download ──────────────────────────────────────────────────────
      tick(0.97);
      setStepLabel('Preparing download…');
      const out = await concatFF.readFile('output.mp4');
      const blob = new Blob([out], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      const base2 = (fileName || 'video').replace(/\.[^/.]+$/, '');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${base2}_edited.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setProgress(1);
      setPhase('done');
      setStepLabel('');
      setSecsLeft(null);
      phaseRef.current = 'done';

    } catch (err) {
      console.error('[export] failed:', err);
      setPhase('error');
      phaseRef.current = 'error';
      const raw = err?.message || String(err);
      const isOOM = raw.includes('memory access out of bounds') || raw.includes('out of memory');
      setErrorMsg(
        isOOM
          ? 'FFmpeg ran out of memory. Try 720p output, fewer clips, or a shorter source video.'
          : raw
      );
    }
  }

  return (
    <div className="exp">
      <label className="exp__toggle">
        <input
          type="checkbox"
          checked={showScoreboard}
          onChange={e => setShowScoreboard(e.target.checked)}
          disabled={isRunning}
        />
        <span>Export video with scoreboard</span>
        {showScoreboard && <span className="exp__toggle-note">re-encodes — slower</span>}
      </label>

      {showScoreboard && (
        <div className="exp__option">
          <span className="exp__option-label">Output resolution</span>
          <select
            className="exp__res-select"
            value={outputRes}
            onChange={e => setOutputRes(e.target.value)}
            disabled={isRunning}
          >
            <option value="source">Source (slowest)</option>
            <option value="1080">1080p</option>
            <option value="720">720p — recommended</option>
            <option value="480">480p (fastest)</option>
          </select>
        </div>
      )}

      {!isRunning && (
        <button
          className={`exp__btn ${!canExport ? 'exp__btn--disabled' : ''} ${phase === 'done' ? 'exp__btn--done' : ''}`}
          onClick={runExport}
          disabled={!canExport}
          title={
            !videoFile ? 'Load a video first' :
            points.length === 0 ? 'Record some points first' : ''
          }
        >
          {phase === 'done'
            ? '✓ Exported — Export Again'
            : `⬇ Export Video${points.length > 0 ? ` (${points.length} clip${points.length !== 1 ? 's' : ''} → 1 file)` : ''}`}
        </button>
      )}

      {isRunning && (
        <div className="exp__progress">
          <div className="exp__progress-header">
            <span className="exp__step">{stepLabel}</span>
            {secsLeft !== null && secsLeft > 1 && (
              <span className="exp__eta">~{secsLeft}s left</span>
            )}
          </div>
          <div className="exp__bar-track">
            <div className="exp__bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <span className="exp__pct">{Math.round(progress * 100)}%</span>
        </div>
      )}

      {phase === 'error' && (
        <div className="exp__error">
          <span>Export failed — {errorMsg}</span>
          <button className="exp__retry" onClick={runExport}>Retry</button>
        </div>
      )}
    </div>
  );
}
