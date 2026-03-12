import { useState, useRef } from 'react';
import {
  PRESETS, FONT_OPTIONS, LAYOUT_RULES,
  contrastRatio, contrastGrade, autoTextColor, sanitizeTheme, getContrastViolations,
} from './scoreboardTheme';
import './ScoreboardCustomizer.css';

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

function ColorPair({ bgLabel, textLabel, bgValue, textValue, onBgChange, onTextChange }) {
  const ratio = contrastRatio(bgValue, textValue);
  const grade = contrastGrade(ratio);
  const needsFix = grade !== 'good';

  function handleBgChange(hex) {
    onBgChange(hex);
    onTextChange(autoTextColor(hex));
  }

  return (
    <div className="sbc__color-pair">
      <div className="sbc__color-pair-row">
        <div className="sbc__color-pair-cell">
          <span className="sbc__pair-label">{bgLabel}</span>
          <input type="color" className="sbc__color" value={toHex(bgValue)}
            onChange={e => handleBgChange(e.target.value)} />
        </div>
        <div className="sbc__color-pair-cell">
          <span className="sbc__pair-label">{textLabel}</span>
          <input type="color" className="sbc__color" value={toHex(textValue)}
            onChange={e => onTextChange(e.target.value)} />
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
        <input type="color" className="sbc__color" value={toHex(value)}
          onChange={e => onChange(e.target.value)} />
        <span className="sbc__color-val">{toHex(value)}</span>
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
        <ColorRow label="Player name"   value={theme.nameText}     onChange={v => set('nameText', v)}     contrastAgainst={theme.bg} />
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
          <ToggleRow label="Pill shape" checked={theme.footerPill} onChange={v => set('footerPill', v)} />
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
              <label className="sbc__label">P{p} badge</label>
              <div className="sbc__badge-wrap">
                {badge
                  ? <img className="sbc__badge-preview" src={badge} alt={`P${p} badge`} />
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
