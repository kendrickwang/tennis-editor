import React, { useState } from 'react';
import NewsletterForm from './NewsletterForm';
import './FeedbackModal.css';

// ── Replace this before going live ────────────────────────────
const FORMSPREE_URL = 'https://formspree.io/f/meevlgon';
// ──────────────────────────────────────────────────────────────

const FEATURE_OPTIONS = [
  { id: 'mobile',     label: 'Mobile app' },
  { id: 'auto',       label: 'Automatic point detection' },
  { id: 'stats',      label: 'Match statistics & analytics' },
  { id: 'cloud',      label: 'Cloud storage & sync' },
  { id: 'profiles',   label: 'Player profiles' },
  { id: 'slowmo',     label: 'Slow motion / speed controls' },
  { id: 'trimming',   label: 'Manual clip trimming' },
  { id: 'sharing',    label: 'Easy sharing to social media' },
];

export default function FeedbackModal({ onClose }) {
  const [rating, setRating]               = useState(0);
  const [hovered, setHovered]             = useState(0);
  const [liked, setLiked]                 = useState('');
  const [improve, setImprove]             = useState('');
  const [features, setFeatures]           = useState([]);
  const [otherChecked, setOtherChecked]   = useState(false);
  const [otherFeature, setOtherFeature]   = useState('');
  const [phase, setPhase]                 = useState('idle'); // idle | submitting | success | error

  function toggleFeature(id) {
    setFeatures(f => f.includes(id) ? f.filter(x => x !== id) : [...f, id]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (rating === 0) return;
    setPhase('submitting');
    const allFeatures = [
      ...features,
      ...(otherChecked && otherFeature.trim() ? [`Other: ${otherFeature.trim()}`] : []),
    ];
    try {
      const res = await fetch(FORMSPREE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          rating,
          liked,
          improve,
          features: allFeatures.join(', ') || 'None selected',
        }),
      });
      if (res.ok) {
        setPhase('success');
      } else {
        setPhase('error');
      }
    } catch {
      setPhase('error');
    }
  }

  return (
    <div className="fb__backdrop" onClick={onClose}>
      <div className="fb__modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">

        <button className="fb__close" onClick={onClose} aria-label="Close">✕</button>

        {phase === 'success' ? (
          <div className="fb__success">
            <div className="fb__success-icon">🎾</div>
            <h2>Thanks for the feedback!</h2>
            <p>It really helps shape where Court Clipper goes next.</p>
            <p className="fb__success-sub">Want to hear about new features as they ship?</p>
            <NewsletterForm />
            <button className="fb__done-btn" onClick={onClose}>Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="fb__header">
              <h2 className="fb__title">How's Court Clipper working for you?</h2>
              <p className="fb__sub">Takes 2 minutes — helps a lot.</p>
            </div>

            {/* Star rating */}
            <div className="fb__section">
              <label className="fb__label">Overall rating</label>
              <div className="fb__stars">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    className={`fb__star${(hovered || rating) >= n ? ' fb__star--on' : ''}`}
                    onMouseEnter={() => setHovered(n)}
                    onMouseLeave={() => setHovered(0)}
                    onClick={() => setRating(n)}
                    aria-label={`${n} star${n !== 1 ? 's' : ''}`}
                  >★</button>
                ))}
                {rating > 0 && (
                  <span className="fb__rating-label">
                    {['', 'Not for me', 'Needs work', 'Pretty good', 'Really good', 'Love it'][rating]}
                  </span>
                )}
              </div>
            </div>

            {/* Open feedback */}
            <div className="fb__section fb__section--row">
              <div className="fb__field">
                <label className="fb__label" htmlFor="fb-liked">What do you like most?</label>
                <textarea
                  id="fb-liked"
                  className="fb__textarea"
                  placeholder="e.g. how fast it clips points…"
                  value={liked}
                  onChange={e => setLiked(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="fb__field">
                <label className="fb__label" htmlFor="fb-improve">What would you improve?</label>
                <textarea
                  id="fb-improve"
                  className="fb__textarea"
                  placeholder="e.g. I wish it could…"
                  value={improve}
                  onChange={e => setImprove(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            {/* Feature wishlist */}
            <div className="fb__section">
              <label className="fb__label">Features you'd love to see</label>
              <div className="fb__features">
                {FEATURE_OPTIONS.map(f => (
                  <label key={f.id} className={`fb__feature${features.includes(f.id) ? ' fb__feature--checked' : ''}`}>
                    <input
                      type="checkbox"
                      checked={features.includes(f.id)}
                      onChange={() => toggleFeature(f.id)}
                    />
                    {f.label}
                  </label>
                ))}
                <label className={`fb__feature${otherChecked ? ' fb__feature--checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={otherChecked}
                    onChange={() => setOtherChecked(o => !o)}
                  />
                  Other
                </label>
              </div>
              {otherChecked && (
                <input
                  type="text"
                  className="fb__other-input"
                  placeholder="What feature would you love?"
                  value={otherFeature}
                  onChange={e => setOtherFeature(e.target.value)}
                  autoFocus
                />
              )}
            </div>

            {/* Newsletter */}
            <div className="fb__newsletter-row">
              <span className="fb__newsletter-text">Want updates when new features ship?</span>
              <NewsletterForm />
            </div>

            {phase === 'error' && (
              <p className="fb__error">Something went wrong — check your connection and try again.</p>
            )}

            <div className="fb__actions">
              <button
                type="submit"
                className="fb__submit"
                disabled={rating === 0 || phase === 'submitting'}
              >
                {phase === 'submitting' ? 'Sending…' : 'Send feedback'}
              </button>
              {rating === 0 && <span className="fb__submit-hint">Select a star rating to submit</span>}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
