export const DEFAULT_THEME = {
  // ── Colors ─────────────────────────────────────────────────
  bg:                  '#38573c',
  dividerColor:        'rgba(255,255,255,0.08)',

  nameText:            '#e4ede6',
  nameFontWeight:      '600',

  setInactiveBg:       'transparent',
  setInactiveText:     'rgba(255,255,255,0.55)',
  setActiveBg:         '#a8c5a2',
  setActiveText:       '#1a2e1c',
  setWinText:          '#a8c5a2',

  gameScoreBg:         '#a8c5a2',
  gameScoreText:       '#1a2e1c',
  gameScoreAdvBg:      '#a8c5a2',

  servingColor:        '#a8c5a2',

  // ── Typography ─────────────────────────────────────────────
  fontFamily:          "'DM Serif Display', Georgia, serif",

  // ── Layout ─────────────────────────────────────────────────
  cellPaddingV:        5,    // px
  outerRadius:         0,     // px
  cellRadius:          0,     // px
  paddingH:            0,     // px – horizontal padding inside scoreboard bg

  // ── Game score gap ──────────────────────────────────────────
  gameScoreGap:        0,     // px transparent gap between sets and game score column

  // ── Footer label ───────────────────────────────────────────
  footerVisible:       false,
  footerText:          '',
  footerBg:            'rgba(0,0,0,0.75)',
  footerTextColor:     '#ffffff',
  footerRadius:        99,    // px corner radius for footer label (99 = pill)
  footerGap:           8,     // px transparent gap between main scoreboard and footer
  footerAlign:         'center', // 'left' | 'center' | 'right'

  // ── Inline secondary text (e.g. "UTR 9.5") ─────────────────
  subtitleVisible:     false,
  p1Subtitle:          '',
  p2Subtitle:          '',

  // ── Player badge / logo image ──────────────────────────────
  p1Badge:             null,   // data URL string or null
  p2Badge:             null,
};

export const PRESETS = {
  'Sage': {
    // Mid forest green + muted sage — organic and botanical (default)
    ...DEFAULT_THEME,
  },

  'US Open': {
    ...DEFAULT_THEME,
    bg:               '#0b0566',
    dividerColor:     'rgba(255,255,255,0.07)',
    nameText:         '#ffffff',
    nameFontWeight:   '700',
    setActiveBg:      '#FFD700',
    setActiveText:    '#000000',
    setWinText:       '#ffffff',
    gameScoreBg:      '#FFD700',
    gameScoreText:    '#000000',
    gameScoreAdvBg:   '#FFD700',
    servingColor:     '#FFD700',
    fontFamily:       "system-ui, -apple-system, 'Segoe UI', sans-serif",
    cellPaddingV:     10,
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
    fontFamily:       "'Space Grotesk', system-ui, sans-serif",
    cellPaddingV:     12,
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
    footerRadius:     99,
  },

  // ── Agency-quality presets ───────────────────────────────────

  'Heritage': {
    // Deep forest green + warm champagne — Wimbledon tradition
    ...DEFAULT_THEME,
    bg:               '#1c3a2a',
    dividerColor:     'rgba(255,255,255,0.08)',
    nameText:         '#f5eed9',
    setActiveBg:      '#e5d08a',
    setActiveText:    '#1c3a2a',
    setWinText:       '#e5d08a',
    gameScoreBg:      '#e5d08a',
    gameScoreText:    '#1c3a2a',
    servingColor:     '#e5d08a',
    fontFamily:       "'DM Serif Display', Georgia, serif",
    nameFontWeight:   '700',
    cellPaddingV:     12,
    outerRadius:      0,
    cellRadius:       0,
  },

  'Terra': {
    // Burnt sienna + warm terracotta — clay court grit
    ...DEFAULT_THEME,
    bg:               '#2c1810',
    dividerColor:     'rgba(255,255,255,0.08)',
    nameText:         '#fff4e8',
    setActiveBg:      '#e8793a',
    setActiveText:    '#000000',
    setWinText:       '#f4a261',
    gameScoreBg:      '#e8793a',
    gameScoreText:    '#000000',
    servingColor:     '#f4a261',
    fontFamily:       "'Oswald', 'Arial Narrow', sans-serif",
    nameFontWeight:   '700',
    cellPaddingV:     10,
    outerRadius:      0,
    cellRadius:       0,
  },

  'Studio': {
    // Near-black slate + indigo + pink serve dot — editorial sports
    ...DEFAULT_THEME,
    bg:               '#0f172a',
    dividerColor:     'rgba(255,255,255,0.06)',
    nameText:         '#e2e8f0',
    setActiveBg:      '#4f46e5',
    setActiveText:    '#ffffff',
    setWinText:       '#818cf8',
    gameScoreBg:      '#4f46e5',
    gameScoreText:    '#ffffff',
    servingColor:     '#f472b6',
    fontFamily:       "'Syne', system-ui, sans-serif",
    nameFontWeight:   '700',
    cellPaddingV:     11,
    outerRadius:      6,
    cellRadius:       3,
    paddingH:         2,
    gameScoreGap:     4,
  },

  'Pitch Black': {
    // Pure black + periwinkle blue — stark monochrome with a single accent
    ...DEFAULT_THEME,
    bg:               '#000000',
    dividerColor:     'rgba(255,255,255,0.06)',
    nameText:         '#ffffff',
    setActiveBg:      '#000000',
    setActiveText:    '#ffffff',
    setWinText:       '#6196ff',
    gameScoreBg:      '#000000',
    gameScoreText:    '#ffffff',
    servingColor:     '#6196ff',
    fontFamily:       "'Inter', system-ui, sans-serif",
    nameFontWeight:   '700',
    cellPaddingV:     10,
    outerRadius:      0,
    cellRadius:       0,
  },

  // ── Artisan / editorial presets ──────────────────────────────

  'Linen': {
    // Warm cream + espresso — Flodesk editorial warmth (light bg)
    ...DEFAULT_THEME,
    bg:               '#f2ead8',
    dividerColor:     'rgba(44,31,20,0.1)',
    nameText:         '#2c1f14',
    nameFontWeight:   '600',
    setInactiveBg:    'transparent',
    setInactiveText:  'rgba(44,31,20,0.38)',
    setActiveBg:      '#3d2b1a',
    setActiveText:    '#f2ead8',
    setWinText:       '#3d2b1a',
    gameScoreBg:      '#3d2b1a',
    gameScoreText:    '#f2ead8',
    servingColor:     '#9c6e4a',
    fontFamily:       "'Playfair Display', Georgia, serif",
    cellPaddingV:     12,
    outerRadius:      0,
    cellRadius:       0,
    paddingH:         2,
  },

  'Blush': {
    // Deep dusty rose + soft blush — romantic and refined
    ...DEFAULT_THEME,
    bg:               '#3b1f2a',
    dividerColor:     'rgba(255,255,255,0.07)',
    nameText:         '#f7e8ec',
    nameFontWeight:   '600',
    setActiveBg:      '#e8b4c0',
    setActiveText:    '#3b1f2a',
    setWinText:       '#e8b4c0',
    gameScoreBg:      '#e8b4c0',
    gameScoreText:    '#3b1f2a',
    servingColor:     '#e8b4c0',
    fontFamily:       "'Cormorant Garamond', Georgia, serif",
    cellPaddingV:     12,
    outerRadius:      0,
    cellRadius:       0,
  },

};

