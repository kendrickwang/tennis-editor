import { useState, useRef, useEffect } from 'react';
import {
  PRESETS, FONT_OPTIONS, LAYOUT_RULES,
  contrastRatio, contrastGrade, autoTextColor, sanitizeTheme, getContrastViolations,
} from './scoreboardTheme';
import Scoreboard from './Scoreboard';
import './ScoreboardCustomizer.css';

// ── Preview score states ──────────────────────────────────

const PREVIEW_NAMES = ['DJOKOVIC', 'ALCARAZ'];

const PREVIEW_SCORE_S1 = {
  sets: [],
  currentSet: [3, 2],
  currentGame: [2, 1], // 30–15
  isTiebreak: false,
  matchWinner: null,
};

const PREVIEW_SCORE_TB = {
  sets: [
    { p1: 6, p2: 4 },
    { p1: 3, p2: 6 },
  ],
  currentSet: [5, 5],
  currentGame: [7, 5], // 3rd-set tiebreak
  isTiebreak: true,
  matchWinner: null,
};

// ── Shared sub-components ────────────────────────────────────

function Section({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sbc__section">
      <button className="sbc__section-toggle" onClick={() => setOpen(o => !o)}>
        <span>{title}</span>
        <span className={`sbc__chevron ${open ? 'sbc__chevron--open' : ''}`}>›</span>
      </button>
      {open && <div className="sbc__section-body">{children}</div>}
    </div>
  );
}

// ── Hex-only color input ──────────────────────────────────────
// Shows a color swatch (opens native picker) + a hex text field.
// The native picker is still available for convenience, but the primary
// interface is the hex field — no RGB/HSL columns in view.

