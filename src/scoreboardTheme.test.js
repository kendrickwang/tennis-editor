/**
 * scoreboardTheme.test.js
 *
 * Regression tests for sanitizeTheme and LAYOUT_RULES.
 * Key regressions covered:
 *   - footerPill (boolean) → footerRadius (numeric) migration
 *   - All numeric layout values clamped within LAYOUT_RULES
 *   - cellRadius never exceeds outerRadius + 2
 */

import {
  sanitizeTheme,
  LAYOUT_RULES,
  contrastRatio,
  contrastGrade,
  autoTextColor,
  DEFAULT_THEME,
} from './scoreboardTheme';

// ── LAYOUT_RULES shape ────────────────────────────────────────────────────────

describe('LAYOUT_RULES', () => {
  test('contains all expected layout keys', () => {
    const expectedKeys = [
      'cellPaddingV', 'outerRadius', 'cellRadius',
      'paddingH', 'gameScoreGap', 'footerGap', 'footerRadius',
    ];
    expectedKeys.forEach(k => expect(LAYOUT_RULES).toHaveProperty(k));
  });

  test('footerRadius rule has min=0 and max=99', () => {
    expect(LAYOUT_RULES.footerRadius).toEqual({ min: 0, max: 99 });
  });

  test('each rule has a min and max', () => {
    Object.entries(LAYOUT_RULES).forEach(([key, rule]) => {
      expect(rule).toHaveProperty('min');
      expect(rule).toHaveProperty('max');
      expect(rule.min).toBeLessThanOrEqual(rule.max);
    });
  });
});

// ── sanitizeTheme — clamping ──────────────────────────────────────────────────

describe('sanitizeTheme — LAYOUT_RULES clamping', () => {
  test('returns all required layout keys', () => {
    const t = sanitizeTheme({ ...DEFAULT_THEME });
    ['cellPaddingV', 'outerRadius', 'cellRadius', 'paddingH',
      'gameScoreGap', 'footerGap', 'footerRadius'].forEach(k => {
      expect(t).toHaveProperty(k);
      expect(typeof t[k]).toBe('number');
    });
  });

  test('clamps cellPaddingV to [5, 18]', () => {
    expect(sanitizeTheme({ cellPaddingV: 2 }).cellPaddingV).toBe(5);
    expect(sanitizeTheme({ cellPaddingV: 25 }).cellPaddingV).toBe(18);
    expect(sanitizeTheme({ cellPaddingV: 10 }).cellPaddingV).toBe(10);
  });

  test('clamps outerRadius to [0, 12]', () => {
    expect(sanitizeTheme({ outerRadius: -1 }).outerRadius).toBe(0);
    expect(sanitizeTheme({ outerRadius: 20 }).outerRadius).toBe(12);
    expect(sanitizeTheme({ outerRadius: 6 }).outerRadius).toBe(6);
  });

  test('clamps cellRadius to [0, 8]', () => {
    expect(sanitizeTheme({ cellRadius: -1, outerRadius: 8 }).cellRadius).toBe(0);
    expect(sanitizeTheme({ cellRadius: 15, outerRadius: 12 }).cellRadius).toBe(8);
  });

  test('enforces cellRadius ≤ outerRadius + 2', () => {
    // outerRadius=4, so max cellRadius should be min(8, 4+2)=6
    const t = sanitizeTheme({ outerRadius: 4, cellRadius: 10 });
    expect(t.cellRadius).toBeLessThanOrEqual(t.outerRadius + 2);
    expect(t.cellRadius).toBe(6);
  });

  test('cellRadius is not clamped below outerRadius+2 when within range', () => {
    const t = sanitizeTheme({ outerRadius: 6, cellRadius: 5 });
    expect(t.cellRadius).toBe(5);
  });

  test('clamps footerRadius to [0, 99]', () => {
    expect(sanitizeTheme({ footerRadius: -5 }).footerRadius).toBe(0);
    expect(sanitizeTheme({ footerRadius: 150 }).footerRadius).toBe(99);
    expect(sanitizeTheme({ footerRadius: 50 }).footerRadius).toBe(50);
  });

  test('clamps paddingH to [0, 20]', () => {
    expect(sanitizeTheme({ paddingH: -1 }).paddingH).toBe(0);
    expect(sanitizeTheme({ paddingH: 30 }).paddingH).toBe(20);
    expect(sanitizeTheme({ paddingH: 10 }).paddingH).toBe(10);
  });

  test('clamps gameScoreGap to [0, 16]', () => {
    expect(sanitizeTheme({ gameScoreGap: -1 }).gameScoreGap).toBe(0);
    expect(sanitizeTheme({ gameScoreGap: 20 }).gameScoreGap).toBe(16);
  });

  test('clamps footerGap to [0, 24]', () => {
    expect(sanitizeTheme({ footerGap: -1 }).footerGap).toBe(0);
    expect(sanitizeTheme({ footerGap: 30 }).footerGap).toBe(24);
  });

  test('empty / minimal input does not throw and returns valid defaults', () => {
    expect(() => sanitizeTheme({})).not.toThrow();
    const t = sanitizeTheme({});
    expect(t.cellPaddingV).toBeGreaterThanOrEqual(5);
    expect(t.cellPaddingV).toBeLessThanOrEqual(18);
  });

  test('preserves non-layout keys unchanged', () => {
    const t = sanitizeTheme({ bg: '#ff0000', nameText: '#ffffff' });
    expect(t.bg).toBe('#ff0000');
    expect(t.nameText).toBe('#ffffff');
  });
});

