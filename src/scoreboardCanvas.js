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
  const PAD_H  = theme.paddingH ?? 0;
  const PT_GAP = theme.gameScoreGap ?? 0;
  const W      = DOT_W + NAME_W + SET_W * MAX_SETS + PT_GAP + PT_W + PAD_H * 2;
  const ROW_H  = (theme.cellPaddingV ?? 13) * 2 + 28;
  const H      = ROW_H * 2;

  // Footer: rendered outside the main bg, with a transparent gap
  const FOOTER_GAP  = theme.footerVisible && theme.footerText ? (theme.footerGap ?? 8) : 0;
  const FOOTER_PILL = theme.footerVisible && theme.footerText ? 24 : 0;
  const TOTAL_H     = H + FOOTER_GAP + FOOTER_PILL;

  const canvas = document.createElement('canvas');
  canvas.width  = W * SCALE;
  canvas.height = TOTAL_H * SCALE;
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

  // Offsets — shift content right by PAD_H
  const xDot  = PAD_H;
  const xName = PAD_H + DOT_W;
  const xSets = Array.from({ length: MAX_SETS }, (_, i) => xName + NAME_W + i * SET_W);
  const xPt   = xName + NAME_W + SET_W * MAX_SETS + PT_GAP; // gap pushes PT column right

  // ── Main scoreboard background ───────────────────────────
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

    // Player badge / logo (if set)
    const badgeData = pi === 0 ? T.p1Badge : T.p2Badge;
    let nameOffsetX = xName + 6;

    if (badgeData) {
      // Draw badge inline before the name — badge height capped to 1.2× name font size
      const badgeSize = Math.round(18 * 1.2); // 18px font * 1.2 = ~21px
      try {
        const img = new window.Image();
        img.src = badgeData;
        // Images may not be loaded synchronously in canvas; skip if not ready
        if (img.complete && img.naturalWidth > 0) {
          const aspect = img.naturalWidth / img.naturalHeight;
          const bH = badgeSize;
          const bW = Math.min(bH * aspect, 28);
          ctx.drawImage(img, nameOffsetX, y + ROW_H / 2 - bH / 2, bW, bH);
          nameOffsetX += bW + 5;
        }
      } catch (_) { /* ignore */ }
    }

    // Player name
    ctx.fillStyle = score.matchWinner === pi + 1 ? T.servingColor : T.nameText;
    ctx.font = `${T.nameFontWeight || 700} 18px ${T.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(names[pi].toUpperCase(), nameOffsetX, y + ROW_H / 2);

    // Subtitle (e.g. UTR rating)
    if (T.subtitleVisible) {
      const subtitle = pi === 0 ? T.p1Subtitle : T.p2Subtitle;
      if (subtitle) {
        const nameWidth = ctx.measureText(names[pi].toUpperCase()).width;
        ctx.font = `600 10px ${T.fontFamily}`;
        ctx.fillStyle = T.nameText;
        ctx.globalAlpha = 0.7;
        ctx.fillText(subtitle.toUpperCase(), nameOffsetX + nameWidth + 6, y + ROW_H / 2);
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

    // PT column left divider (only draw when no gap — gap already separates visually)
    if (PT_GAP === 0) {
      ctx.strokeStyle = T.dividerColor;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(xPt, y);
      ctx.lineTo(xPt, y + ROW_H);
      ctx.stroke();
    }

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

  // ── Footer label — drawn outside main bg with transparent gap ──
  if (FOOTER_PILL > 0) {
    const fY    = H + FOOTER_GAP;
    const fW    = Math.min(W * 0.8, 260);
    const align = T.footerAlign || 'center';
    const fX    = align === 'flex-start' ? 0
                : align === 'flex-end'   ? W - fW
                : (W - fW) / 2;           // center
    const pillR = T.footerRadius ?? (T.footerPill ? FOOTER_PILL / 2 : (T.outerRadius || 3));

    ctx.fillStyle = T.footerBg;
    ctx.beginPath();
    ctx.roundRect(fX, fY, fW, FOOTER_PILL - 2, pillR);
    ctx.fill();

    ctx.fillStyle = T.footerTextColor;
    ctx.font = `bold 10px ${T.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(T.footerText.toUpperCase(), fX + fW / 2, fY + (FOOTER_PILL - 2) / 2);
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
