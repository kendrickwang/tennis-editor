export const DEFAULT_THEME = {
  // ── Colors ─────────────────────────────────────────────────
  bg:                  '#0a1929',
  dividerColor:        'rgba(255,255,255,0.07)',

  nameText:            '#ffffff',
  nameFontWeight:      '700',

  setInactiveBg:       'transparent',
  setInactiveText:     'rgba(255,255,255,0.55)',
  setActiveBg:         '#FFD700',
  setActiveText:       '#000000',
  setWinText:          '#ffffff',

  gameScoreBg:         '#FFD700',
  gameScoreText:       '#000000',
  gameScoreAdvBg:      '#FFD700',

  servingColor:        '#FFD700',

  // ── Typography ─────────────────────────────────────────────
  fontFamily:          "system-ui, -apple-system, 'Segoe UI', sans-serif",

  // ── Layout ─────────────────────────────────────────────────
  cellPaddingV:        13,    // px
  outerRadius:         0,     // px
  cellRadius:          0,     // px
  paddingH:            0,     // px – horizontal padding inside scoreboard bg

  // ── Game score border ───────────────────────────────────────
  gameScoreBorderWidth: 0,    // px, 0–3
  gameScoreBorderColor: '#FFD700',

  // ── Footer label ───────────────────────────────────────────
  footerVisible:       false,
  footerText:          '',
  footerBg:            'rgba(0,0,0,0.75)',
  footerTextColor:     '#ffffff',
  footerPill:          true,
  footerGap:           8,     // px transparent gap between main scoreboard and footer

  // ── Inline secondary text (e.g. "UTR 9.5") ─────────────────
  subtitleVisible:     false,
  p1Subtitle:          '',
  p2Subtitle:          '',

  // ── Player badge / logo image ──────────────────────────────
  p1Badge:             null,   // data URL string or null
  p2Badge:             null,
};

export const PRESETS = {
  'US Open': {
    ...DEFAULT_THEME,
  },

  'Modern Blue': {
    ...DEFAULT_THEME,
    bg:               '#0d1b3e',
    setActiveBg:      '#2563eb',
    setActiveText:    '#ffffff',
    setWinText:       '#fbbf24',
    gameScoreBg:      '#2563eb',
    gameScoreText:    '#ffffff',
    servingColor:     '#fbbf24',
    cellPaddingV:     12,
  },

  'UTR Style': {
    ...DEFAULT_THEME,
    bg:               '#111111',
    dividerColor:     'rgba(255,255,255,0.12)',
    setActiveBg:      '#c8a84b',
    setActiveText:    '#000000',
    setWinText:       '#c8a84b',
    gameScoreBg:      '#c8a84b',
    gameScoreText:    '#000000',
    servingColor:     '#c8a84b',
    fontFamily:       "'Georgia', 'Times New Roman', serif",
    subtitleVisible:  true,
    cellPaddingV:     10,
  },

  'Club / Bright': {
    ...DEFAULT_THEME,
    bg:               '#1e3a5f',
    dividerColor:     'rgba(255,255,255,0.1)',
    setActiveBg:      '#b5d422',
    setActiveText:    '#1e3a5f',
    setWinText:       '#b5d422',
    gameScoreBg:      '#b5d422',
    gameScoreText:    '#1e3a5f',
    servingColor:     '#ffffff',
    outerRadius:      6,
    cellRadius:       3,
    cellPaddingV:     13,
    footerVisible:    true,
    footerText:       'CLUB MATCH',
    footerBg:         '#b5d422',
    footerTextColor:  '#1e3a5f',
    footerPill:       true,
  },
};

