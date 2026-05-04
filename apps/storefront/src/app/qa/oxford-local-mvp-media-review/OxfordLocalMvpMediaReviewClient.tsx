"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import type {
  OxfordLocalMvpMediaReviewPayload,
  OxfordReviewMediaItem,
  OxfordSkuReviewRow,
} from "@/lib/qa/oxford-local-mvp-media-review-types"
import { previewCanUseImgTag } from "@/lib/qa/oxford-local-mvp-media-review-types"

const LS_KEY = "oxford-local-mvp-media-review-decisions-v1"

export type ReviewDecision =
  | "unset"
  | "keep_as_primary"
  | "keep_in_gallery"
  | "move_to_other_sku"
  | "remove_from_assignment"
  | "needs_manual_review"
  | "needs_white_bg_replacement"
  | "do_not_use"

export type StoredDecision = {
  decision: ReviewDecision
  target_sku?: string | null
  target_handle?: string | null
  reason?: string
  reviewer_note?: string
  needs_white_bg_replacement?: boolean
}

type Props = {
  payload: OxfordLocalMvpMediaReviewPayload
}

type ListFilter =
  | "all"
  | "needs_review"
  | "has_primary"
  | "no_primary"
  | "has_orphan_candidates"
  | "attention"
  | "ambiguous"
  | "product_missing"
  | "gallery_backlog"
  | "no_media"

function loadDecisions(): Record<string, StoredDecision> {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return {}
    const j = JSON.parse(raw) as Record<string, StoredDecision>
    return j && typeof j === "object" ? j : {}
  } catch {
    return {}
  }
}

function saveDecisions(map: Record<string, StoredDecision>) {
  localStorage.setItem(LS_KEY, JSON.stringify(map))
}

function decisionOf(d: StoredDecision | undefined): ReviewDecision {
  return d?.decision ?? "unset"
}

function shortName(fn: string, max = 28): string {
  if (fn.length <= max) return fn
  return `${fn.slice(0, 14)}…${fn.slice(-10)}`
}

function humanWarning(w: string): string {
  if (w.includes("orphan")) return "Unmapped"
  if (w.includes("not_white")) return "Not white-bg"
  if (w.includes("ambiguous")) return "Review"
  if (w.includes("page_level")) return "Page-level"
  if (w.includes("shared_p6")) return "Shared PDF"
  if (w.includes("missing")) return "No product"
  return "Note"
}

function rowNeedsReview(row: OxfordSkuReviewRow, decisions: Record<string, StoredDecision>): boolean {
  if (row.gallery_review_backlog_urls.length > 0) return true
  for (const m of row.media_items) {
    if (m.confidence === "ambiguous") return true
    if (decisionOf(decisions[m.media_key]) === "unset") return true
  }
  return false
}

function mediaLooksOrphanCandidate(m: OxfordReviewMediaItem): boolean {
  if (m.is_orphan) return true
  const tier = (m.match_tier ?? "").toLowerCase()
  if (tier.includes("orphan")) return true
  if (m.warnings.some((w) => w.toLowerCase().includes("orphan"))) return true
  return false
}

function skuBadgeCounts(row: OxfordSkuReviewRow) {
  let c = 0,
    p = 0,
    a = 0,
    o = 0
  for (const m of row.media_items) {
    if (mediaLooksOrphanCandidate(m)) o++
    if (m.confidence === "confirmed") c++
    else if (m.confidence === "probable") p++
    else if (m.confidence === "ambiguous") a++
  }
  return { c, p, a, o }
}

function totalDecisionKeys(payload: OxfordLocalMvpMediaReviewPayload): string[] {
  const keys = new Set<string>()
  for (const r of payload.sku_rows) for (const m of r.media_items) keys.add(m.media_key)
  for (const m of payload.orphan_media) keys.add(m.media_key)
  return Array.from(keys)
}

function reviewedCount(decisions: Record<string, StoredDecision>, keys: string[]): number {
  return keys.filter((k) => decisionOf(decisions[k]) !== "unset").length
}

