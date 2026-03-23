/**
 * ScorePreview.test.js
 *
 * Regression tests for the ScorePreview clip wrapper dimensions.
 * Key regression covered:
 *   - Wrapper width was hardcoded as 156px (= ceil(340 * 0.46)).
 *     At scale=0.95 the scoreboard was visually cut off.
 *     Fix: compute dynamically as Math.ceil(totalW * scale).
 */

import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ScorePreview, PREVIEW_SCORE_S1, PREVIEW_SCORE_TB } from './ScoreboardCustomizer';
import { DEFAULT_THEME } from './scoreboardTheme';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTheme(overrides = {}) {
  return { ...DEFAULT_THEME, ...overrides };
}

function getWrapperStyle(container) {
  const wrap = container.querySelector('.sbc__score-preview-wrap');
  expect(wrap).not.toBeNull();
  return wrap.style;
}

// ── Clip wrapper dimensions ───────────────────────────────────────────────────

describe('ScorePreview — clip wrapper dimensions (regression)', () => {
  test('default scale=0.46, paddingH=0 → width=ceil(340*0.46)=157px', () => {
    const { container } = render(
      <ScorePreview score={PREVIEW_SCORE_S1} theme={makeTheme({ paddingH: 0 })} scale={0.46} />
    );
    const style = getWrapperStyle(container);
    expect(style.width).toBe(`${Math.ceil(340 * 0.46)}px`); // 157px
  });

  test('scale=0.95, paddingH=0 → width=ceil(340*0.95)=323px (was cut off at 156)', () => {
    // This is the critical regression: at scale=0.95 the scoreboard was truncated
    // because width was hardcoded as 156px. It must now be 323px.
    const { container } = render(
      <ScorePreview score={PREVIEW_SCORE_S1} theme={makeTheme({ paddingH: 0 })} scale={0.95} />
    );
    const style = getWrapperStyle(container);
    expect(style.width).toBe(`${Math.ceil(340 * 0.95)}px`); // 323px
    // Ensure the old hardcoded value is NOT used
    expect(style.width).not.toBe('156px');
    expect(style.width).not.toBe('157px');
  });

  test('scale=0.95, paddingH=10 → totalW=360, width=ceil(360*0.95)=342px', () => {
    const { container } = render(
      <ScorePreview score={PREVIEW_SCORE_S1} theme={makeTheme({ paddingH: 10 })} scale={0.95} />
    );
    const style = getWrapperStyle(container);
    // totalW = 340 + 10*2 = 360
    expect(style.width).toBe(`${Math.ceil(360 * 0.95)}px`); // 342px
  });

  test('scale=1, paddingH=0 → width=340px (unscaled)', () => {
    const { container } = render(
      <ScorePreview score={PREVIEW_SCORE_S1} theme={makeTheme({ paddingH: 0 })} scale={1} />
    );
    const style = getWrapperStyle(container);
    expect(style.width).toBe('340px');
  });

  test('height at scale=0.46, cellPaddingV=13, no footer → ceil(108*0.46)=50px', () => {
    // rowH = 13*2+28 = 54; mainH = 54*2 = 108; footerH = 0 → totalH = 108
    const { container } = render(
      <ScorePreview
        score={PREVIEW_SCORE_S1}
        theme={makeTheme({ cellPaddingV: 13, footerVisible: false })}
        scale={0.46}
      />
    );
    const style = getWrapperStyle(container);
    expect(style.height).toBe(`${Math.ceil(108 * 0.46)}px`); // 50px
  });

  test('height includes footer when footerVisible=true and footerText is set', () => {
    const scale = 0.46;
    const footerGap = 8;
    const cellPaddingV = 13;
    const rowH = cellPaddingV * 2 + 28; // 54
    const mainH = rowH * 2;             // 108
    const footerH = footerGap + 24;     // 32
    const totalH = mainH + footerH;     // 140

    const { container } = render(
      <ScorePreview
        score={PREVIEW_SCORE_S1}
        theme={makeTheme({
          cellPaddingV,
          footerVisible: true,
          footerText: 'MATCH',
          footerGap,
        })}
        scale={scale}
      />
    );
    const style = getWrapperStyle(container);
    expect(style.height).toBe(`${Math.ceil(totalH * scale)}px`); // 65px
  });

  test('height excludes footer height when footerVisible=false', () => {
    const scale = 0.46;
    const cellPaddingV = 13;
    const rowH = cellPaddingV * 2 + 28;
    const mainH = rowH * 2; // 108

    const { container } = render(
      <ScorePreview
        score={PREVIEW_SCORE_S1}
        theme={makeTheme({ cellPaddingV, footerVisible: false, footerText: 'MATCH' })}
        scale={scale}
      />
    );
    const style = getWrapperStyle(container);
    expect(style.height).toBe(`${Math.ceil(mainH * scale)}px`); // 50px — no footer added
  });

  test('PREVIEW_SCORE_TB renders without crashing at scale=0.95', () => {
    expect(() =>
      render(
        <ScorePreview score={PREVIEW_SCORE_TB} theme={makeTheme()} scale={0.95} />
      )
    ).not.toThrow();
  });
});