export const FONT_OPTIONS = [
  { label: 'System (default)',  value: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { label: 'Impact (broadcast)', value: "Impact, 'Arial Narrow', sans-serif" },
  { label: 'Georgia (classic)', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Monospace',         value: "'Courier New', Courier, monospace" },
  { label: 'Arial Narrow',      value: "'Arial Narrow', Arial, sans-serif" },
  { label: 'Verdana',           value: "Verdana, Geneva, sans-serif" },
];

// ── Design rules ────────────────────────────────────────────

// Hard clamping ranges for numeric layout values
export const LAYOUT_RULES = {
  cellPaddingV:         { min: 10, max: 18 }, // < 10px feels cramped; > 18px scoreboard too tall
  outerRadius:          { min: 0,  max: 12 }, // > 12px looks like a pill, not a scoreboard
  cellRadius:           { min: 0,  max: 8  }, // cells should never be rounder than the container
  paddingH:             { min: 0,  max: 20 }, // horizontal padding inside scoreboard background
  gameScoreBorderWidth: { min: 0,  max: 3  }, // border around game score cell
  footerGap:            { min: 0,  max: 24 }, // transparent gap between scoreboard and footer
};

// Minimum acceptable contrast ratios (WCAG-based)
// Large text (≥18pt bold / ≥14pt bold) needs 3:1; normal text needs 4.5:1
export const CONTRAST_RULES = {
  setActiveText_vs_setActiveBg:     { min: 4.5, label: 'Active set text' },
  gameScoreText_vs_gameScoreBg:     { min: 4.5, label: 'Game score text' },
  nameText_vs_bg:                   { min: 3.0, label: 'Player name' },
  servingColor_vs_bg:               { min: 2.0, label: 'Serving dot' },
  footerTextColor_vs_footerBg:      { min: 4.5, label: 'Footer text' },
};

// ── WCAG contrast utilities ──────────────────────────────────

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  if (h.length !== 6) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors. Returns 1–21. */
export function contrastRatio(hex1, hex2) {
  if (!hex1?.startsWith('#') || !hex2?.startsWith('#')) return 1;
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker  = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Returns the contrast grade for a ratio:
 *  'good' ≥ 4.5:1  (WCAG AA for normal text)
 *  'ok'   ≥ 3:1    (WCAG AA for large/bold text)
 *  'poor' < 3:1    (fails all WCAG levels)
 */
export function contrastGrade(ratio) {
  if (ratio >= 4.5) return 'good';
  if (ratio >= 3.0) return 'ok';
  return 'poor';
}

/**
 * Returns '#000000' or '#ffffff', whichever has better contrast against bgHex.
 */
export function autoTextColor(bgHex) {
  if (!bgHex?.startsWith('#')) return '#ffffff';
  const onBlack = contrastRatio(bgHex, '#000000');
  const onWhite = contrastRatio(bgHex, '#ffffff');
  return onWhite >= onBlack ? '#ffffff' : '#000000';
}

/**
 * Sanitize a theme object:
 * - Clamps all numeric layout values to LAYOUT_RULES ranges
 * - Enforces cellRadius ≤ outerRadius + 2
 *
 * Does NOT auto-rewrite colors (that would interfere with active editing).
 * Use autoTextColor() explicitly when a background color changes.
 */
export function sanitizeTheme(raw) {
  const t = { ...raw };
  const { cellPaddingV, outerRadius, cellRadius, paddingH, gameScoreBorderWidth, footerGap } = LAYOUT_RULES;

  t.cellPaddingV         = clamp(t.cellPaddingV         ?? 13, cellPaddingV.min,         cellPaddingV.max);
  t.outerRadius          = clamp(t.outerRadius          ?? 0,  outerRadius.min,          outerRadius.max);
  // Cell radius must not exceed the outer radius (looks broken otherwise)
  const maxCell          = Math.min(cellRadius.max, t.outerRadius + 2);
  t.cellRadius           = clamp(t.cellRadius           ?? 0,  cellRadius.min,           maxCell);
  t.paddingH             = clamp(t.paddingH             ?? 0,  paddingH.min,             paddingH.max);
  t.gameScoreBorderWidth = clamp(t.gameScoreBorderWidth ?? 0,  gameScoreBorderWidth.min, gameScoreBorderWidth.max);
  t.footerGap            = clamp(t.footerGap            ?? 8,  footerGap.min,            footerGap.max);

  return t;
}

/**
 * Run all contrast checks and return an array of violations:
 * [{ key, label, ratio, grade, fix: () => correctedTheme }]
 */
export function getContrastViolations(theme) {
  const checks = [
    { fgKey: 'setActiveText',  bgKey: 'setActiveBg',   ...CONTRAST_RULES.setActiveText_vs_setActiveBg },
    { fgKey: 'gameScoreText',  bgKey: 'gameScoreBg',   ...CONTRAST_RULES.gameScoreText_vs_gameScoreBg },
    { fgKey: 'nameText',       bgKey: 'bg',             ...CONTRAST_RULES.nameText_vs_bg },
    { fgKey: 'servingColor',   bgKey: 'bg',             ...CONTRAST_RULES.servingColor_vs_bg },
    ...(theme.footerVisible ? [
      { fgKey: 'footerTextColor', bgKey: 'footerBg',   ...CONTRAST_RULES.footerTextColor_vs_footerBg },
    ] : []),
  ];

  return checks.map(({ fgKey, bgKey, min, label }) => {
    const ratio = contrastRatio(theme[fgKey], theme[bgKey]);
    const grade = contrastGrade(ratio);
    return {
      fgKey, bgKey, label, ratio: Math.round(ratio * 10) / 10, grade,
      passes: ratio >= min,
    };
  }).filter(v => !v.passes);
}
