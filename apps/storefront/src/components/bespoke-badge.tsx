"use client"

/** Gold BESPOKE capsule. Always in the DOM; open/close is a CSS tween. */
export function BespokeBadge() {
  return (
    <span className="logo-bespoke-badge">
      <svg aria-hidden="true">
        <rect
          x=".5"
          y=".5"
          width="calc(100% - 1px)"
          height="calc(100% - 1px)"
          rx="7.5"
          pathLength="100"
        />
      </svg>
      <span>Bespoke</span>
    </span>
  )
}
