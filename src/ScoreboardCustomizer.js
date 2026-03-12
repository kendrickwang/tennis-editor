import { useState, useRef } from 'react';
import { PRESETS, FONT_OPTIONS, DEFAULT_THEME } from './scoreboardTheme';
import './ScoreboardCustomizer.css';

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

function ColorRow({ label, value, onChange }) {
  return (
    <div className="sbc__row">
      <label className="sbc__label">{label}</label>
      <div className="sbc__color-wrap">
        <input type="color" className="sbc__color" value={toHex(value)} onChange={e => onChange(e.target.value)} />
        <span className="sbc__color-val">{toHex(value)}</span>
      </div>
    </div>
  );
}

function SliderRow({ label, value, min, max, unit = '', onChange }) {
  return (
    <div className="sbc__row">
      <label className="sbc__label">{label}</label>
      <div className="sbc__slider-wrap">
        <input
          type="range" min={min} max={max} value={value}
          className="sbc__slider"
          onChange={e => onChange(Number(e.target.value))}
        />
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
      <input
        className="sbc__text"
        type="text"
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

// Convert any CSS color to hex (best-effort for color inputs)
function toHex(color) {
  if (!color) return '#000000';
  if (color.startsWith('#') && color.length === 7) return color;
  // For rgba/rgb, render to canvas to extract hex
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  } catch {
    return '#000000';
  }
}

export default function ScoreboardCustomizer({ theme, onChange }) {
  const [open, setOpen] = useState(false);
  const p1BadgeRef = useRef(null);
  const p2BadgeRef = useRef(null);

  function set(key, value) {
    onChange({ ...theme, [key]: value });
  }

  function applyPreset(name) {
    onChange({ ...PRESETS[name] });
  }

  function handleBadge(player, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => set(player === 1 ? 'p1Badge' : 'p2Badge', e.target.result);
    reader.readAsDataURL(file);
  }

  function resetTheme() {
    onChange({ ...DEFAULT_THEME });
  }

  return (
    <div className="sbc">
      <button className={`sbc__toggle-btn ${open ? 'sbc__toggle-btn--open' : ''}`} onClick={() => setOpen(o => !o)}>
        <span>✦ Customize scoreboard</span>
        <span className={`sbc__chevron ${open ? 'sbc__chevron--open' : ''}`}>›</span>
      </button>

      {open && (
        <div className="sbc__panel">

          {/* ── Presets ─────────────────────────────────── */}
          <div className="sbc__presets">
            {Object.keys(PRESETS).map(name => (
              <button
                key={name}
                className="sbc__preset-btn"
                onClick={() => applyPreset(name)}
              >
                {name}
              </button>
            ))}
            <button className="sbc__preset-btn sbc__preset-btn--reset" onClick={resetTheme}>
              Reset
            </button>
          </div>

          {/* ── Colors ──────────────────────────────────── */}
          <Section title="Colors" defaultOpen={true}>
            <ColorRow label="Background"      value={theme.bg}             onChange={v => set('bg', v)} />
            <ColorRow label="Active set cell" value={theme.setActiveBg}    onChange={v => set('setActiveBg', v)} />
            <ColorRow label="Active set text" value={theme.setActiveText}  onChange={v => set('setActiveText', v)} />
            <ColorRow label="Game score cell" value={theme.gameScoreBg}    onChange={v => set('gameScoreBg', v)} />
            <ColorRow label="Game score text" value={theme.gameScoreText}  onChange={v => set('gameScoreText', v)} />
            <ColorRow label="Player name"     value={theme.nameText}       onChange={v => set('nameText', v)} />
            <ColorRow label="Serving dot"     value={theme.servingColor}   onChange={v => set('servingColor', v)} />
            <ColorRow label="Set won text"    value={theme.setWinText}     onChange={v => set('setWinText', v)} />
          </Section>

          {/* ── Typography ──────────────────────────────── */}
          <Section title="Typography">
            <div className="sbc__row">
              <label className="sbc__label">Font</label>
              <select
                className="sbc__select"
                value={theme.fontFamily}
                onChange={e => set('fontFamily', e.target.value)}
              >
                {FONT_OPTIONS.map(f => (
                  <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </Section>

          {/* ── Layout ──────────────────────────────────── */}
          <Section title="Layout">
            <SliderRow label="Cell padding"    value={theme.cellPaddingV} min={4}  max={20} unit="px" onChange={v => set('cellPaddingV', v)} />
            <SliderRow label="Outer radius"    value={theme.outerRadius}  min={0}  max={16} unit="px" onChange={v => set('outerRadius', v)} />
            <SliderRow label="Cell radius"     value={theme.cellRadius}   min={0}  max={10} unit="px" onChange={v => set('cellRadius', v)} />
          </Section>

          {/* ── Footer label ────────────────────────────── */}
          <Section title="Footer label">
            <ToggleRow label="Show footer"  checked={theme.footerVisible}  onChange={v => set('footerVisible', v)} />
            {theme.footerVisible && <>
              <TextRow   label="Label text"   value={theme.footerText}        placeholder="e.g. FLEX LEAGUE MATCH" onChange={v => set('footerText', v)} maxLength={40} />
              <ColorRow  label="Background"   value={theme.footerBg}          onChange={v => set('footerBg', v)} />
              <ColorRow  label="Text color"   value={theme.footerTextColor}   onChange={v => set('footerTextColor', v)} />
              <ToggleRow label="Pill shape"   checked={theme.footerPill}      onChange={v => set('footerPill', v)} />
            </>}
          </Section>

          {/* ── Player info ─────────────────────────────── */}
          <Section title="Player info">
            <ToggleRow label="Show subtitle" checked={theme.subtitleVisible} onChange={v => set('subtitleVisible', v)} />
            {theme.subtitleVisible && <>
              <TextRow label="P1 subtitle" value={theme.p1Subtitle} placeholder="e.g. UTR 9.5" onChange={v => set('p1Subtitle', v)} maxLength={12} />
              <TextRow label="P2 subtitle" value={theme.p2Subtitle} placeholder="e.g. UTR 13"  onChange={v => set('p2Subtitle', v)} maxLength={12} />
            </>}

            <div className="sbc__row">
              <label className="sbc__label">P1 badge</label>
              <div className="sbc__badge-wrap">
                {theme.p1Badge
                  ? <img className="sbc__badge-preview" src={theme.p1Badge} alt="P1 badge" />
                  : <span className="sbc__badge-empty">None</span>
                }
                <button className="sbc__badge-btn" onClick={() => p1BadgeRef.current.click()}>Upload</button>
                {theme.p1Badge && <button className="sbc__badge-clear" onClick={() => set('p1Badge', null)}>✕</button>}
                <input ref={p1BadgeRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => handleBadge(1, e.target.files[0])} />
              </div>
            </div>

            <div className="sbc__row">
              <label className="sbc__label">P2 badge</label>
              <div className="sbc__badge-wrap">
                {theme.p2Badge
                  ? <img className="sbc__badge-preview" src={theme.p2Badge} alt="P2 badge" />
                  : <span className="sbc__badge-empty">None</span>
                }
                <button className="sbc__badge-btn" onClick={() => p2BadgeRef.current.click()}>Upload</button>
                {theme.p2Badge && <button className="sbc__badge-clear" onClick={() => set('p2Badge', null)}>✕</button>}
                <input ref={p2BadgeRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => handleBadge(2, e.target.files[0])} />
              </div>
            </div>
          </Section>

        </div>
      )}
    </div>
  );
}