function HexColorInput({ value, onChange }) {
  const hex = toHex(value);
  const [draft, setDraft] = useState(hex);
  const textRef = useRef(null);

  // Sync when external value changes and the text field isn't focused
  useEffect(() => {
    if (document.activeElement !== textRef.current) {
      setDraft(toHex(value));
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSwatch(e) {
    const v = e.target.value;
    setDraft(v);
    onChange(v);
  }

  function handleText(e) {
    const v = e.target.value;
    setDraft(v);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
  }

  function handleBlur(e) {
    // If left with an incomplete hex, revert to current valid value
    if (!/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
      setDraft(toHex(value));
    }
  }

  return (
    <div className="sbc__hex-wrap">
      <input
        type="color"
        className="sbc__color-swatch"
        value={hex}
        onChange={handleSwatch}
        title="Click to open color picker"
      />
      <input
        ref={textRef}
        type="text"
        className="sbc__hex-text"
        value={draft}
        maxLength={7}
        spellCheck={false}
        placeholder="#000000"
        onChange={handleText}
        onBlur={handleBlur}
      />
    </div>
  );
}

function ColorPair({ bgLabel, textLabel, bgValue, textValue, onBgChange, onTextChange }) {
  const ratio = contrastRatio(bgValue, textValue);
  const grade = contrastGrade(ratio);
  const needsFix = grade !== 'good';

  // NOTE: Do NOT wrap onBgChange — each parent callback already handles text-color
  // sync atomically inside a single setMany() call. Calling onTextChange separately
  // after onBgChange causes a stale-closure race: both calls spread the same old
  // theme, and the second call wins, reverting the bg change entirely.

  return (
    <div className="sbc__color-pair">
      <div className="sbc__color-pair-row">
        <div className="sbc__color-pair-cell">
          <span className="sbc__pair-label">{bgLabel}</span>
          <HexColorInput value={bgValue} onChange={onBgChange} />
        </div>
        <div className="sbc__color-pair-cell">
          <span className="sbc__pair-label">{textLabel}</span>
          <HexColorInput value={textValue} onChange={onTextChange} />
        </div>
        <div className={`sbc__contrast sbc__contrast--${grade}`} title={`${ratio.toFixed(1)}:1 contrast`}>
          {ratio.toFixed(1)}
        </div>
        {needsFix && (
          <button
            className="sbc__autofix-btn"
            title="Auto-fix text color for readability"
            onClick={() => onTextChange(autoTextColor(bgValue))}
          >
            Fix ↺
          </button>
        )}
      </div>
      <div className="sbc__pair-preview" style={{ background: bgValue, color: textValue }}>
        Aa 15 30 40
      </div>
    </div>
  );
}

function ColorRow({ label, value, onChange, contrastAgainst }) {
  const ratio = contrastAgainst ? contrastRatio(value, contrastAgainst) : null;
  const grade = ratio ? contrastGrade(ratio) : null;
  return (
    <div className="sbc__row">
      <label className="sbc__label">{label}</label>
      <div className="sbc__color-wrap">
        <HexColorInput value={value} onChange={onChange} />
        {grade && (
          <span className={`sbc__contrast sbc__contrast--${grade}`} title={`${ratio.toFixed(1)}:1 contrast`}>
            {ratio.toFixed(1)}
          </span>
        )}
      </div>
    </div>
  );
}

function SliderRow({ label, value, min, max, unit = '', onChange }) {
  return (
    <div className="sbc__row">
      <label className="sbc__label">{label}</label>
      <div className="sbc__slider-wrap">
        <input type="range" min={min} max={max} value={value}
          className="sbc__slider"
          onChange={e => onChange(Number(e.target.value))} />
        <span className="sbc__slider-val">{value}{unit}</span>
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="sbc__row">
      <label className="sbc__label">{label}</label>
      <label className="sbc__toggle">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className="sbc__toggle-track" />
      </label>
    </div>
  );
}

function AlignRow({ label, value, onChange }) {
  const options = [
    { val: 'flex-start', icon: '⬤ ·  ·', title: 'Left' },
    { val: 'center',     icon: '·  ⬤ · ', title: 'Center' },
    { val: 'flex-end',   icon: '·  · ⬤', title: 'Right'  },
  ];
  return (
    <div className="sbc__row">
      <label className="sbc__label">{label}</label>
      <div className="sbc__align-btns">
        {options.map(o => (
          <button
            key={o.val}
            className={`sbc__align-btn${value === o.val ? ' sbc__align-btn--active' : ''}`}
            title={o.title}
            onClick={() => onChange(o.val)}
          >
            {o.title}
          </button>
        ))}
      </div>
    </div>
  );
}

function TextRow({ label, value, placeholder, onChange, maxLength }) {
  return (
    <div className="sbc__row">
      <label className="sbc__label">{label}</label>
      <input className="sbc__text" type="text" value={value} placeholder={placeholder}
        maxLength={maxLength} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

// ── Utilities ────────────────────────────────────────────────

function toHex(color) {
  if (!color) return '#000000';
  if (color.startsWith('#') && color.length === 7) return color;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  } catch { return '#000000'; }
}

// ── Scaled scoreboard preview ─────────────────────────────────

function ScorePreview({ score, theme, label }) {
  // Estimate scoreboard height to size the wrapper correctly
  const rowH    = (theme.cellPaddingV ?? 13) * 2 + 28;
  const mainH   = rowH * 2;
  // Footer adds gap + ~24px pill height when visible
  const footerH = (theme.footerVisible && theme.footerText)
    ? (theme.footerGap ?? 8) + 24 : 0;
  const totalH  = mainH + footerH;

  const SCALE = 0.46;

  return (
    <div className="sbc__score-preview-col">
      <span className="sbc__score-preview-label">{label}</span>
      <div
        className="sbc__score-preview-wrap"
        style={{ height: Math.ceil(totalH * SCALE) }}
      >
        <div style={{ transform: `scale(${SCALE})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
          <Scoreboard theme={theme} score={score} names={PREVIEW_NAMES} serving={0} />
        </div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────

/**
 * embedded=false (default): collapsible toggle + panel.
 * embedded=true: just the panel content, for use inside the customizer modal.
 */
export default function ScoreboardCustomizer({ theme, onChange, embedded = false }) {
  const [open, setOpen] = useState(false);
  const p1BadgeRef = useRef(null);
  const p2BadgeRef = useRef(null);

  function set(key, value) {
    onChange(sanitizeTheme({ ...theme, [key]: value }));
  }

  function setMany(updates) {
    onChange(sanitizeTheme({ ...theme, ...updates }));
  }

  function applyPreset(name) {
    onChange(sanitizeTheme({ ...PRESETS[name] }));
  }

  function handleBadge(player, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => set(player === 1 ? 'p1Badge' : 'p2Badge', e.target.result);
    reader.readAsDataURL(file);
  }

  const showPanel = open || embedded;
  const violations = showPanel ? getContrastViolations(theme) : [];

  const panelContent = showPanel ? (
    <div className={`sbc__panel${embedded ? ' sbc__panel--embedded' : ''}`}>

      {/* ── Violations summary ───────────────────── */}
      {violations.length > 0 && (
        <div className="sbc__violations">
          <div className="sbc__violations-title">⚠ Contrast issues</div>
          {violations.map(v => (
            <div key={v.fgKey} className="sbc__violation-row">
              <span className="sbc__violation-label">{v.label}</span>
              <span className={`sbc__contrast sbc__contrast--${v.grade}`}>{v.ratio}:1</span>
              <button
                className="sbc__autofix-btn"
                onClick={() => set(v.fgKey, autoTextColor(theme[v.bgKey]))}
              >
                Fix ↺
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Presets ─────────────────────────────── */}
      <div className="sbc__presets">
        {Object.keys(PRESETS).map(name => (
          <button key={name} className="sbc__preset-btn" onClick={() => applyPreset(name)}>
            {name}
          </button>
        ))}
        <button className="sbc__preset-btn sbc__preset-btn--reset" onClick={() => applyPreset('US Open')}>
          Reset
        </button>
      </div>

      {/* ── Live Preview ─────────────────────────── */}
      <Section title="Live Preview" defaultOpen>
        <div className="sbc__preview-row">
          <ScorePreview
            label="1st set"
            score={PREVIEW_SCORE_S1}
            theme={theme}
          />
          <ScorePreview
            label="3rd set tiebreak"
            score={PREVIEW_SCORE_TB}
            theme={theme}
          />
        </div>
      </Section>

      {/* ── Colors ──────────────────────────────── */}
      <Section title="Colors" defaultOpen>
        <ColorRow label="Background" value={theme.bg} onChange={v => set('bg', v)} />
        <div className="sbc__pair-label-row">Accent color (active set &amp; game score)</div>
        <ColorPair
          bgLabel="Cell"    bgValue={theme.setActiveBg}
          textLabel="Text"  textValue={theme.setActiveText}
          onBgChange={v => setMany({
            setActiveBg: v, setActiveText: autoTextColor(v),
            gameScoreBg: v, gameScoreText: autoTextColor(v),
          })}
          onTextChange={v => setMany({ setActiveText: v, gameScoreText: v })}
        />
        <ColorRow label="Player names"  value={theme.nameText}     onChange={v => set('nameText', v)}     contrastAgainst={theme.bg} />
        <ColorRow label="Serving dot"   value={theme.servingColor} onChange={v => set('servingColor', v)} contrastAgainst={theme.bg} />
        <ColorRow label="Set won text"  value={theme.setWinText}   onChange={v => set('setWinText', v)}   contrastAgainst={theme.bg} />
      </Section>

      {/* ── Typography ──────────────────────────── */}
      <Section title="Typography">
        <div className="sbc__row">
          <label className="sbc__label">Font</label>
          <select className="sbc__select" value={theme.fontFamily}
            onChange={e => set('fontFamily', e.target.value)}>
            {FONT_OPTIONS.map(f => (
              <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </Section>

      {/* ── Layout ──────────────────────────────── */}
      <Section title="Layout">
        <div className="sbc__rule-note">
          Ranges are capped to keep proportions broadcast-quality.
        </div>
        <SliderRow label="Cell padding"
          value={theme.cellPaddingV}
          min={LAYOUT_RULES.cellPaddingV.min} max={LAYOUT_RULES.cellPaddingV.max}
          unit="px"
          onChange={v => set('cellPaddingV', v)} />
        <SliderRow label="Outer radius"
          value={theme.outerRadius}
          min={LAYOUT_RULES.outerRadius.min} max={LAYOUT_RULES.outerRadius.max}
          unit="px"
          onChange={v => set('outerRadius', v)} />
        <SliderRow label="Cell radius"
          value={theme.cellRadius}
          min={LAYOUT_RULES.cellRadius.min}
          max={Math.min(LAYOUT_RULES.cellRadius.max, theme.outerRadius + 2)}
          unit="px"
          onChange={v => set('cellRadius', v)} />
        {theme.cellRadius > theme.outerRadius + 2 && (
          <div className="sbc__rule-warn">Cell radius capped to outer radius + 2</div>
        )}
        <SliderRow label="H. padding"
          value={theme.paddingH ?? 0}
          min={LAYOUT_RULES.paddingH.min} max={LAYOUT_RULES.paddingH.max}
          unit="px"
          onChange={v => set('paddingH', v)} />
      </Section>

      {/* ── Game score gap ───────────────────────── */}
      <Section title="Game score gap">
        <div className="sbc__rule-note">
          Adds a transparent gap between the set scores and game score column.
        </div>
        <SliderRow label="Gap width"
          value={theme.gameScoreGap ?? 0}
          min={LAYOUT_RULES.gameScoreGap.min}
          max={LAYOUT_RULES.gameScoreGap.max}
          unit="px"
          onChange={v => set('gameScoreGap', v)} />
      </Section>

      {/* ── Footer label ────────────────────────── */}
      <Section title="Footer label">
        <ToggleRow label="Show footer" checked={theme.footerVisible} onChange={v => set('footerVisible', v)} />
        {theme.footerVisible && <>
          <TextRow label="Label text" value={theme.footerText}
            placeholder="e.g. FLEX LEAGUE MATCH" onChange={v => set('footerText', v)} maxLength={40} />
          <ColorPair
            bgLabel="Background"  bgValue={theme.footerBg}
            textLabel="Text"      textValue={theme.footerTextColor}
            onBgChange={v => setMany({ footerBg: v, footerTextColor: autoTextColor(v) })}
            onTextChange={v => set('footerTextColor', v)}
          />
          <SliderRow label="Corner radius"
            value={theme.footerRadius ?? 99}
            min={0} max={99} unit="px"
            onChange={v => set('footerRadius', v)} />
          <AlignRow label="Alignment"
            value={theme.footerAlign || 'center'}
            onChange={v => set('footerAlign', v)} />
          <SliderRow label="Gap above"
            value={theme.footerGap ?? 8}
            min={LAYOUT_RULES.footerGap.min} max={LAYOUT_RULES.footerGap.max}
            unit="px"
            onChange={v => set('footerGap', v)} />
        </>}
      </Section>

      {/* ── Player info ─────────────────────────── */}
      <Section title="Player info">
        <ToggleRow label="Show subtitle" checked={theme.subtitleVisible} onChange={v => set('subtitleVisible', v)} />
        {theme.subtitleVisible && <>
          <TextRow label="P1 subtitle" value={theme.p1Subtitle} placeholder="e.g. UTR 9.5" onChange={v => set('p1Subtitle', v)} maxLength={12} />
          <TextRow label="P2 subtitle" value={theme.p2Subtitle} placeholder="e.g. UTR 13"  onChange={v => set('p2Subtitle', v)} maxLength={12} />
        </>}

        {[1, 2].map(p => {
          const badgeRef = p === 1 ? p1BadgeRef : p2BadgeRef;
          const badgeKey = p === 1 ? 'p1Badge' : 'p2Badge';
          const badge    = theme[badgeKey];
          return (
            <div key={p} className="sbc__row">
              <label className="sbc__label">P{p} logo</label>
              <div className="sbc__badge-wrap">
                {badge
                  ? <img className="sbc__badge-preview" src={badge} alt={`P${p} logo`} />
                  : <span className="sbc__badge-empty">None</span>}
                <button className="sbc__badge-btn" onClick={() => badgeRef.current.click()}>Upload</button>
                {badge && <button className="sbc__badge-clear" onClick={() => set(badgeKey, null)}>✕</button>}
                <input ref={badgeRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => handleBadge(p, e.target.files[0])} />
              </div>
            </div>
          );
        })}
      </Section>

    </div>
  ) : null;

  // ── Embedded: just the panel, no toggle ──────────────────
  if (embedded) {
    return panelContent;
  }

  // ── Toggle mode: collapsible ─────────────────────────────
  const chipCount = getContrastViolations(theme).length;
  return (
    <div className="sbc">
      <button
        className={`sbc__toggle-btn ${open ? 'sbc__toggle-btn--open' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <span>✦ Customize scoreboard</span>
        <div className="sbc__toggle-right">
          {chipCount > 0 && (
            <span className="sbc__violation-chip">
              ⚠ {chipCount} contrast {chipCount === 1 ? 'issue' : 'issues'}
            </span>
          )}
          <span className={`sbc__chevron ${open ? 'sbc__chevron--open' : ''}`}>›</span>
        </div>
      </button>

      {panelContent}
    </div>
  );
}
