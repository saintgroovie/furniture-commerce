/**
 * Quiet fullscreen-entry hint pinned to the PDP hero photo: a zoom glyph and,
 * when the gallery has several photos, their count. Pure decoration - the
 * whole hero is already the opener button, so this stays out of the a11y tree.
 */
export function PdpHeroAffordance({ count }: { count: number }) {
  return (
    <span className="pdp-hero-affordance" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="pdp-hero-affordance-icon">
        <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <line x1="15.5" y1="15.5" x2="20" y2="20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <line x1="10.5" y1="8" x2="10.5" y2="13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <line x1="8" y1="10.5" x2="13" y2="10.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
      {count > 1 && <span className="pdp-hero-affordance-count">{count} фото</span>}
    </span>
  )
}
