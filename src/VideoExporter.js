import { useState, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { drawScoreboardToCanvas, canvasToUint8Array } from './scoreboardCanvas';
import { isElectron } from './utils/platform';
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

// Returns the clip start time for a point, accounting for serve mode.
// In 'all-serves' mode, clips start from the 1st serve attempt.
// In 'points-only' mode, double faults start from the 1st serve; all other points start normally.
export function clipStartTime(pt, serveMode) {
  if (!serveMode || serveMode === 'disabled') return pt.startTime;
  if (serveMode === 'all-serves' && pt.firstServeTime != null) return pt.firstServeTime;
  if (serveMode === 'points-only' && pt.isDoubleFault && pt.firstServeTime != null) return pt.firstServeTime;
  return pt.startTime;
}

// Probe the natural dimensions of a video using the browser's video element.
// Accepts a File/Blob or a src string (e.g. file:// URL for Electron).
export function probeVideoDimensions(videoFileOrSrc) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    let objectUrl = null;
    video.onloadedmetadata = () => {
      const { videoWidth, videoHeight } = video;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve({ width: videoWidth, height: videoHeight });
    };
    video.onerror = reject;
    if (typeof videoFileOrSrc === 'string') {
      video.src = videoFileOrSrc;
    } else {
      objectUrl = URL.createObjectURL(videoFileOrSrc);
      video.src = objectUrl;
    }
  });
}