// ── sanitizeTheme — footerPill migration (regression) ─────────────────────────

describe('sanitizeTheme — footerPill → footerRadius migration (regression)', () => {
  test('footerPill=true with no footerRadius → footerRadius=99 (pill)', () => {
    const t = sanitizeTheme({ footerPill: true });
    expect(t.footerRadius).toBe(99);
  });

  test('footerPill=false with no footerRadius → footerRadius=outerRadius value', () => {
    const t = sanitizeTheme({ footerPill: false, outerRadius: 6 });
    // outerRadius will be sanitized to 6; fallback is t.outerRadius || 4
    expect(t.footerRadius).toBe(6);
  });

  test('footerPill=false with outerRadius=0 → footerRadius=4 (fallback default)', () => {
    const t = sanitizeTheme({ footerPill: false, outerRadius: 0 });
    // outerRadius=0, so `t.outerRadius || 4` = 4
    expect(t.footerRadius).toBe(4);
  });

  test('explicit footerRadius takes precedence over footerPill=true', () => {
    const t = sanitizeTheme({ footerPill: true, footerRadius: 20 });
    expect(t.footerRadius).toBe(20);
  });

  test('explicit footerRadius takes precedence over footerPill=false', () => {
    const t = sanitizeTheme({ footerPill: false, footerRadius: 8 });
    expect(t.footerRadius).toBe(8);
  });

  test('missing both footerPill and footerRadius → defaults to 99 (pill)', () => {
    const t = sanitizeTheme({});
    expect(t.footerRadius).toBe(99);
  });

  test('footerRadius=0 is preserved (square footer)', () => {
    const t = sanitizeTheme({ footerRadius: 0 });
    expect(t.footerRadius).toBe(0);
  });
});

// ── contrastRatio ─────────────────────────────────────────────────────────────

describe('contrastRatio', () => {
  test('black on white has ratio ~21', () => {
    const r = contrastRatio('#000000', '#ffffff');
    expect(r).toBeCloseTo(21, 0);
  });

  test('same color has ratio ~1', () => {
    const r = contrastRatio('#ffffff', '#ffffff');
    expect(r).toBeCloseTo(1, 0);
  });

  test('returns 1 for invalid hex inputs', () => {
    expect(contrastRatio('red', '#ffffff')).toBe(1);
    expect(contrastRatio(null, '#ffffff')).toBe(1);
    expect(contrastRatio('#ffffff', undefined)).toBe(1);
  });
});

// ── contrastGrade ─────────────────────────────────────────────────────────────

describe('contrastGrade', () => {
  test('≥4.5 is good', () => expect(contrastGrade(4.5)).toBe('good'));
  test('≥3.0 and <4.5 is ok', () => expect(contrastGrade(3.5)).toBe('ok'));
  test('<3.0 is poor', () => expect(contrastGrade(2.9)).toBe('poor'));
});

// ── autoTextColor ─────────────────────────────────────────────────────────────

describe('autoTextColor', () => {
  test('dark background → returns white', () => {
    expect(autoTextColor('#000000')).toBe('#ffffff');
    expect(autoTextColor('#0a1929')).toBe('#ffffff');
  });

  test('light background → returns black', () => {
    expect(autoTextColor('#ffffff')).toBe('#000000');
    expect(autoTextColor('#FFD700')).toBe('#000000');
  });

  test('invalid input → returns white (safe default)', () => {
    expect(autoTextColor(null)).toBe('#ffffff');
    expect(autoTextColor('not-a-color')).toBe('#ffffff');
  });
});
