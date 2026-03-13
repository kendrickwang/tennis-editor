import { DEFAULT_THEME } from './scoreboardTheme';
import './Scoreboard.css';

function playerPtDisplay(p1, p2, isTb, idx) {
  const [mine, theirs] = idx === 0 ? [p1, p2] : [p2, p1];
  if (isTb) return String(mine);
  if (mine >= 3 && theirs >= 3) {
    if (mine === theirs) return '40'; // deuce — both show 40
    return mine > theirs ? 'Ad' : '40';
  }
  return ['0', '15', '30', '40'][mine] ?? '0';
}

const MAX_SETS = 3;

export default function Scoreboard({
  score,
  names = ['P1', 'P2'],
  serving = 0,
  onServingChange,
  theme = DEFAULT_THEME,
}) {
  // Build CSS variable map from theme
  const cssVars = {
    '--sb-bg':               theme.bg,
    '--sb-divider':          theme.dividerColor,
    '--sb-name-text':        theme.nameText,
    '--sb-name-weight':      theme.nameFontWeight,
    '--sb-set-inactive-bg':  theme.setInactiveBg,
    '--sb-set-inactive':     theme.setInactiveText,
    '--sb-set-active-bg':    theme.setActiveBg,
    '--sb-set-active-text':  theme.setActiveText,
    '--sb-set-win-text':     theme.setWinText,
    '--sb-game-bg':          theme.gameScoreBg,
    '--sb-game-text':        theme.gameScoreText,
    '--sb-serving':          theme.servingColor,
    '--sb-cell-pad-v':       `${theme.cellPaddingV}px`,
    '--sb-outer-radius':     `${theme.outerRadius}px`,
    '--sb-cell-radius':      `${theme.cellRadius}px`,
    '--sb-font':             theme.fontFamily,
    '--sb-padding-h':        `${theme.paddingH ?? 0}px`,
    '--sb-game-gap':         `${theme.gameScoreGap ?? 0}px`,
    '--sb-footer-gap':       `${theme.footerGap ?? 8}px`,
  };

  // Only show sets that have started (completed or currently active)
  const allSets = Array.from({ length: MAX_SETS }, (_, i) => {
    if (i < score.sets.length) {
      return { ...score.sets[i], status: 'completed' };
    }
    if (i === score.sets.length && !score.matchWinner) {
      return { p1: score.currentSet[0], p2: score.currentSet[1], status: 'current' };
    }
    return null;
  }).filter(s => s !== null);

  const subtitles = [theme.p1Subtitle, theme.p2Subtitle];
  const badges    = [theme.p1Badge,    theme.p2Badge];

  const showFooter = theme.footerVisible && theme.footerText;

  return (
    <div className="sb-wrap" style={cssVars}>
      {/* ── Main scoreboard box ────────────────────────────── */}
      <div className="sb__main">
        <table className="sb__table">
          <tbody>
            {[0, 1].map(pi => {
              const pt = playerPtDisplay(score.currentGame[0], score.currentGame[1], score.isTiebreak, pi);
              const isServing = serving === pi;
              const subtitle  = theme.subtitleVisible ? subtitles[pi] : null;
              const badge     = badges[pi];
              return (
                <tr key={pi} className="sb__row">
                  <td
                    className={`sb__td sb__td--dot ${isServing ? 'sb__td--serving' : ''}`}
                    onClick={() => onServingChange?.(pi)}
                    title="Click to set server"
                  >
                    ●
                  </td>
                  <td className={`sb__td sb__td--name ${score.matchWinner === pi + 1 ? 'sb__td--winner' : ''}`}>
                    <span className="sb__name-cell">
                      {badge && <img className="sb__badge" src={badge} alt="" />}
                      <span className="sb__name-text">{names[pi].toUpperCase()}</span>
                      {subtitle && <span className="sb__subtitle">{subtitle}</span>}
                    </span>
                  </td>
                  {allSets.map((s, si) => {
                    const isCurrent = s?.status === 'current';
                    const mine   = s !== null ? (pi === 0 ? s.p1 : s.p2) : null;
                    const theirs = s !== null ? (pi === 0 ? s.p2 : s.p1) : null;
                    const isSetWon = s?.status === 'completed' && mine > theirs;
                    return (
                      <td key={si} className={`sb__td sb__td--set ${isCurrent ? 'sb__td--current-set' : ''} ${s === null ? 'sb__td--empty-set' : ''} ${isSetWon ? 'sb__td--set-win' : ''}`}>
                        {s !== null ? mine : ''}
                        {s?.tiebreak !== undefined && mine < theirs && (
                          <sup className="sb__tb-score">{s.tiebreak}</sup>
                        )}
                      </td>
                    );
                  })}
                  {(theme.gameScoreGap ?? 0) > 0 && (
                    <td className="sb__td sb__td--gap" aria-hidden="true" />
                  )}
                  <td className={`sb__td sb__td--pt ${pt === 'Ad' ? 'sb__td--adv' : ''}`}>
                    {pt}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {score.matchWinner && (
          <div className="sb__winner">{names[score.matchWinner - 1].toUpperCase()} WINS</div>
        )}
      </div>

      {/* ── Footer — outside main box, transparent gap above ── */}
      {showFooter && (
        <div
          className="sb__footer-outer"
          style={{ justifyContent: theme.footerAlign || 'center' }}
        >
          <div
            className="sb__footer"
            style={{
              background:   theme.footerBg,
              color:        theme.footerTextColor,
              borderRadius: `${theme.footerRadius ?? (theme.footerPill ? 99 : (theme.outerRadius || 4))}px`,
            }}
          >
            {theme.footerText}
          </div>
        </div>
      )}
    </div>
  );
}