export default function VideoExporter({ videoFile, videoFilePath, points, fileName, names = ['P1', 'P2'], serving = 0, scoreboardTheme, matchConfig }) {
  const [phase, setPhase] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [stepLabel, setStepLabel] = useState('');
  const [secsLeft, setSecsLeft] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [showScoreboard, setShowScoreboard] = useState(true);
  const [outputRes, setOutputRes] = useState('720');
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const startedAt = useRef(null);
  const phaseRef = useRef('idle');

  const favoriteCount = points.filter(p => p.isFavorite).length;
  const ptsToExport = favoritesOnly ? points.filter(p => p.isFavorite) : points;
  const hasVideo = isElectron ? Boolean(videoFilePath) : Boolean(videoFile);
  const canExport = Boolean(hasVideo && ptsToExport.length > 0);
  const isRunning = phase === 'loading' || phase === 'working';

  function tick(prog) {
    setProgress(prog);
    if (!startedAt.current || prog < 0.02) return;
    const elapsed = (Date.now() - startedAt.current) / 1000;
    setSecsLeft(Math.max(0, Math.ceil((elapsed / prog) - elapsed)));
  }

  // ── Electron native export ────────────────────────────────────────────────
  async function runExportElectron() {
    if (!canExport || isRunning) return;

    setPhase('loading');
    phaseRef.current = 'loading';
    setProgress(0);
    setStepLabel('Preparing export…');
    setSecsLeft(null);
    setErrorMsg('');
    startedAt.current = Date.now();

    // Ask the user where to save the output before doing any work
    const baseName = (fileName || 'video').replace(/\.[^/.]+$/, '');
    const outputPath = await window.electronAPI.saveOutputFile(`${baseName}_edited.mp4`);
    if (!outputPath) {
      // User cancelled the save dialog — abort cleanly
      setPhase('idle');
      phaseRef.current = 'idle';
      return;
    }

    const tmpFiles = []; // track all temp files for cleanup

    try {
      setPhase('working');
      phaseRef.current = 'working';

      // Pre-load font if needed
      if (showScoreboard && scoreboardTheme?.fontFamily) {
        try { await document.fonts.load(`700 16px ${scoreboardTheme.fontFamily}`); } catch (_) {}
      }

      // Probe source dimensions for scoreboard sizing
      let sbPx = 340;
      if (showScoreboard) {
        try {
          const src = `file://${videoFilePath}`;
          const { width: srcW, height: srcH } = await probeVideoDimensions(src);
          const outW = outputWidthForRes(outputRes, srcW, srcH);
          sbPx = Math.round(outW * 340 / 1280);
        } catch (_) {}
      }

      const sf = showScoreboard ? scaleFilter(outputRes) : null;

      // Register a single progress listener for all ffmpeg jobs
      const jobProgress = {};
      const unsubProgress = window.electronAPI.onFfmpegProgress(({ jobId, progress: p }) => {
        jobProgress[jobId] = p;
      });

      // ── Encode each clip sequentially (native ffmpeg is already fast) ──────
      setStepLabel(`Encoding clips… 0 / ${ptsToExport.length}`);
      tick(0.05);

      const segPaths = [];

      for (let i = 0; i < ptsToExport.length; i++) {
        const pt = ptsToExport[i];
        const jobId = `seg-${i}-${Date.now()}`;
        const segPath = await window.electronAPI.getTempDir()
          .then(d => `${d}/courtclipper-seg-${Date.now()}-${i}.mp4`);
        tmpFiles.push(segPath);

        const startTime = clipStartTime(pt, matchConfig?.serveMode).toFixed(3);
        const endTime   = pt.endTime.toFixed(3);

        let args;
        if (showScoreboard) {
          // Render scoreboard PNG and write to temp file
          const canvas  = drawScoreboardToCanvas(pt.scoreBefore, names, pt.serving ?? serving, scoreboardTheme);
          const pngData = await canvasToUint8Array(canvas);
          const pngPath = await window.electronAPI.writeTempFile(pngData, 'png');
          tmpFiles.push(pngPath);

          const fc = buildFilterComplex(sf, sbPx);
          args = [
            '-ss', startTime,
            '-to', endTime,
            '-i', videoFilePath,
            '-i', pngPath,
            '-filter_complex', fc,
            '-map', '[vout]',
            '-map', '0:a?',
            '-c:v', 'h264_videotoolbox',   // hardware-accelerated on macOS
            '-c:a', 'aac', '-b:a', '128k',
            '-af', 'aresample=async=1',
            '-reset_timestamps', '1',
            '-y', segPath,
          ];
        } else {
          args = [
            '-ss', startTime,
            '-to', endTime,
            '-i', videoFilePath,
            '-c', 'copy',
            '-reset_timestamps', '1',
            '-y', segPath,
          ];
        }

        const result = await window.electronAPI.runFfmpeg(args, jobId);
        if (!result.success) throw new Error(result.error);

        tick(0.05 + ((i + 1) / ptsToExport.length) * 0.75);
        setStepLabel(`Encoding clips… ${i + 1} / ${ptsToExport.length}`);
      }

      unsubProgress();

      // ── Concatenate ───────────────────────────────────────────────────────
      tick(0.82);
      setStepLabel('Stitching clips…');

      const manifest = segPaths.length
        ? segPaths.map(p => `file '${p}'`).join('\n')
        // segPaths wasn't populated above — rebuild from tmpFiles list
        : tmpFiles.filter(p => p.endsWith('.mp4')).map(p => `file '${p}'`).join('\n');

      const listPath = await window.electronAPI.writeTextFile(manifest, 'txt');
      tmpFiles.push(listPath);

      const concatJobId = `concat-${Date.now()}`;
      const concatResult = await window.electronAPI.runFfmpeg([
        '-f', 'concat',
        '-safe', '0',
        '-i', listPath,
        '-c', 'copy',
        '-fflags', '+genpts',
        '-y', outputPath,
      ], concatJobId);

      if (!concatResult.success) throw new Error(concatResult.error);

      setProgress(1);
      setPhase('done');
      setStepLabel('');
      setSecsLeft(null);
      phaseRef.current = 'done';

    } catch (err) {
      console.error('[electron export] failed:', err);
      setPhase('error');
      phaseRef.current = 'error';
      setErrorMsg(err?.message || String(err));
    } finally {
      // Clean up all temp files
      for (const p of tmpFiles) {
        try { await window.electronAPI.deleteFile(p); } catch (_) {}
      }
    }
  }

  // ── Web WASM export ───────────────────────────────────────────────────────
  async function runExport() {
    if (isElectron) return runExportElectron();
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
      const workers = Math.min(PARALLEL, ptsToExport.length);
      const chunkSize = Math.ceil(ptsToExport.length / workers);
      const chunks = Array.from({ length: workers }, (_, wi) => {
        const start = wi * chunkSize;
        return ptsToExport
          .slice(start, start + chunkSize)
          .map((pt, j) => ({ pt, idx: start + j }));
      }).filter(c => c.length > 0);

      // segDataByIdx[i] will hold the Uint8Array for clip i once encoded
      const segDataByIdx = new Array(ptsToExport.length);
      let completedClips = 0;

      tick(0.05);
      setStepLabel(`Extracting clips… 0 / ${ptsToExport.length}`);

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
              '-ss', clipStartTime(pt, matchConfig?.serveMode).toFixed(3),
              '-to', pt.endTime.toFixed(3),
              '-i', '/input/video.mp4',
              '-i', 'overlay.png',
              '-filter_complex', fc,
              '-map', '[vout]',
              '-map', '0:a?',
              '-c:v', 'libx264',
              '-c:a', 'aac', '-b:a', '128k',
              // aresample=async=1 compensates for AAC encoder priming delay
              // (~21 ms) that would otherwise cause audio to start late vs video.
              '-af', 'aresample=async=1',
              '-preset', 'ultrafast',
              '-crf', '23',
              // reset_timestamps alone is sufficient; avoid_negative_ts conflicts
              // with it and causes micro-discontinuities between clips.
              '-reset_timestamps', '1',
              'seg.mp4',
            ]);

            await ff.deleteFile('overlay.png');
          } else {
            // No scoreboard — stream-copy (no re-encode, very fast)
            await ff.exec([
              '-ss', clipStartTime(pt, matchConfig?.serveMode).toFixed(3),
              '-to', pt.endTime.toFixed(3),
              '-i', '/input/video.mp4',
              '-c', 'copy',
              '-reset_timestamps', '1',
              'seg.mp4',
            ]);
          }

          segDataByIdx[idx] = await ff.readFile('seg.mp4');
          await ff.deleteFile('seg.mp4');

          // completedClips++ is safe: JS is single-threaded; async callbacks
          // from multiple workers interleave on the main thread without races.
          completedClips++;
          tick(0.05 + (completedClips / ptsToExport.length) * 0.60);
          setStepLabel(`Extracting clips… ${completedClips} / ${ptsToExport.length}`);
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
        // so the GC can reclaim it. Without this, all clips sit in both JS
        // memory and the WASM heap simultaneously.
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
        // Regenerate presentation timestamps so micro-discontinuities between
        // clips (from input seeking) don't cause skipped frames in playback.
        '-fflags', '+genpts',
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

      <label className={`exp__toggle${favoriteCount === 0 ? ' exp__toggle--disabled' : ''}`}>
        <input
          type="checkbox"
          checked={favoritesOnly}
          onChange={e => setFavoritesOnly(e.target.checked)}
          disabled={isRunning || favoriteCount === 0}
        />
        <span>Favorites only</span>
        {favoriteCount > 0
          ? <span className="exp__toggle-note exp__toggle-note--fav">★ {favoriteCount} of {points.length}</span>
          : <span className="exp__toggle-note">star points to enable</span>}
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
            !hasVideo ? 'Load a video first' :
            points.length === 0 ? 'Record some points first' : ''
          }
        >
          {phase === 'done'
            ? '✓ Exported — Export Again'
            : `⬇ Export Video${ptsToExport.length > 0 ? ` (${ptsToExport.length} clip${ptsToExport.length !== 1 ? 's' : ''} → 1 file)` : ''}`}
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