export function OxfordLocalMvpMediaReviewClient({ payload }: Props) {
  const [listFilter, setListFilter] = useState<ListFilter>("all")
  const [search, setSearch] = useState("")
  const [selectedSku, setSelectedSku] = useState<string | null>(null)
  const [decisions, setDecisions] = useState<Record<string, StoredDecision>>({})
  const [moveTargetSku, setMoveTargetSku] = useState("")
  const [orphanAssignSku, setOrphanAssignSku] = useState("")

  useEffect(() => {
    setDecisions(loadDecisions())
  }, [])

  const updateDecision = useCallback((mediaKey: string, patch: Partial<StoredDecision>) => {
    setDecisions((prev) => {
      const cur = prev[mediaKey] ?? { decision: "unset" as ReviewDecision }
      const next = { ...prev, [mediaKey]: { ...cur, ...patch } }
      saveDecisions(next)
      return next
    })
  }, [])

  const q = search.trim().toLowerCase()

  const filteredRows = useMemo(() => {
    return payload.sku_rows.filter((row) => {
      if (listFilter === "needs_review" && !rowNeedsReview(row, decisions)) return false
      if (listFilter === "has_primary" && !row.planned_primary_url) return false
      if (listFilter === "no_primary" && row.planned_primary_url) return false
      if (listFilter === "has_orphan_candidates" && !row.media_items.some((m) => mediaLooksOrphanCandidate(m))) return false
      if (listFilter === "attention") {
        const risky =
          row.gallery_review_backlog_urls.length > 0 ||
          row.media_items.some((m) => m.confidence === "ambiguous")
        if (!risky) return false
      }
      if (listFilter === "ambiguous" && row.review_status !== "has_ambiguous_media") return false
      if (listFilter === "product_missing" && row.product_in_local_medusa_db) return false
      if (listFilter === "gallery_backlog" && row.gallery_review_backlog_urls.length === 0) return false
      if (listFilter === "no_media" && row.review_status !== "no_media_candidates") return false

      if (q) {
        const blob = `${row.sku} ${row.handle} ${row.title_or_canonical ?? ""}`.toLowerCase()
        const hit = row.media_items.some((m) => m.filename.toLowerCase().includes(q))
        if (!blob.includes(q) && !hit) return false
      }
      return true
    })
  }, [payload.sku_rows, listFilter, q, decisions])

  useEffect(() => {
    if (filteredRows.length === 0) {
      setSelectedSku(null)
      return
    }
    if (!selectedSku || !filteredRows.some((r) => r.sku === selectedSku)) {
      setSelectedSku(filteredRows[0].sku)
    }
  }, [filteredRows, selectedSku])

  const selectedRow = useMemo(
    () => payload.sku_rows.find((r) => r.sku === selectedSku) ?? null,
    [payload.sku_rows, selectedSku]
  )

  const allKeys = useMemo(() => totalDecisionKeys(payload), [payload])
  const reviewed = reviewedCount(decisions, allKeys)

  const displayOrphans = useMemo(() => {
    return payload.orphan_media.filter((m) => {
      if (q && !`${m.filename} ${m.source_display}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [payload.orphan_media, q])

  const orphanVisual = useMemo(() => displayOrphans.filter((m) => previewCanUseImgTag(m)), [displayOrphans])
  const orphanUnpreviewable = useMemo(() => displayOrphans.filter((m) => !previewCanUseImgTag(m)), [displayOrphans])

  const exportJson = useCallback(() => {
    const decisionsList: Array<Record<string, unknown>> = []
    for (const k of allKeys) {
      const d = decisions[k]
      if (!d || d.decision === "unset") continue
      const row = payload.sku_rows.find((r) => r.media_items.some((x) => x.media_key === k))
      const media =
        row?.media_items.find((x) => x.media_key === k) ?? payload.orphan_media.find((x) => x.media_key === k)
      decisionsList.push({
        sku: row?.sku ?? media?.matched_sku ?? null,
        handle: row?.handle ?? media?.matched_handle ?? null,
        media_url_or_path: media?.preview_url ?? media?.source_display ?? "",
        filename: media?.filename ?? "",
        decision: d.decision,
        target_sku: d.target_sku ?? null,
        target_handle: d.target_handle ?? null,
        reason: d.reason ?? "",
        reviewer_note: d.reviewer_note ?? "",
        needs_white_bg_replacement: Boolean(d.needs_white_bg_replacement),
      })
    }
    return JSON.stringify(
      {
        review_meta: {
          scope: "oxford_local_mvp_media_visual_review",
          status: "manual_review_pending",
          created_at: new Date().toISOString(),
          local_dev_only: true,
          production_rollout: false,
        },
        decisions: decisionsList,
      },
      null,
      2
    )
  }, [decisions, payload, allKeys])

  const downloadExport = useCallback(() => {
    const blob = new Blob([exportJson()], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "oxford-local-mvp-media-review-decisions.json"
    a.click()
    URL.revokeObjectURL(url)
  }, [exportJson])

  const copyExport = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(exportJson())
    } catch {
      /* ignore */
    }
  }, [exportJson])

  if (payload.load_errors.length > 0) {
    return (
      <div className="status-message" style={{ padding: "1.5rem" }}>
        <strong>Не удалось загрузить данные.</strong>
        <ul className="info-text" style={{ marginTop: "0.5rem" }}>
          {payload.load_errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>
    )
  }

  const shell: React.CSSProperties = {
    minHeight: "100vh",
    background: "#f0f2f5",
    color: "#1a1a1a",
    fontFamily: "system-ui, sans-serif",
  }

  return (
    <div style={shell}>
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #e2e4e8",
          padding: "1rem 1.25rem",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem 1.25rem" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>Oxford local media review — dev only</h1>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#5c6570" }}>Visual-first review board</p>
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.8rem" }}>
              <Link href="/qa/oxford-local-mvp-media" style={{ color: "#2563eb", fontWeight: 600 }}>
                Table plan QA (assignment rows)
              </Link>
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
            <Badge text="Local QA only" tone="neutral" />
            <Badge text="Oxford PAUSED" tone="amber" />
            <Badge text="No DB writes" tone="green" />
            <Badge text="Interim / non-white OK for preview" tone="neutral" />
          </div>
          <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#3d4a5c" }}>
              {reviewed} / {allKeys.length} reviewed
            </span>
            <button type="button" className="button" onClick={downloadExport}>
              Export decisions JSON
            </button>
            <button type="button" className="button" onClick={copyExport}>
              Copy JSON
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                setDecisions({})
                saveDecisions({})
              }}
            >
              Clear decisions
            </button>
          </div>
        </div>
        <div
          style={{
            marginTop: "0.75rem",
            paddingTop: "0.75rem",
            borderTop: "1px solid #e8eaed",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.85rem 1.25rem",
            fontSize: "0.8rem",
            color: "#475569",
            alignItems: "center",
          }}
        >
          <span>
            <strong>{payload.aggregate.total_sku_rows}</strong> SKU rows
          </span>
          <span>
            <strong>{payload.aggregate.review_media_with_img_preview}</strong> with image preview
          </span>
          <span>
            <strong>{payload.aggregate.review_media_without_img_preview}</strong> no preview (see below)
          </span>
          <span>
            <strong>{payload.aggregate.orphan_media_count}</strong> unassigned in gallery
          </span>
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(240px, 280px) minmax(0, 1fr) minmax(280px, 380px)",
          gap: "1rem",
          padding: "1rem",
          maxWidth: "1600px",
          margin: "0 auto",
          alignItems: "start",
        }}
        className="oxford-review-grid oxford-review-main"
      >
        {/* A — Sidebar */}
        <aside
          className="oxford-review-sidebar"
          style={{
            position: "sticky",
            top: "5.5rem",
            alignSelf: "start",
            maxHeight: "calc(100vh - 6rem)",
            overflowY: "auto",
            background: "#fff",
            borderRadius: "12px",
            padding: "0.85rem",
            border: "1px solid #e2e4e8",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        >
          <input
            type="search"
            placeholder="Search SKU, handle, title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "0.5rem 0.65rem",
              borderRadius: "8px",
              border: "1px solid #cfd6dd",
              marginBottom: "0.65rem",
              fontSize: "0.9rem",
            }}
          />
          <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#5c6570", display: "block", marginBottom: "0.35rem" }}>
            Filter
          </label>
          <select
            value={listFilter}
            onChange={(e) => setListFilter(e.target.value as ListFilter)}
            style={{
              width: "100%",
              padding: "0.45rem",
              borderRadius: "8px",
              border: "1px solid #cfd6dd",
              marginBottom: "0.75rem",
              fontSize: "0.85rem",
            }}
          >
            <option value="all">All SKUs</option>
            <option value="needs_review">Needs review</option>
            <option value="has_primary">Has planned primary</option>
            <option value="no_primary">No planned primary</option>
            <option value="has_orphan_candidates">Has orphan candidates on SKU</option>
            <option value="attention">Ambiguous / backlog items</option>
            <option value="ambiguous">Status: ambiguous</option>
            <option value="product_missing">Product missing in Medusa</option>
            <option value="gallery_backlog">Gallery backlog</option>
            <option value="no_media">No media candidates</option>
          </select>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            {filteredRows.map((row) => (
              <SkuListItem
                key={row.sku}
                row={row}
                active={row.sku === selectedSku}
                onSelect={() => setSelectedSku(row.sku)}
                decisions={decisions}
              />
            ))}
          </ul>
          {filteredRows.length === 0 && <p style={{ fontSize: "0.85rem", color: "#888" }}>No rows match.</p>}
        </aside>

        {/* B — Center */}
        <main style={{ minWidth: 0 }}>
          {!selectedRow ? (
            <div className="card" style={{ padding: "2rem", textAlign: "center" }}>
              Select a SKU from the list
            </div>
          ) : (
            <CenterPanel row={selectedRow} decisions={decisions} onDecision={updateDecision} />
          )}
        </main>

        {/* C — Candidate board */}
        <section
          className="oxford-review-right"
          style={{
            position: "sticky",
            top: "5.5rem",
            alignSelf: "start",
            maxHeight: "calc(100vh - 6rem)",
            overflowY: "auto",
            background: "#fff",
            borderRadius: "12px",
            padding: "0.85rem",
            border: "1px solid #e2e4e8",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        >
          <h2 style={{ margin: "0 0 0.65rem", fontSize: "0.95rem", fontWeight: 700 }}>Candidates</h2>
          {!selectedRow ? (
            <p style={{ fontSize: "0.85rem", color: "#888" }}>Pick a SKU to see images.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <input
                placeholder="Move to SKU (e.g. OX-90-1)"
                value={moveTargetSku}
                onChange={(e) => setMoveTargetSku(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.45rem",
                  borderRadius: "8px",
                  border: "1px solid #cfd6dd",
                  fontSize: "0.8rem",
                }}
              />
              {selectedRow.media_items.map((m) => (
                <CandidateCard
                  key={m.media_key}
                  media={m}
                  decisions={decisions}
                  onDecision={updateDecision}
                  moveTargetSku={moveTargetSku}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Orphan gallery — full width below grid on narrow screens handled by media query in style tag */}
      <section style={{ padding: "0 1rem 2rem", maxWidth: "1600px", margin: "0 auto" }}>
        <div
          style={{
            background: "#fff",
            borderRadius: "12px",
            padding: "1rem 1.25rem",
            border: "1px solid #e2e4e8",
            marginTop: "0.5rem",
          }}
        >
          <h2 style={{ margin: "0 0 0.35rem", fontSize: "1.15rem", fontWeight: 700 }}>Unassigned Oxford media</h2>
          <p style={{ margin: "0 0 1rem", fontSize: "0.82rem", color: "#64748b" }}>
            Visual gallery — only entries with a working image URL. Assign does not delete files (future Medusa assignment only).
          </p>
          {displayOrphans.length === 0 ? (
            <p style={{ fontSize: "0.9rem", color: "#888" }}>None right now.</p>
          ) : (
            <>
              <input
                placeholder="Assign orphan to SKU…"
                value={orphanAssignSku}
                onChange={(e) => setOrphanAssignSku(e.target.value)}
                style={{
                  maxWidth: "280px",
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "8px",
                  border: "1px solid #cfd6dd",
                  marginBottom: "1rem",
                }}
              />
              {orphanVisual.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                    gap: "1.1rem",
                  }}
                >
                  {orphanVisual.map((m) => (
                    <OrphanVisualCard
                      key={m.media_key}
                      media={m}
                      decisions={decisions}
                      onDecision={updateDecision}
                      assignSku={orphanAssignSku}
                    />
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: "0.85rem", color: "#94a3b8" }}>No previewable unassigned images in this filter.</p>
              )}

              {orphanUnpreviewable.length > 0 && (
                <details style={{ marginTop: "1.25rem", borderRadius: "10px", border: "1px solid #e2e8f0", padding: "0.65rem 0.85rem", background: "#f8fafc" }}>
                  <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: "0.9rem", color: "#334155" }}>
                    Unpreviewable references ({orphanUnpreviewable.length})
                  </summary>
                  <p style={{ fontSize: "0.78rem", color: "#64748b", margin: "0.5rem 0 0.75rem" }}>
                    Manifest-only or paths not mounted in this environment — not shown as broken thumbnails.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                    {orphanUnpreviewable.map((m) => (
                      <UnpreviewableOrphanRow key={m.media_key} media={m} decisions={decisions} onDecision={updateDecision} assignSku={orphanAssignSku} />
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </div>
      </section>

      <style
        dangerouslySetInnerHTML={{
          __html: `
@media (max-width: 1100px) {
  .oxford-review-grid { grid-template-columns: 1fr !important; }
  .oxford-review-grid .oxford-review-sidebar,
  .oxford-review-grid .oxford-review-right { position: static !important; max-height: none !important; }
}`,
        }}
      />
    </div>
  )
}

function Badge({ text, tone }: { text: string; tone: "neutral" | "amber" | "green" }) {
  const bg =
    tone === "amber" ? "#fff4e0" : tone === "green" ? "#e8f7ee" : "#eef1f4"
  const color = tone === "amber" ? "#8a5a00" : tone === "green" ? "#1b5e2b" : "#4a5568"
  return (
    <span
      style={{
        fontSize: "0.72rem",
        fontWeight: 600,
        padding: "0.2rem 0.5rem",
        borderRadius: "999px",
        background: bg,
        color,
      }}
    >
      {text}
    </span>
  )
}

function SkuListItem({
  row,
  active,
  onSelect,
  decisions,
}: {
  row: OxfordSkuReviewRow
  active: boolean
  onSelect: () => void
  decisions: Record<string, StoredDecision>
}) {
  const { c, p, a, o } = skuBadgeCounts(row)
  const thumb =
    row.planned_primary_url ||
    row.media_items.find((m) => previewCanUseImgTag(m))?.preview_url ||
    null
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: "100%",
        textAlign: "left",
        display: "flex",
        gap: "0.5rem",
        alignItems: "center",
        padding: "0.5rem",
        borderRadius: "10px",
        border: active ? "2px solid #2563eb" : "1px solid #e8eaed",
        background: active ? "#eff6ff" : "#fafbfc",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "8px",
          background: "#e8eaed",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {thumb ? <SidebarThumb url={thumb} /> : null}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "0.82rem" }}>{row.sku}</div>
        <div style={{ fontSize: "0.72rem", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis" }}>
          {row.handle}
        </div>
        <div style={{ display: "flex", gap: "0.2rem", marginTop: "0.25rem", flexWrap: "wrap" }}>
          <MiniBadge label={row.product_in_local_medusa_db ? "in DB" : "no product"} ok={row.product_in_local_medusa_db} />
          {o > 0 && <MiniBadge label={`${o} orphan`} ok={false} soft />}
          {c > 0 && <MiniBadge label={`${c} conf`} ok />}
          {p > 0 && <MiniBadge label={`${p} prob`} ok={false} soft />}
          {a > 0 && <MiniBadge label={`${a} amb`} ok={false} />}
        </div>
      </div>
    </button>
  )
}

function MiniBadge({ label, ok, soft }: { label: string; ok?: boolean; soft?: boolean }) {
  const bg = ok ? "#dcfce7" : soft ? "#fef9c3" : "#fee2e2"
  const color = ok ? "#166534" : soft ? "#854d0e" : "#991b1b"
  return (
    <span style={{ fontSize: "0.62rem", fontWeight: 600, padding: "0.08rem 0.28rem", borderRadius: "4px", background: bg, color }}>
      {label}
    </span>
  )
}

function CenterPanel({
  row,
  decisions,
  onDecision,
}: {
  row: OxfordSkuReviewRow
  decisions: Record<string, StoredDecision>
  onDecision: (k: string, p: Partial<StoredDecision>) => void
}) {
  const plainWarnings = useMemo(() => {
    const lines: string[] = []
    if (!row.product_in_local_medusa_db) lines.push("No product in local Medusa — media is preview-only.")
    if (row.gallery_review_backlog_urls.length)
      lines.push("Some images need a human call (shared PDF / ambiguous).")
    if (row.review_status === "has_only_interim_media") lines.push("Interim / non–white-background only.")
    if (row.review_status === "no_media_candidates") lines.push("No images mapped for this SKU yet.")
    return lines
  }, [row])

  const decidedForRow = row.media_items.filter((m) => decisionOf(decisions[m.media_key]) !== "unset").length

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "12px",
        padding: "1.25rem",
        border: "1px solid #e2e4e8",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ marginBottom: "1rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>{row.title_or_canonical ?? row.sku}</h2>
        <p style={{ margin: "0.35rem 0 0", fontSize: "0.9rem", color: "#64748b" }}>
          {row.sku} · {row.handle}
        </p>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: "0.5rem" }}>Planned primary</div>
        <div
          style={{
            borderRadius: "12px",
            background: "#f4f5f7",
            minHeight: "280px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          {row.planned_primary_url ? (
            <PreviewLarge
              url={row.planned_primary_url}
              alt="Primary"
              onNeedsPathFix={() => {
                const pk =
                  row.media_items.find((m) => m.preview_url === row.planned_primary_url)?.media_key ??
                  row.media_items.find((m) => m.role === "planned_primary")?.media_key
                if (pk) onDecision(pk, { decision: "needs_manual_review", reason: "preview_load_failed" })
              }}
            />
          ) : (
            <span style={{ color: "#94a3b8" }}>No primary planned</span>
          )}
        </div>
      </div>

      {(row.planned_gallery_urls.length > 0 || row.gallery_review_backlog_urls.length > 0) && (
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: "0.5rem" }}>Gallery & backlog</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {row.planned_gallery_urls.map((u) => (
              <div key={u} style={{ width: 96, height: 96, borderRadius: "8px", overflow: "hidden", border: "1px solid #e2e4e8" }}>
                <PreviewLarge url={u} alt="" />
              </div>
            ))}
            {row.gallery_review_backlog_urls.map((u) => (
              <div
                key={`b-${u}`}
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: "8px",
                  overflow: "hidden",
                  border: "2px dashed #f59e0b",
                }}
                title="Backlog — needs review"
              >
                <PreviewLarge url={u} alt="" />
              </div>
            ))}
          </div>
        </div>
      )}

      {plainWarnings.length > 0 && (
        <ul style={{ margin: "0 0 1rem", paddingLeft: "1.1rem", fontSize: "0.88rem", color: "#475569" }}>
          {plainWarnings.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}

      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#334155" }}>
        Decisions on this SKU: {decidedForRow} / {row.media_items.length} images tagged
      </div>

      <details style={{ marginTop: "1rem", fontSize: "0.8rem", color: "#64748b" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Technical details</summary>
        <pre
          style={{
            marginTop: "0.5rem",
            padding: "0.65rem",
            background: "#f8fafc",
            borderRadius: "8px",
            overflow: "auto",
            fontSize: "0.72rem",
            maxHeight: "200px",
          }}
        >
          {JSON.stringify(
            {
              review_status: row.review_status,
              planned_primary_tier: row.planned_primary_tier,
              warnings: row.warnings,
              media_keys: row.media_items.map((m) => m.media_key),
            },
            null,
            2
          )}
        </pre>
      </details>
    </div>
  )
}

function PreviewLarge({
  url,
  alt = "",
  onNeedsPathFix,
}: {
  url: string
  alt?: string
  onNeedsPathFix?: () => void
}) {
  const [broken, setBroken] = useState(false)
  if (broken) {
    return (
      <div style={{ textAlign: "center", padding: "1rem", maxWidth: "360px" }}>
        <div style={{ fontSize: "2rem", marginBottom: "0.35rem" }}>⚠</div>
        <p style={{ fontSize: "0.8rem", color: "#b45309", margin: "0 0 0.5rem" }}>Preview did not load</p>
        <p style={{ fontSize: "0.72rem", wordBreak: "break-all", color: "#64748b", margin: 0 }}>{shortName(url, 56)}</p>
        <p style={{ fontSize: "0.72rem", marginTop: "0.5rem", color: "#94a3b8" }}>File stays in inventory.</p>
        {onNeedsPathFix ? (
          <button
            type="button"
            onClick={onNeedsPathFix}
            style={{
              marginTop: "0.65rem",
              padding: "0.4rem 0.75rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Needs source/path fix
          </button>
        ) : null}
        <details style={{ marginTop: "0.5rem", fontSize: "0.68rem", color: "#94a3b8", textAlign: "left" }}>
          <summary style={{ cursor: "pointer" }}>Full URL / path</summary>
          <div style={{ wordBreak: "break-all", marginTop: "0.35rem" }}>{url}</div>
        </details>
      </div>
    )
  }
  return (
    <img
      src={url}
      alt={alt}
      onError={() => setBroken(true)}
      style={{ maxWidth: "100%", maxHeight: "min(52vh, 420px)", width: "auto", height: "auto", objectFit: "contain" }}
    />
  )
}

function CandidateCard({
  media,
  decisions,
  onDecision,
  moveTargetSku,
}: {
  media: OxfordReviewMediaItem
  decisions: Record<string, StoredDecision>
  onDecision: (k: string, p: Partial<StoredDecision>) => void
  moveTargetSku: string
}) {
  const d = decisionOf(decisions[media.media_key])
  const ambiguous = media.confidence === "ambiguous" || media.warnings.some((w) => w.toLowerCase().includes("ambigu"))

  const btn = (label: string, dec: ReviewDecision) => {
    const active = d === dec
    return (
      <button
        type="button"
        onClick={() => {
          if (dec === "move_to_other_sku" && moveTargetSku.trim()) {
            onDecision(media.media_key, { decision: dec, target_sku: moveTargetSku.trim() })
          } else {
            onDecision(media.media_key, { decision: dec })
          }
        }}
        style={{
          flex: 1,
          minWidth: "76px",
          padding: "0.5rem 0.4rem",
          fontSize: "0.76rem",
          fontWeight: 600,
          borderRadius: "8px",
          border: active ? "2px solid #2563eb" : "1px solid #d1d9e0",
          background: active ? "#dbeafe" : "#fff",
          color: "#1e293b",
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div
      style={{
        borderRadius: "12px",
        border: d !== "unset" ? "2px solid #2563eb" : "1px solid #e8eaed",
        padding: "0.65rem",
        background: "#fafbfc",
      }}
    >
      <div
        style={{
          borderRadius: "10px",
          overflow: "hidden",
          background: "#eef1f4",
          marginBottom: "0.5rem",
          minWidth: "220px",
        }}
      >
        {previewCanUseImgTag(media) && media.preview_url ? (
          <div style={{ width: "100%", minHeight: "200px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <PreviewLarge
              url={media.preview_url}
              alt={media.filename}
              onNeedsPathFix={() =>
                onDecision(media.media_key, { decision: "needs_manual_review", reason: "preview_load_failed" })
              }
            />
          </div>
        ) : (
          <NoPreviewTile
            media={media}
            onNeedsPathFix={() =>
              onDecision(media.media_key, { decision: "needs_manual_review", reason: "preview_load_failed" })
            }
          />
        )}
      </div>
      <div style={{ fontWeight: 600, fontSize: "0.82rem", marginBottom: "0.35rem", overflow: "hidden", textOverflow: "ellipsis" }}>
        {shortName(media.filename, 32)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", marginBottom: "0.5rem" }}>
        <TinyBadge text={media.confidence ?? "?"} />
        <TinyBadge text={media.media_class?.replace(/_/g, " ") ?? "—"} muted />
        <TinyBadge text={media.source_kind?.replace(/_/g, " ") ?? ""} muted />
        {ambiguous && <span title="Needs care">⚠️</span>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
        {btn("Primary", "keep_as_primary")}
        {btn("Gallery", "keep_in_gallery")}
        {btn("Move", "move_to_other_sku")}
        {btn("Remove", "remove_from_assignment")}
        {btn("White-bg later", "needs_white_bg_replacement")}
        {btn("Do not use", "do_not_use")}
        {btn("Review", "needs_manual_review")}
      </div>
      <details style={{ marginTop: "0.5rem", fontSize: "0.72rem", color: "#64748b" }}>
        <summary>Details</summary>
        <div style={{ marginTop: "0.35rem", wordBreak: "break-all" }}>{media.source_display}</div>
        {media.warnings.length > 0 && (
          <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1rem" }}>
            {media.warnings.map((w) => (
              <li key={w}>{humanWarning(w)}</li>
            ))}
          </ul>
        )}
      </details>
    </div>
  )
}

function TinyBadge({ text, muted }: { text: string; muted?: boolean }) {
  if (!text) return null
  return (
    <span
      style={{
        fontSize: "0.65rem",
        fontWeight: 600,
        padding: "0.12rem 0.35rem",
        borderRadius: "6px",
        background: muted ? "#f1f5f9" : "#e0e7ff",
        color: muted ? "#64748b" : "#3730a3",
      }}
    >
      {text}
    </span>
  )
}

function SidebarThumb({ url }: { url: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return <div style={{ width: "100%", height: "100%", background: "#e2e8f0" }} aria-hidden />
  }
  return (
    <img
      src={url}
      alt=""
      onError={() => setFailed(true)}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  )
}

function NoPreviewTile({
  media,
  onNeedsPathFix,
}: {
  media: OxfordReviewMediaItem
  onNeedsPathFix?: () => void
}) {
  return (
    <div
      style={{
        minHeight: 200,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#334155" }}>No preview</div>
      <div style={{ fontSize: "0.76rem", color: "#64748b", marginTop: "0.45rem", maxWidth: "280px" }}>
        {media.preview_error_reason ?? media.preview_status.replace(/_/g, " ")}
      </div>
      <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "0.35rem" }}>{shortName(media.filename, 36)}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", justifyContent: "center", marginTop: "0.65rem" }}>
        {onNeedsPathFix ? (
          <button type="button" className="button" style={{ fontSize: "0.72rem" }} onClick={onNeedsPathFix}>
            Needs source/path fix
          </button>
        ) : null}
      </div>
    </div>
  )
}

function orphanActionRow(
  media: OxfordReviewMediaItem,
  decisions: Record<string, StoredDecision>,
  onDecision: (k: string, p: Partial<StoredDecision>) => void,
  assignSku: string
) {
  const d = decisionOf(decisions[media.media_key])
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.65rem" }}>
        <button
          type="button"
          className="button"
          style={{ fontSize: "0.75rem", padding: "0.4rem 0.65rem" }}
          onClick={() => {
            if (assignSku.trim()) {
              onDecision(media.media_key, { decision: "move_to_other_sku", target_sku: assignSku.trim() })
            }
          }}
        >
          Assign to SKU
        </button>
        <button type="button" className="button" style={{ fontSize: "0.75rem", padding: "0.4rem 0.65rem" }} onClick={() => onDecision(media.media_key, { decision: "unset" })}>
          Keep unassigned
        </button>
        <button type="button" className="button" style={{ fontSize: "0.75rem", padding: "0.4rem 0.65rem" }} onClick={() => onDecision(media.media_key, { decision: "do_not_use" })}>
          Do not use
        </button>
        <button
          type="button"
          className="button"
          style={{ fontSize: "0.75rem", padding: "0.4rem 0.65rem" }}
          onClick={() => onDecision(media.media_key, { decision: "needs_manual_review" })}
        >
          Needs review
        </button>
      </div>
      {d !== "unset" && (
        <p style={{ fontSize: "0.72rem", marginTop: "0.5rem", color: "#2563eb", fontWeight: 600 }}>Selected: {d}</p>
      )}
    </>
  )
}

function OrphanVisualCard({
  media,
  decisions,
  onDecision,
  assignSku,
}: {
  media: OxfordReviewMediaItem
  decisions: Record<string, StoredDecision>
  onDecision: (k: string, p: Partial<StoredDecision>) => void
  assignSku: string
}) {
  const d = decisionOf(decisions[media.media_key])
  return (
    <div
      style={{
        borderRadius: "12px",
        border: d !== "unset" ? "2px solid #2563eb" : "1px solid #e8eaed",
        padding: "0.75rem",
        background: "#fff",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ borderRadius: "10px", overflow: "hidden", background: "#f1f5f9", minHeight: "220px" }}>
        <PreviewLarge
          url={media.preview_url}
          alt={media.filename}
          onNeedsPathFix={() =>
            onDecision(media.media_key, { decision: "needs_manual_review", reason: "preview_load_failed" })
          }
        />
      </div>
      <p style={{ fontWeight: 600, fontSize: "0.85rem", margin: "0.55rem 0 0.25rem" }}>{shortName(media.filename, 34)}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
        <TinyBadge text={media.source_kind?.replace(/_/g, " ") ?? "—"} muted />
        <TinyBadge text={media.confidence ?? "?"} />
      </div>
      {orphanActionRow(media, decisions, onDecision, assignSku)}
      <details style={{ marginTop: "0.45rem", fontSize: "0.7rem", color: "#64748b" }}>
        <summary>Details</summary>
        <div style={{ wordBreak: "break-all", marginTop: "0.35rem" }}>{media.debug_source_path ?? media.source_display}</div>
      </details>
    </div>
  )
}

function UnpreviewableOrphanRow({
  media,
  decisions,
  onDecision,
  assignSku,
}: {
  media: OxfordReviewMediaItem
  decisions: Record<string, StoredDecision>
  onDecision: (k: string, p: Partial<StoredDecision>) => void
  assignSku: string
}) {
  return (
    <div
      style={{
        borderRadius: "10px",
        border: "1px solid #e2e8f0",
        padding: "0.55rem 0.65rem",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        gap: "0.35rem",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "baseline" }}>
        <span style={{ fontWeight: 700, fontSize: "0.82rem" }}>{shortName(media.filename, 32)}</span>
        <TinyBadge text={media.preview_status.replace(/_/g, " ")} muted />
        <TinyBadge text={media.source_kind?.replace(/_/g, " ") ?? ""} muted />
      </div>
      <div style={{ fontSize: "0.74rem", color: "#64748b" }}>{media.preview_error_reason ?? "No image URL for this reference."}</div>
      {orphanActionRow(media, decisions, onDecision, assignSku)}
      <details style={{ fontSize: "0.68rem", color: "#94a3b8" }}>
        <summary>Source</summary>
        <div style={{ wordBreak: "break-all" }}>{media.debug_source_path ?? media.source_display}</div>
      </details>
    </div>
  )
}
