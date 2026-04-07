// Renders the broadcast scoreboard onto an offscreen HTMLCanvasElement.
// Used by VideoExporter to burn the overlay into exported clips.
//
// ⚠️  Keep this file in sync with Scoreboard.js + Scoreboard.css.
//     The two rendering paths must produce visually identical output.

import { DEFAULT_THEME } from './scoreboardTheme';

const MAX_SETS = 3;

// Mirrors playerPtDisplay() in Scoreboard.js exactly
function ptDisplay(p1, p2, isTb, idx) {
  const [mine, theirs] = idx === 0 ? [p1, p2] : [p2, p1];
  if (isTb) return String(mine);
  if (mine >= 3 && theirs >= 3) {
    if (mine === theirs) return '40';
    return mine > theirs ? 'Ad' : '40';
  }
  return ['0', '15', '30', '40'][mine] ?? '0';
}

// Returns an HTMLCanvasElement with the scoreboard drawn at 2× resolution.
export function drawScoreboardToCanvas(score, names, serving = 0, theme = DEFAULT_THEME) {
  const SCALE  = 2;

  // ── Column widths — MUST match Scoreboard.css ────────────────────
  const DOT_W  = 24;   // .sb__td--dot  { width: 24px }
  const SET_W  = 40;   // .sb__td--set  { width: 40px }
  const PT_W   = 58;   // .sb__td--pt   { width: 58px }
  const PAD_H  = theme.paddingH ?? 0;
  const PT_GAP = theme.gameScoreGap ?? 0;

  // ── Set column data — filter nulls, SAME as Scoreboard.js ─────────
  // Scoreboard.js uses .filter(s => s !== null) so only visible sets appear.
  // This makes the name column expand to fill the 340px table width.
  const allSets = Array.from({ length: MAX_SETS }, (_, i) => {
    if (i < score.sets.length)
      return { ...score.sets[i], status: 'completed' };
    if (i === score.sets.length && !score.matchWinner)
      return { p1: score.currentSet[0], p2: score.currentSet[1], status: 'current' };
    return null;
  }).filter(s => s !== null);

  const numSets = allSets.length;

  // ── Dimensions ────────────────────────────────────────────────────
  // Inner table is always 340px (matches .sb__table { width: 340px }).
  // NAME_W expands to fill whatever space the set columns don't use.
  const INNER_W = 340;
  const NAME_W  = INNER_W - DOT_W - numSets * SET_W - PT_GAP - PT_W;
  const W       = INNER_W + PAD_H * 2;

  // Row height calibrated to match CSS:
  //   padding-top(cellPaddingV) + line-height(~1.2 × 20px font) + padding-bottom
  //   ≈ 13 + 24 + 13 = 50px for the default theme.
  // Font sizes mirror CSS: .sb__td--set and .sb__td--pt use font-size: 1.25rem (20px).
  const ROW_H = (theme.cellPaddingV ?? 10) * 2 + 24;
  const H     = ROW_H * 2;

  // Footer: outside main bg, with transparent gap
  const FOOTER_GAP  = theme.footerVisible && theme.footerText ? (theme.footerGap ?? 8) : 0;
  const FOOTER_H    = theme.footerVisible && theme.footerText ? 22 : 0; // matches ~0.65rem + 5px pad×2
  const TOTAL_H     = H + FOOTER_GAP + FOOTER_H;

  const canvas = document.createElement('canvas');
  canvas.width  = W * SCALE;
  canvas.height = TOTAL_H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  const T = theme;

  // ── Column x-offsets (PAD_H shifts all content right) ─────────────
  const xDot  = PAD_H;
  const xName = PAD_H + DOT_W;
  const xSets = allSets.map((_, i) => xName + NAME_W + i * SET_W);
  const xPt   = xName + NAME_W + numSets * SET_W + PT_GAP;

  // ── Main scoreboard background ─────────────────────────────────────
  ctx.fillStyle = T.bg;
  const r = T.outerRadius || 0;
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, r);
  ctx.fill();

  // ── Player rows ────────────────────────────────────────────────────
  for (let pi = 0; pi < 2; pi++) {
    const y  = pi * ROW_H;
    const pt = ptDisplay(score.currentGame[0], score.currentGame[1], score.isTiebreak, pi);

    // Row divider — matches CSS: .sb__row + .sb__row { border-top: 1px solid ... }
    if (pi === 1) {
      ctx.strokeStyle = T.dividerColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Serving dot — filled circle, mirrors the ● bullet in CSS
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
      // Badge height = 1.2em where em = name font size (16px) — matches .sb__badge { height: 1.2em }
      const bH = Math.round(16 * 1.2); // 19px
      try {
        const img = new window.Image();
        img.src = badgeData;
        if (img.complete && img.naturalWidth > 0) {
          const aspect = img.naturalWidth / img.naturalHeight;
          const bW = Math.min(bH * aspect, 28); // max-width: 28px matches CSS
          ctx.drawImage(img, nameOffsetX, y + ROW_H / 2 - bH / 2, bW, bH);
          nameOffsetX += bW + 5;
        }
      } catch (_) { /* ignore */ }
    }

    // Player name
    // CSS: font-size: 1rem (16px), font-weight: 700 (or T.nameFontWeight), uppercase
    ctx.fillStyle = score.matchWinner === pi + 1 ? T.servingColor : T.nameText;
    ctx.font = `${T.nameFontWeight || 700} 16px ${T.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(names[pi].toUpperCase(), nameOffsetX, y + ROW_H / 2);

    // Subtitle (e.g. UTR rating)
    // CSS: font-size: 0.55rem (≈9px), font-weight: 600, opacity: 0.75
    if (T.subtitleVisible) {
      const subtitle = pi === 0 ? T.p1Subtitle : T.p2Subtitle;
      if (subtitle) {
        const nameWidth = ctx.measureText(names[pi].toUpperCase()).width;
        ctx.font = `600 9px ${T.fontFamily}`;
        ctx.fillStyle = T.nameText;
        ctx.globalAlpha = 0.75;
        ctx.fillText(subtitle.toUpperCase(), nameOffsetX + nameWidth + 6, y + ROW_H / 2);
        ctx.globalAlpha = 1;
      }
    }

    // Set columns
    allSets.forEach((s, si) => {
      const isCurrent = s?.status === 'current';
      const mine   = pi === 0 ? s.p1 : s.p2;
      const theirs = pi === 0 ? s.p2 : s.p1;
      const isSetWon = s?.status === 'completed' && mine > theirs;
      const x  = xSets[si];
      const cr = T.cellRadius || 0;

      // Cell background
      // CSS: .sb__td--set has setInactiveBg on all cells; .sb__td--current-set overrides with setActiveBg
      const cellBg = isCurrent ? T.setActiveBg : (T.setInactiveBg || 'transparent');
      if (cellBg && cellBg !== 'transparent') {
        ctx.fillStyle = cellBg;
        if (cr > 0) {
          ctx.beginPath();
          ctx.roundRect(x, y, SET_W, ROW_H, cr);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, SET_W, ROW_H);
        }
      }

      // Cell text color + weight
      // CSS: inactive=700, set-win=900, current=900 (all 1.25rem = 20px)
      if (isCurrent) {
        ctx.fillStyle = T.setActiveText;
      } else if (isSetWon) {
        ctx.fillStyle = T.setWinText;
      } else {
        ctx.fillStyle = T.setInactiveText;
      }

      ctx.font = `${isCurrent || isSetWon ? 900 : 700} 20px ${T.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(mine), x + SET_W / 2, y + ROW_H / 2);

      // Tiebreak superscript — CSS: font-size: 0.5rem (8px), opacity: 0.7
      if (s?.tiebreak !== undefined && mine < theirs) {
        ctx.font = `normal 8px ${T.fontFamily}`;
        ctx.globalAlpha = 0.7;
        ctx.fillText(String(s.tiebreak), x + SET_W / 2 + 8, y + ROW_H / 2 - 7);
        ctx.globalAlpha = 1;
      }
    });

    // PT cell background
    // CSS: .sb__td--pt { background: var(--sb-game-bg, #FFD700); border-radius: var(--sb-cell-radius, 0) }
    const cr = T.cellRadius || 0;
    ctx.fillStyle = T.gameScoreBg;
    if (cr > 0) {
      ctx.beginPath();
      ctx.roundRect(xPt, y, PT_W, ROW_H, cr);
      ctx.fill();
    } else {
      ctx.fillRect(xPt, y, PT_W, ROW_H);
    }

    // Game points text
    // CSS: font-size: 1.25rem (20px), font-weight: 900
    ctx.fillStyle = T.gameScoreText;
    ctx.font = `900 20px ${T.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pt, xPt + PT_W / 2, y + ROW_H / 2);
  }

  // ── Match winner banner ────────────────────────────────────────────
  // CSS: background 10% serving color, 1px border-top at 25%, font 0.72rem/900
  if (score.matchWinner) {
    const bannerH = 22; // matches CSS padding: 6px + ~10px text height + 6px

    // Background overlay
    ctx.fillStyle = T.servingColor + '1a'; // 10% opacity
    ctx.fillRect(0, H - bannerH, W, bannerH);

    // Border-top (25% opacity) — matches CSS border-top: 1px solid color-mix(...25%...)
    ctx.strokeStyle = T.servingColor + '40'; // 25% opacity (0x40 = 64 ≈ 25%)
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H - bannerH);
    ctx.lineTo(W, H - bannerH);
    ctx.stroke();

    // Text — CSS: font-size: 0.72rem (≈12px), font-weight: 900, letter-spacing 0.14em, uppercase
    ctx.fillStyle = T.servingColor;
    ctx.font = `900 12px ${T.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${names[score.matchWinner - 1].toUpperCase()} WINS`, W / 2, H - bannerH / 2);
  }

  // ── Footer label — outside main bg, transparent gap above ──────────
  // CSS: font-size: 0.65rem (≈11px), font-weight: 800, uppercase, padding: 5px 16px
  if (FOOTER_H > 0) {
    const fY    = H + FOOTER_GAP;
    const align = T.footerAlign || 'center';
    const pillR = T.footerRadius ?? (T.footerPill ? 99 : (T.outerRadius || 4));

    // Measure text FIRST so we can size the pill to fit — mirrors CSS:
    //   .sb__footer { display: inline-block; padding: 5px 16px; max-width: 80% }
    // which shrinks the pill to text-width + 32px (16px per side), capped at 80%.
    ctx.font = `800 11px ${T.fontFamily}`;
    const textW = ctx.measureText(T.footerText.toUpperCase()).width;
    const fW    = Math.min(textW + 32, W * 0.8); // 16px padding × 2 sides, cap at 80%

    // Position — mirrors CSS sb__footer-outer { justify-content: <align> }
    // The footer-outer spans the full canvas width with no extra offset;
    // only sb__main (the main box) has PAD_H padding, not the footer container.
    const fX = align === 'flex-start' ? 0
             : align === 'flex-end'   ? W - fW
             : (W - fW) / 2; // center

    ctx.fillStyle = T.footerBg;
    ctx.beginPath();
    ctx.roundRect(fX, fY, fW, FOOTER_H, pillR);
    ctx.fill();

    ctx.fillStyle = T.footerTextColor;
    // ctx.font already set above
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(T.footerText.toUpperCase(), fX + fW / 2, fY + FOOTER_H / 2);
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