export const FONT_OPTIONS = [
  // ── Editorial / Luxury ──────────────────────────────────────
  { label: 'DM Serif Display',     value: "'DM Serif Display', Georgia, serif" },
  { label: 'Playfair Display',     value: "'Playfair Display', Georgia, serif" },
  { label: 'Cormorant Garamond',   value: "'Cormorant Garamond', Georgia, serif" },
  { label: 'Georgia',              value: "Georgia, 'Times New Roman', serif" },

  // ── Modern Sans ─────────────────────────────────────────────
  { label: 'Space Grotesk',        value: "'Space Grotesk', system-ui, sans-serif" },
  { label: 'Inter',                value: "'Inter', system-ui, sans-serif" },
  { label: 'Syne',                 value: "'Syne', system-ui, sans-serif" },
  { label: 'System (default)',     value: "system-ui, -apple-system, 'Segoe UI', sans-serif" },

  // ── Condensed / Broadcast ───────────────────────────────────
  { label: 'Barlow Condensed',     value: "'Barlow Condensed', 'Arial Narrow', sans-serif" },
  { label: 'Oswald',               value: "'Oswald', 'Arial Narrow', sans-serif" },
  { label: 'Roboto Condensed',     value: "'Roboto Condensed', Arial, sans-serif" },
  { label: 'Rajdhani',             value: "'Rajdhani', 'Segoe UI', sans-serif" },

  // ── Display / Graphic ───────────────────────────────────────
  { label: 'Unbounded',            value: "'Unbounded', Impact, sans-serif" },
  { label: 'Anton',                value: "'Anton', Impact, sans-serif" },
  { label: 'Bebas Neue',           value: "'Bebas Neue', Impact, sans-serif" },
  { label: 'Impact',               value: "Impact, 'Arial Narrow', sans-serif" },

  // ── Monospace ───────────────────────────────────────────────
  { label: 'Monospace',            value: "'Courier New', Courier, monospace" },
];

// ── Design rules ────────────────────────────────────────────

// Hard clamping ranges for numeric layout values
export const LAYOUT_RULES = {
  cellPaddingV:         { min: 5, max: 18 }, // < 5px feels cramped; > 18px scoreboard too tall
  outerRadius:          { min: 0,  max: 12 }, // > 12px looks like a pill, not a scoreboard
  cellRadius:           { min: 0,  max: 8  }, // cells should never be rounder than the container
  paddingH:             { min: 0,  max: 20 }, // horizontal padding inside scoreboard background
  gameScoreGap:         { min: 0,  max: 16 }, // transparent gap between sets and game score
  footerGap:            { min: 0,  max: 24 }, // transparent gap between scoreboard and footer
  footerRadius:         { min: 0,  max: 99 }, // corner radius for footer label (99 = pill)
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
  const { cellPaddingV, outerRadius, cellRadius, paddingH, gameScoreGap, footerGap, footerRadius } = LAYOUT_RULES;

  t.cellPaddingV  = clamp(t.cellPaddingV  ?? 5, cellPaddingV.min,  cellPaddingV.max);
  t.outerRadius   = clamp(t.outerRadius   ?? 0,  outerRadius.min,   outerRadius.max);
  // Cell radius must not exceed the outer radius (looks broken otherwise)
  const maxCell   = Math.min(cellRadius.max, t.outerRadius + 2);
  t.cellRadius    = clamp(t.cellRadius    ?? 0,  cellRadius.min,    maxCell);
  t.paddingH      = clamp(t.paddingH      ?? 0,  paddingH.min,      paddingH.max);
  t.gameScoreGap  = clamp(t.gameScoreGap  ?? 0,  gameScoreGap.min,  gameScoreGap.max);
  t.footerGap     = clamp(t.footerGap     ?? 8,  footerGap.min,     footerGap.max);
  // Migrate old footerPill boolean → footerRadius
  if (t.footerRadius === undefined) {
    t.footerRadius = t.footerPill === false ? (t.outerRadius || 4) : 99;
  }
  t.footerRadius  = clamp(t.footerRadius,        footerRadius.min,  footerRadius.max);

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
