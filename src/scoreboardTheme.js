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
  cellPaddingV:        11,    // px
  outerRadius:         0,     // px
  cellRadius:          0,     // px

  // ── Footer label ───────────────────────────────────────────
  footerVisible:       false,
  footerText:          '',
  footerBg:            'rgba(0,0,0,0.75)',
  footerTextColor:     '#ffffff',
  footerPill:          true,

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
