"use client"

import { useMemo } from "react"
import type { OrphanP0OverlayCandidate, OrphanP0OverlayData } from "./orphan-p0-overlay-types"
import type { OrphanP0OverlayPersistedState } from "./orphan-p0-overlay-types"
import { buildOrphanP0OverlayExport } from "./orphan-p0-overlay-export"

type Props = {
  data: OrphanP0OverlayData
  overlayState: OrphanP0OverlayPersistedState
  focusedPackIndex: number | null
  filter: string
  onFilterChange: (v: string) => void
  onFocusCandidate: (candidate: OrphanP0OverlayCandidate) => void
  onRoutingNoteChange: (packIndex: number, note: string) => void
  onExport: () => void
}

function matchesFilter(c: OrphanP0OverlayCandidate, filter: string): boolean {
  const q = filter.trim().toLowerCase()
  if (!q) return true
  return (
    c.sku_like_handle.toLowerCase().includes(q) ||
    (c.catalog_handle ?? "").toLowerCase().includes(q) ||
    c.filename.toLowerCase().includes(q)
  )
}

function CandidateCard({
  candidate,
  focused,
  disabled,
  onFocus,
}: {
  candidate: OrphanP0OverlayCandidate
  focused: boolean
  disabled?: boolean
  onFocus: () => void
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onFocus}
      disabled={disabled}
      style={{
        display: "flex",
        gap: "10px",
        width: "100%",
        textAlign: "left",
        padding: "8px",
        border: focused ? "2px solid #1a3a6e" : "1px solid #e0e0e0",
        borderRadius: "6px",
        background: disabled ? "#f5f5f5" : focused ? "#eef4ff" : "#fff",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.75 : 1,
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          flexShrink: 0,
          borderRadius: "4px",
          overflow: "hidden",
          background: "#eee",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {candidate.source_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={candidate.source_url}
            alt={candidate.filename}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            loading="lazy"
          />
        ) : (
          <span style={{ fontSize: "10px", color: "#999" }}>no preview</span>
        )}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "4px" }}>
          <span
            style={{
              fontSize: "10px",
              fontWeight: 700,
              background: disabled ? "#ddd" : "#1a3a6e",
              color: disabled ? "#666" : "#fff",
              padding: "2px 6px",
              borderRadius: "3px",
            }}
          >
            {candidate.overlay_badge}
          </span>
          {disabled && (
            <span style={{ fontSize: "10px", color: "#a33", fontWeight: 600 }}>
              Needs external catalog source
            </span>
          )}
        </div>
        <div style={{ fontSize: "11px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
          {candidate.filename}
        </div>
        <div style={{ fontSize: "10px", color: "#555", marginTop: "2px" }}>
          SKU: {candidate.sku_like_handle}
          {candidate.catalog_handle ? ` → catalog: ${candidate.catalog_handle}` : ""}
        </div>
        <div style={{ fontSize: "10px", color: "#888", marginTop: "2px" }}>
          {candidate.catalog_handle_mapping_status}
        </div>
      </div>
    </button>
  )
}

