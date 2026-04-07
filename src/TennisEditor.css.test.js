/**
 * TennisEditor.css.test.js
 *
 * Regression guard for glow animation colors.
 * jsdom cannot resolve external CSS files, so we parse the source directly.
 *
 * Key regression covered:
 *   - Purple glow (rgba 99,102,241) must NOT regress back to red or any
 *     other color. A squash-merge null-diff previously caused this to revert.
 */

const fs   = require('fs');
const path = require('path');

const css = fs.readFileSync(path.resolve(__dirname, 'TennisEditor.css'), 'utf8');

describe('TennisEditor.css — glow color regression guards', () => {
  test('glow-pulse-info keyframe uses purple rgba(99,102,241) — not red', () => {
    // Find the keyframe block and verify it contains the purple values
    const match = css.match(/@keyframes glow-pulse-info[\s\S]*?}/);
    expect(match).not.toBeNull();
    expect(match[0]).toMatch(/99,\s*102,\s*241/);
  });

  test('te__video-wrap--glow-info class uses purple rgba(99,102,241)', () => {
    const idx = css.indexOf('te__video-wrap--glow-info');
    expect(idx).toBeGreaterThanOrEqual(0);
    // Look at the 400 chars following the class name for the rgba value
    const snippet = css.slice(idx, idx + 400);
    expect(snippet).toMatch(/99,\s*102,\s*241/);
  });

  test('success glow uses green rgba(16,185,129)', () => {
    expect(css).toMatch(/16,\s*185,\s*129/);
  });

  test('warn glow uses orange rgba(249,115,22)', () => {
    expect(css).toMatch(/249,\s*115,\s*22/);
  });
});
