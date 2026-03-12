// Renders the broadcast scoreboard onto an offscreen HTMLCanvasElement.
// Used by VideoExporter to burn the overlay into exported clips.

import { DEFAULT_THEME } from './scoreboardTheme';

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
export function drawScoreboardToCanvas(score, names, serving = 0, theme = DEFAULT_THEME) {
  const SCALE  = 2;
  const DOT_W  = 24;
  const NAME_W = 138;
  const SET_W  = 40;
  const PT_W   = 58;
  const W      = DOT_W + NAME_W + SET_W * MAX_SETS + PT_W; // 340
  const ROW_H  = theme.cellPaddingV * 2 + 28; // ~50 at default padding
  const H      = ROW_H * 2;

  // Footer height if enabled
  const FOOTER_H = theme.footerVisible && theme.footerText ? 24 : 0;

  const canvas = document.createElement('canvas');
  canvas.width  = W * SCALE;
  canvas.height = (H + FOOTER_H) * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  const T = theme; // shorthand

  // Build set column data
  const allSets = Array.from({ length: MAX_SETS }, (_, i) => {
    if (i < score.sets.length)
      return { ...score.sets[i], status: 'completed' };
    if (i === score.sets.length && !score.matchWinner)
      return { p1: score.currentSet[0], p2: score.currentSet[1], status: 'current' };
    return null;
  });

  const xDot  = 0;
  const xName = DOT_W;
  const xSets = Array.from({ length: MAX_SETS }, (_, i) => xName + NAME_W + i * SET_W);
  const xPt   = xName + NAME_W + SET_W * MAX_SETS;

  // ── Background ──────────────────────────────────────────
  ctx.fillStyle = T.bg;
  const r = T.outerRadius || 3;
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, r);
  ctx.fill();

  // ── Player rows ─────────────────────────────────────────
  for (let pi = 0; pi < 2; pi++) {
    const y  = pi * ROW_H;
    const pt = ptDisplay(score.currentGame[0], score.currentGame[1], score.isTiebreak, pi);

    // Row divider
    if (pi === 1) {
      ctx.strokeStyle = T.dividerColor;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Serving dot (filled circle)
    if (serving === pi) {
      ctx.fillStyle = T.servingColor;
      ctx.beginPath();
      ctx.arc(xDot + DOT_W / 2, y + ROW_H / 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player name
    ctx.fillStyle = score.matchWinner === pi + 1 ? T.servingColor : T.nameText;
    ctx.font = `${T.nameFontWeight || 700} 18px ${T.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(names[pi].toUpperCase(), xName + 6, y + ROW_H / 2);

    // Subtitle (e.g. UTR rating)
    if (T.subtitleVisible) {
      const subtitle = pi === 0 ? T.p1Subtitle : T.p2Subtitle;
      if (subtitle) {
        const nameWidth = ctx.measureText(names[pi].toUpperCase()).width;
        ctx.font = `600 10px ${T.fontFamily}`;
        ctx.fillStyle = T.nameText;
        ctx.globalAlpha = 0.7;
        ctx.fillText(subtitle.toUpperCase(), xName + 6 + nameWidth + 6, y + ROW_H / 2);
        ctx.globalAlpha = 1;
      }
    }

    // Set columns
    allSets.forEach((s, si) => {
      const isCurrent = s?.status === 'current';
      const mine   = s !== null ? (pi === 0 ? s.p1 : s.p2) : null;
      const theirs = s !== null ? (pi === 0 ? s.p2 : s.p1) : null;
      const isSetWon = s?.status === 'completed' && mine > theirs;
      const x = xSets[si];
      const cr = T.cellRadius || 0;

      if (isCurrent) {
        ctx.fillStyle = T.setActiveBg;
        if (cr > 0) {
          ctx.beginPath();
          ctx.roundRect(x, y, SET_W, ROW_H, cr);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, SET_W, ROW_H);
        }
        ctx.fillStyle = T.setActiveText;
      } else {
        ctx.fillStyle = s === null
          ? 'rgba(255,255,255,0.1)'
          : isSetWon ? T.setWinText : T.setInactiveText;
      }

      if (s !== null) {
        ctx.font = `${isCurrent || isSetWon ? 'bold' : 'normal'} 18px ${T.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(mine), x + SET_W / 2, y + ROW_H / 2);

        // Tiebreak superscript
        if (s?.tiebreak !== undefined && mine < theirs) {
          ctx.font = `normal 9px ${T.fontFamily}`;
          ctx.globalAlpha = 0.7;
          ctx.fillText(String(s.tiebreak), x + SET_W / 2 + 8, y + ROW_H / 2 - 6);
          ctx.globalAlpha = 1;
        }
      }
    });

    // PT cell background
    const cr = T.cellRadius || 0;
    ctx.fillStyle = T.gameScoreBg;
    if (cr > 0) {
      ctx.beginPath();
      ctx.roundRect(xPt, y, PT_W, ROW_H, cr);
      ctx.fill();
    } else {
      ctx.fillRect(xPt, y, PT_W, ROW_H);
    }

    // PT column left divider
    ctx.strokeStyle = T.dividerColor;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(xPt, y);
    ctx.lineTo(xPt, y + ROW_H);
    ctx.stroke();

    // Game points text
    ctx.fillStyle = T.gameScoreText;
    ctx.font = `bold 22px ${T.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pt, xPt + PT_W / 2, y + ROW_H / 2);
  }

  // ── Match winner banner ──────────────────────────────────
  if (score.matchWinner) {
    ctx.fillStyle = T.servingColor + '1a'; // 10% opacity
    ctx.fillRect(0, H - 20, W, 20);
    ctx.fillStyle = T.servingColor;
    ctx.font = `bold 10px ${T.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${names[score.matchWinner - 1].toUpperCase()} WINS`, W / 2, H - 10);
  }

  // ── Footer label ─────────────────────────────────────────
  if (FOOTER_H > 0) {
    ctx.fillStyle = T.footerBg;
    const pillR = T.footerPill ? FOOTER_H / 2 : (T.outerRadius || 3);
    const fY = H + 4;
    const fW = Math.min(W * 0.8, 260);
    const fX = (W - fW) / 2;
    ctx.beginPath();
    ctx.roundRect(fX, fY, fW, FOOTER_H - 8, pillR);
    ctx.fill();

    ctx.fillStyle = T.footerTextColor;
    ctx.font = `bold 10px ${T.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(T.footerText.toUpperCase(), W / 2, fY + (FOOTER_H - 8) / 2);
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
