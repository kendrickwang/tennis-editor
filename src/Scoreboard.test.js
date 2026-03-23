/**
 * Scoreboard.test.js
 *
 * Regression tests for the Scoreboard component's footerRadius rendering.
 * Key regression covered:
 *   - footerRadius inline style must be used when set (numeric value, 0–99)
 *   - Legacy footerPill (boolean) fallback must still work for old themes
 *     that haven't gone through sanitizeTheme yet
 */

import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import Scoreboard from './Scoreboard';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MINIMAL_SCORE = {
  sets: [],
  currentSet: [0, 0],
  currentGame: [0, 0],
  isTiebreak: false,
  matchTiebreakActive: false,
  matchWinner: null,
};

function makeTheme(overrides = {}) {
  return {
    bg:             '#0a1929',
    dividerColor:   'rgba(255,255,255,0.07)',
    nameText:       '#ffffff',
    nameFontWeight: '700',
    setInactiveBg:  'transparent',
    setInactiveText:'rgba(255,255,255,0.55)',
    setActiveBg:    '#FFD700',
    setActiveText:  '#000000',
    setWinText:     '#ffffff',
    gameScoreBg:    '#FFD700',
    gameScoreText:  '#000000',
    gameScoreAdvBg: '#FFD700',
    servingColor:   '#FFD700',
    fontFamily:     'system-ui',
    cellPaddingV:   13,
    outerRadius:    4,
    cellRadius:     0,
    paddingH:       0,
    gameScoreGap:   0,
    footerGap:      8,
    footerRadius:   99,
    footerVisible:  true,
    footerText:     'TEST MATCH',
    footerBg:       'rgba(0,0,0,0.75)',
    footerTextColor:'#ffffff',
    footerAlign:    'center',
    subtitleVisible:false,
    p1Subtitle:     '',
    p2Subtitle:     '',
    p1Badge:        null,
    p2Badge:        null,
    ...overrides,
  };
}

function getFooterStyle(container) {
  const footer = container.querySelector('.sb__footer');
  return footer ? footer.style : null;
}

// ── footerRadius rendering (regression) ───────────────────────────────────────

describe('Scoreboard — footerRadius inline style (regression)', () => {
  test('footerRadius=20 → footer borderRadius is "20px"', () => {
    const { container } = render(
      <Scoreboard score={MINIMAL_SCORE} theme={makeTheme({ footerRadius: 20 })} />
    );
    const style = getFooterStyle(container);
    expect(style).not.toBeNull();
    expect(style.borderRadius).toBe('20px');
  });

  test('footerRadius=0 → footer borderRadius is "0px" (square)', () => {
    const { container } = render(
      <Scoreboard score={MINIMAL_SCORE} theme={makeTheme({ footerRadius: 0 })} />
    );
    const style = getFooterStyle(container);
    expect(style.borderRadius).toBe('0px');
  });

  test('footerRadius=99 → footer borderRadius is "99px" (pill)', () => {
    const { container } = render(
      <Scoreboard score={MINIMAL_SCORE} theme={makeTheme({ footerRadius: 99 })} />
    );
    const style = getFooterStyle(container);
    expect(style.borderRadius).toBe('99px');
  });

  test('legacy footerPill=true and no footerRadius → falls back to "99px"', () => {
    const theme = makeTheme({ footerPill: true });
    delete theme.footerRadius; // simulate old theme without footerRadius
    const { container } = render(
      <Scoreboard score={MINIMAL_SCORE} theme={theme} />
    );
    const style = getFooterStyle(container);
    expect(style.borderRadius).toBe('99px');
  });

  test('legacy footerPill=false and no footerRadius → falls back to outerRadius', () => {
    const theme = makeTheme({ footerPill: false, outerRadius: 6 });
    delete theme.footerRadius;
    const { container } = render(
      <Scoreboard score={MINIMAL_SCORE} theme={theme} />
    );
    const style = getFooterStyle(container);
    // Fallback: theme.outerRadius || 4 = 6
    expect(style.borderRadius).toBe('6px');
  });

  test('legacy footerPill=false with outerRadius=0 → falls back to "4px"', () => {
    const theme = makeTheme({ footerPill: false, outerRadius: 0 });
    delete theme.footerRadius;
    const { container } = render(
      <Scoreboard score={MINIMAL_SCORE} theme={theme} />
    );
    const style = getFooterStyle(container);
    expect(style.borderRadius).toBe('4px');
  });
});

// ── footerVisible=false ───────────────────────────────────────────────────────

describe('Scoreboard — footer visibility', () => {
  test('footer is absent when footerVisible=false', () => {
    const { container } = render(
      <Scoreboard score={MINIMAL_SCORE} theme={makeTheme({ footerVisible: false })} />
    );
    expect(container.querySelector('.sb__footer')).toBeNull();
  });

  test('footer is absent when footerText is empty string', () => {
    const { container } = render(
      <Scoreboard score={MINIMAL_SCORE} theme={makeTheme({ footerVisible: true, footerText: '' })} />
    );
    expect(container.querySelector('.sb__footer')).toBeNull();
  });

  test('footer is present when footerVisible=true and footerText is non-empty', () => {
    const { container } = render(
      <Scoreboard score={MINIMAL_SCORE} theme={makeTheme({ footerVisible: true, footerText: 'FINAL' })} />
    );
    expect(container.querySelector('.sb__footer')).not.toBeNull();
  });
});

// ── Smoke tests ───────────────────────────────────────────────────────────────

describe('Scoreboard — smoke tests', () => {
  test('renders without crashing with minimal score', () => {
    expect(() =>
      render(<Scoreboard score={MINIMAL_SCORE} theme={makeTheme()} />)
    ).not.toThrow();
  });

  test('renders with a completed set in score', () => {
    const score = {
      ...MINIMAL_SCORE,
      sets: [{ p1: 6, p2: 4 }],
      currentSet: [2, 1],
    };
    expect(() =>
      render(<Scoreboard score={score} theme={makeTheme()} />)
    ).not.toThrow();
  });

  test('renders matchWinner banner when matchWinner is set', () => {
    const score = {
      ...MINIMAL_SCORE,
      sets: [{ p1: 6, p2: 0 }, { p1: 6, p2: 0 }],
      matchWinner: 1,
    };
    const { getByText } = render(
      <Scoreboard score={score} names={['Djokovic', 'Alcaraz']} theme={makeTheme()} />
    );
    expect(getByText('DJOKOVIC WINS')).toBeInTheDocument();
  });
});