export function OrphanP0OverlayPanel({
  data,
  overlayState,
  focusedPackIndex,
  filter,
  onFilterChange,
  onFocusCandidate,
  onRoutingNoteChange,
  onExport,
}: Props) {
  const v = data.validation

  const filteredResolved = useMemo(
    () => data.resolved_candidates.filter((c) => matchesFilter(c, filter)),
    [data.resolved_candidates, filter]
  )

  const filteredPending = useMemo(
    () => data.pending_unresolved.filter((c) => matchesFilter(c, filter)),
    [data.pending_unresolved, filter]
  )

  const handleCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const c of data.resolved_candidates) {
      const h = c.catalog_handle ?? "?"
      counts[h] = (counts[h] ?? 0) + 1
    }
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
  }, [data.resolved_candidates])

  const focusedCandidate =
    focusedPackIndex != null
      ? [...data.resolved_candidates, ...data.pending_unresolved].find((c) => c.pack_index === focusedPackIndex) ??
        null
      : null

  return (
    <aside
      style={{
        borderRight: "1px solid #ddd",
        overflow: "hidden",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          background: "#fff8e6",
          borderBottom: "2px solid #e6c200",
          flexShrink: 0,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: "13px", color: "#5a4200" }}>
          Orphan P0 overlay — read-only routing mode
        </div>
        <div style={{ fontSize: "11px", color: "#6a5500", marginTop: "4px", lineHeight: 1.45 }}>
          {v.resolved_candidates} resolved candidates loaded · {v.pending_unresolved} unresolved hidden from routing /
          pending catalog source · <strong>do_not_auto_apply</strong>
        </div>
      </div>

      <div style={{ padding: "8px 10px", borderBottom: "1px solid #eee", flexShrink: 0 }}>
        <input
          type="text"
          placeholder="Filter handle / filename…"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          style={{
            width: "100%",
            padding: "5px 8px",
            border: "1px solid #ddd",
            borderRadius: "4px",
            fontSize: "12px",
            boxSizing: "border-box",
          }}
        />
        <button
          type="button"
          onClick={onExport}
          style={{
            marginTop: "6px",
            width: "100%",
            padding: "6px 8px",
            fontSize: "11px",
            fontWeight: 600,
            border: "1px solid #aacaff",
            borderRadius: "4px",
            background: "#e8f0ff",
            color: "#1a3a6e",
            cursor: "pointer",
          }}
        >
          Export overlay routing plan (no apply)
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <section>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#1a4a1a",
              marginBottom: "6px",
            }}
          >
            Resolved candidates ({filteredResolved.length})
          </div>
          <div style={{ fontSize: "10px", color: "#666", marginBottom: "8px" }}>
            {handleCounts.length} catalog handles · click to focus product workspace
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {filteredResolved.map((c) => (
              <CandidateCard
                key={`resolved-${c.pack_index}`}
                candidate={c}
                focused={focusedPackIndex === c.pack_index}
                onFocus={() => onFocusCandidate(c)}
              />
            ))}
            {filteredResolved.length === 0 && (
              <div style={{ fontSize: "11px", color: "#999" }}>No resolved matches for filter.</div>
            )}
          </div>
        </section>

        <section>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#7a0000",
              marginBottom: "6px",
            }}
          >
            Pending unresolved ({filteredPending.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {filteredPending.map((c) => (
              <CandidateCard
                key={`pending-${c.pack_index}`}
                candidate={c}
                focused={focusedPackIndex === c.pack_index}
                disabled
                onFocus={() => onFocusCandidate(c)}
              />
            ))}
          </div>
        </section>

        {focusedCandidate && focusedCandidate.routable && (
          <section
            style={{
              borderTop: "1px solid #eee",
              paddingTop: "10px",
            }}
          >
            <div style={{ fontSize: "11px", fontWeight: 700, marginBottom: "6px" }}>Focused candidate</div>
            <CandidateCard
              candidate={focusedCandidate}
              focused
              onFocus={() => onFocusCandidate(focusedCandidate)}
            />
            <label style={{ display: "block", marginTop: "8px", fontSize: "11px", color: "#555" }}>
              Operator routing note (overlay only)
              <textarea
                value={overlayState.routingNotes[String(focusedCandidate.pack_index)] ?? ""}
                onChange={(e) => onRoutingNoteChange(focusedCandidate.pack_index, e.target.value)}
                rows={2}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "4px",
                  fontSize: "11px",
                  padding: "6px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  boxSizing: "border-box",
                }}
              />
            </label>
          </section>
        )}
      </div>
    </aside>
  )
}

export function downloadOrphanP0OverlayExport(data: OrphanP0OverlayData, overlayState: OrphanP0OverlayPersistedState) {
  const payload = buildOrphanP0OverlayExport(data, overlayState)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `orphan-p0-overlay-routing-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
