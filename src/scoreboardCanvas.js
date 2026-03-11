// Renders the broadcast scoreboard onto an offscreen HTMLCanvasElement.
// Used by VideoExporter to burn the overlay into exported clips.

const MAX_SETS = 3;

function ptDisplay(p1, p2, isTb, idx) {
  const [mine, theirs] = idx === 0 ? [p1, p2] : [p2, p1];
  if (isTb) return String(mine);
  if (mine >= 3 && theirs >= 3) {
    if (mine === theirs) return '40';
    return mine > theirs ? 'Ad' : '40';
  }
  return ['0', '15', '30', '40'][mine] ?? '0';
}

// Returns an HTMLCanvasElement with the scoreboard drawn at 2x resolution.
export function drawScoreboardToCanvas(score, names, serving = 0) {
  const SCALE  = 2;
  const DOT_W  = 24;
  const NAME_W = 138;
  const SET_W  = 40;
  const PT_W   = 58;
  const W      = DOT_W + NAME_W + SET_W * MAX_SETS + PT_W; // 340
  const HEADER_H = 18;
  const ROW_H    = 50;
  const H        = HEADER_H + ROW_H * 2; // 118

  const canvas = document.createElement('canvas');
  canvas.width  = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  // Build set column data
  const allSets = Array.from({ length: MAX_SETS }, (_, i) => {
    if (i < score.sets.length)
      return { p1: score.sets[i].p1, p2: score.sets[i].p2, status: 'completed' };
    if (i === score.sets.length && !score.matchWinner)
      return { p1: score.currentSet[0], p2: score.currentSet[1], status: 'current' };
    return null;
  });

  const xDot  = 0;
  const xName = DOT_W;
  const xSets = Array.from({ length: MAX_SETS }, (_, i) => xName + NAME_W + i * SET_W);
  const xPt   = xName + NAME_W + SET_W * MAX_SETS;

  // ── Background ───────────────────────────────────────────
  ctx.fillStyle = '#0a1929';
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 3);
  ctx.fill();

  // ── Header row ───────────────────────────────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, W, HEADER_H);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, HEADER_H);
  ctx.lineTo(W, HEADER_H);
  ctx.stroke();

  ctx.font = 'bold 7px Impact, Arial Narrow, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  allSets.forEach((s, i) => {
    const x = xSets[i];
    if (s?.status === 'current') {
      ctx.fillStyle = 'rgba(255,215,0,0.18)';
      ctx.fillRect(x, 0, SET_W, HEADER_H);
      ctx.fillStyle = '#FFD700';
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
    }
    ctx.fillText(String(i + 1), x + SET_W / 2, HEADER_H / 2);
  });

  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillText('Pt', xPt + PT_W / 2, HEADER_H / 2);

  // ── Player rows ──────────────────────────────────────────
  for (let pi = 0; pi < 2; pi++) {
    const y  = HEADER_H + pi * ROW_H;
    const pt = ptDisplay(score.currentGame[0], score.currentGame[1], score.isTiebreak, pi);

    // Row divider
    if (pi === 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Serving dot (filled circle)
    if (serving === pi) {
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(xDot + DOT_W / 2, y + ROW_H / 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player name
    ctx.fillStyle = score.matchWinner === pi + 1 ? '#FFD700' : '#ffffff';
    ctx.font = 'bold 18px Impact, Arial Narrow, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(names[pi].toUpperCase(), xName + 6, y + ROW_H / 2);

    // Set columns
    allSets.forEach((s, si) => {
      const isCurrent = s?.status === 'current';
      const mine   = s !== null ? (pi === 0 ? s.p1 : s.p2) : null;
      const theirs = s !== null ? (pi === 0 ? s.p2 : s.p1) : null;
      const isSetWon = s?.status === 'completed' && mine > theirs;
      const x = xSets[si];

      if (isCurrent) {
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(x, y, SET_W, ROW_H);
        ctx.fillStyle = '#000000';
      } else {
        ctx.fillStyle = s === null
          ? 'rgba(255,255,255,0.1)'
          : isSetWon ? '#ffffff' : 'rgba(255,255,255,0.55)';
      }

      if (s !== null) {
        ctx.font = `${isCurrent || isSetWon ? 'bold' : 'normal'} 18px Impact, Arial Narrow, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(mine), x + SET_W / 2, y + ROW_H / 2);
      }
    });

    // PT column divider
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(xPt, y);
    ctx.lineTo(xPt, y + ROW_H);
    ctx.stroke();

    // Game points
    ctx.fillStyle = pt === 'Ad' ? '#FFD700' : '#ffffff';
    ctx.font = 'bold 22px Impact, Arial Narrow, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pt, xPt + PT_W / 2, y + ROW_H / 2);
  }

  return canvas;
}

// Converts a canvas to a Uint8Array PNG for FFmpeg.
export function canvasToUint8Array(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) return reject(new Error('Canvas toBlob failed'));
      blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)), reject);
    }, 'image/png');
  });
}
