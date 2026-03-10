import { useState, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import './VideoExporter.css';

export default function VideoExporter({ videoFile, points, fileName }) {
  const [phase, setPhase] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [stepLabel, setStepLabel] = useState('');
  const [secsLeft, setSecsLeft] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

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

    const ffmpeg = new FFmpeg();

    ffmpeg.on('progress', ({ progress: p }) => {
      if (phaseRef.current === 'concat') {
        tick(0.70 + Math.min(p, 1) * 0.25);
      }
    });

    try {
      // ── 1. Load local core (public/ffmpeg/) — no CDN, no CORS ──
      const base = `${window.location.origin}/ffmpeg`;
      console.log('[export] loading core from', base);

      await ffmpeg.load({
        coreURL: `${base}/ffmpeg-core.js`,
        wasmURL: `${base}/ffmpeg-core.wasm`,
      });
      console.log('[export] FFmpeg ready');

      setPhase('working');
      phaseRef.current = 'working';

      // ── 2. Mount the video via WORKERFS ────────────────────────
      // WORKERFS lets the FFmpeg worker read the File lazily — no
      // full copy into memory, so multi-GB files work fine.
      setStepLabel('Mounting video…');
      tick(0.03);
      console.log('[export] mounting file:', videoFile.name, (videoFile.size / 1e9).toFixed(2), 'GB');
      await ffmpeg.createDir('/input');
      await ffmpeg.mount('WORKERFS', { blobs: [{ name: 'video.mp4', data: videoFile }] }, '/input');
      console.log('[export] WORKERFS mounted');

      // ── 3. Extract each segment ─────────────────────────────────
      const segNames = [];
      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        const name = `seg${i}.mp4`;
        tick(0.05 + (i / points.length) * 0.60);
        setStepLabel(`Extracting clip ${i + 1} of ${points.length}…`);
        console.log(`[export] cutting seg${i}: ${pt.startTime.toFixed(2)}–${pt.endTime.toFixed(2)}`);

        await ffmpeg.exec([
          '-ss', pt.startTime.toFixed(3),
          '-to', pt.endTime.toFixed(3),
          '-i', '/input/video.mp4',   // mounted via WORKERFS
          '-c', 'copy',
          '-avoid_negative_ts', 'make_zero',
          '-reset_timestamps', '1',
          name,
        ]);
        segNames.push(name);
      }

      // ── 4. Build concat manifest ────────────────────────────────
      tick(0.68);
      setStepLabel('Stitching clips…');
      const manifest = segNames.map(n => `file '${n}'`).join('\n');
      await ffmpeg.writeFile('list.txt', manifest);
      console.log('[export] concat list:\n', manifest);

      // ── 5. Concatenate into one file ────────────────────────────
      phaseRef.current = 'concat';
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'list.txt',
        '-c', 'copy',
        'output.mp4',
      ]);
      console.log('[export] concat done');

      // ── 6. Download ─────────────────────────────────────────────
      tick(0.97);
      setStepLabel('Preparing download…');
      const out = await ffmpeg.readFile('output.mp4');
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
      console.log('[export] download triggered');

      await ffmpeg.unmount('/input');
      console.log('[export] WORKERFS unmounted');

      setProgress(1);
      setPhase('done');
      setStepLabel('');
      setSecsLeft(null);
      phaseRef.current = 'done';

    } catch (err) {
      console.error('[export] failed at step:', stepLabel, err);
      try { await ffmpeg.unmount('/input'); } catch (_) {}
      setPhase('error');
      phaseRef.current = 'error';
      setErrorMsg(err?.message || String(err));
    }
  }

  return (
    <div className="exp">
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
