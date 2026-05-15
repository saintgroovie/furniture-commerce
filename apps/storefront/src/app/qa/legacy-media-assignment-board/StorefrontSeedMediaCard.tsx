"use client"

const miniBtnStyle = {
  fontSize: 10,
  fontWeight: 600,
  padding: "5px 6px",
  borderRadius: 6,
  border: "1px solid #d97706",
  background: "#fff",
  color: "#78350f",
  cursor: "pointer",
  width: "100%",
}

type Props = {
  seedUrl: string
  basename: string
  reason: string
  onInspect: () => void
  onCopyUrl: () => void
}

/** QA-only: storefront seed image with no legacy inventory id — honest disabled lane actions. */
export function StorefrontSeedMediaCard({ seedUrl, basename, reason, onInspect, onCopyUrl }: Props) {
  const disabledReason = "Seed-only image: no legacy media id matched yet — export uses inventory ids only."
  return (
    <div
      data-storefront-seed-card="true"
      data-seed-url={seedUrl}
      style={{
        width: "100%",
        maxWidth: 148,
        boxSizing: "border-box",
        borderRadius: 12,
        border: "1px solid #fde68a",
        background: "#fffbeb",
        padding: 8,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 9, fontWeight: 800, color: "#b45309", textTransform: "uppercase", letterSpacing: "0.04em" }}>Seed only</div>
      <div
        style={{
          width: "100%",
          aspectRatio: "1",
          borderRadius: 8,
          overflow: "hidden",
          background: "#fef3c7",
          border: "1px solid #fcd34d",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={seedUrl} alt="" width={132} height={132} style={{ width: "100%", height: "100%", objectFit: "cover" }} draggable={false} />
      </div>
      <div style={{ fontSize: 10, color: "#78350f", fontWeight: 600, overflowWrap: "anywhere", lineHeight: 1.25 }} title={basename}>
        {basename.length > 28 ? `${basename.slice(0, 14)}…${basename.slice(-10)}` : basename}
      </div>
      <p style={{ margin: 0, fontSize: 9, color: "#92400e", lineHeight: 1.35 }} title={reason}>
        {reason}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <button type="button" style={miniBtnStyle} onClick={onInspect}>
          Inspect
        </button>
        <button type="button" style={miniBtnStyle} onClick={onCopyUrl}>
          Copy URL
        </button>
        <button type="button" style={{ ...miniBtnStyle, opacity: 0.55, cursor: "not-allowed" }} disabled title={disabledReason}>
          Use as Reference
        </button>
        <button type="button" style={{ ...miniBtnStyle, opacity: 0.55, cursor: "not-allowed" }} disabled title={disabledReason}>
          Promote to Gallery draft
        </button>
      </div>
    </div>
  )
}
