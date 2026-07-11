/**
 * Small outline icons for the "/bespoke/request" and "/checkout" help asides.
 * Line-style, single-color (inherits `currentColor`), no fills —
 * kept local to these pages instead of a shared icon system.
 */

const baseProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
}

/** Ruler with tick marks — measurements / plan. */
export function MeasureIcon() {
  return (
    <svg {...baseProps}>
      <rect x="3" y="9" width="18" height="6" rx="1.2" />
      <path d="M7 9v3M10.5 9v3M14 9v3M17.5 9v3" />
    </svg>
  )
}

/** Checklist / document with checked items — next steps. */
export function ChecklistIcon() {
  return (
    <svg {...baseProps}>
      <rect x="4.5" y="3" width="15" height="18" rx="2" />
      <path d="M8 8.4l1.4 1.4L12 7.2" />
      <path d="M8 14.6l1.4 1.4L12 13.4" />
      <path d="M14 8.4h3M14 14.6h3" />
    </svg>
  )
}

/** Open package box — order composition / contents. */
export function PackageIcon() {
  return (
    <svg {...baseProps}>
      <path d="M4 8.2L12 4l8 4.2v7.6L12 20l-8-4.2V8.2z" />
      <path d="M4 8.2L12 12l8-4.2" />
      <path d="M12 12v8" />
    </svg>
  )
}
