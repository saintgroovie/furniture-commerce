"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import type {
  OxfordLocalMvpMediaReviewPayload,
  OxfordReviewMediaItem,
  OxfordSkuReviewRow,
} from "@/lib/qa/oxford-local-mvp-media-review-types"
import { previewCanUseImgTag } from "@/lib/qa/oxford-local-mvp-media-review-types"
import {
  decisionSummary,
  humanBacklogReasonShort,
  humanConfidence,
  humanMediaClass,
  humanSourceKind,
  humanSuggestedNextAction,
  isExternalAbsolutePath,
  rowDecisionCount,
  rowNeedsAttention,
  skuRowHumanStatus,
} from "./oxford-media-review-labels"

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
  /** Source/reference backlog only (no image preview) */
  | "needs_source_recovery"
  | "keep_as_reference"
  | "ignore_until_source_mounted"
  | "do_not_use_reference"

const BACKLOG_REFERENCE_DECISIONS = new Set<ReviewDecision>([
  "needs_source_recovery",
  "keep_as_reference",
  "ignore_until_source_mounted",
  "do_not_use_reference",
])

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
  | "has_decisions"
  | "has_candidates"

type ReviewMode = "sku" | "unassigned" | "backlog"

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
  const [mode, setMode] = useState<ReviewMode>("sku")
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
      if (listFilter === "needs_review" && !rowNeedsAttention(row, decisions)) return false
      if (listFilter === "has_primary" && !row.planned_primary_url) return false
      if (listFilter === "has_candidates" && row.media_items.length === 0) return false
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
      if (listFilter === "has_decisions" && !row.media_items.some((m) => decisionOf(decisions[m.media_key]) !== "unset"))
        return false

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
  const dStrip = useMemo(() => decisionSummary(decisions, allKeys), [decisions, allKeys])

  const backlogStats = useMemo(() => {
    const rows = payload.orphan_media.filter((m) => !previewCanUseImgTag(m))
    let sourceNotMounted = 0
    let manifestOnly = 0
    let missingLocal = 0
    let unsupported = 0
    let needsRecovery = 0
    let externalAbs = 0
    for (const m of rows) {
      if (isExternalAbsolutePath(m)) externalAbs += 1
      const c = m.backlog_classification
      if (c === "source_not_mounted") sourceNotMounted += 1
      else if (c === "manifest_only_legacy_reference") manifestOnly += 1
      else if (c === "missing_local_file") missingLocal += 1
      else if (c === "unsupported_reference") unsupported += 1
      else if (c === "needs_source_recovery") needsRecovery += 1
    }
    return {
      total: rows.length,
      sourceNotMounted,
      manifestOnly,
      missingLocal,
      unsupported,
      needsRecovery,
      externalAbs,
    }
  }, [payload.orphan_media])

  const displayOrphans = useMemo(() => {
    return payload.orphan_media.filter((m) => {
      if (q && !`${m.filename} ${m.source_display}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [payload.orphan_media, q])

  const orphanVisual = useMemo(() => displayOrphans.filter((m) => previewCanUseImgTag(m)), [displayOrphans])
  const orphanUnpreviewable = useMemo(() => displayOrphans.filter((m) => !previewCanUseImgTag(m)), [displayOrphans])

  const exportJson = useCallback(() => {
    function findMedia(mediaKey: string): OxfordReviewMediaItem | null {
      for (const r of payload.sku_rows) {
        const m = r.media_items.find((x) => x.media_key === mediaKey)
        if (m) return m
      }
      return payload.orphan_media.find((x) => x.media_key === mediaKey) ?? null
    }

    function exportBacklogReason(m: OxfordReviewMediaItem): string {
      const c = m.backlog_classification
      if (c === "source_not_mounted" || c === "manifest_only_legacy_reference") return "source_not_mounted_or_manifest_only"
      if (c === "missing_local_file") return "missing_local_file_under_data"
      if (c === "unsupported_reference") return "unsupported_path_for_preview"
      if (c === "needs_source_recovery") return "needs_source_recovery"
      if (c === "not_actionable_in_visual_review") return "not_actionable_in_visual_review"
      return "unpreviewable_reference"
    }

    const decisionsList: Array<Record<string, unknown>> = []
    const backlogReferenceDecisions: Array<Record<string, unknown>> = []

    for (const k of allKeys) {
      const d = decisions[k]
      if (!d || d.decision === "unset") continue
      const row = payload.sku_rows.find((r) => r.media_items.some((x) => x.media_key === k))
      const media = findMedia(k)
      if (!media) continue

      const visualOk = previewCanUseImgTag(media)
      let dec = d.decision

      if (!visualOk) {
        if (dec === "do_not_use") dec = "do_not_use_reference"
        if (!BACKLOG_REFERENCE_DECISIONS.has(dec)) continue
        backlogReferenceDecisions.push({
          media_key: k,
          sku: row?.sku ?? media.matched_sku ?? null,
          handle: row?.handle ?? media.matched_handle ?? null,
          filename: media.filename,
          source_kind: media.source_kind ?? null,
          backlog_classification: media.backlog_classification ?? null,
          decision: dec,
          visual_reviewable: false,
          reason: exportBacklogReason(media),
          target_sku: d.target_sku ?? null,
          reviewer_note: d.reviewer_note ?? "",
        })
        continue
      }

      if (BACKLOG_REFERENCE_DECISIONS.has(dec)) continue

      decisionsList.push({
        sku: row?.sku ?? media.matched_sku ?? null,
        handle: row?.handle ?? media.matched_handle ?? null,
        media_url_or_path: media.preview_url ?? media.source_display ?? "",
        filename: media.filename,
        decision: dec,
        visual_reviewable: true,
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
        backlog_reference_decisions: backlogReferenceDecisions,
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
        <strong>Could not load review data.</strong>
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
    background: "#eef1f5",
    color: "#111827",
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
  }

  const tabBtn = (m: ReviewMode, label: string) => {
    const on = mode === m
    return (
      <button
        type="button"
        key={m}
        onClick={() => setMode(m)}
        style={{
          padding: "0.55rem 1.1rem",
          fontSize: "0.9rem",
          fontWeight: 600,
          borderRadius: "10px",
          border: on ? "2px solid #2563eb" : "1px solid #d1d9e6",
          background: on ? "#eff6ff" : "#fff",
          color: on ? "#1d4ed8" : "#334155",
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    )
  }

  const lowUnassignedPool = payload.aggregate.orphan_with_img_preview <= 3

  return (
    <div style={shell}>
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
          padding: "1.1rem 1.35rem",
          position: "sticky",
          top: 0,
          zIndex: 30,
          boxShadow: "0 1px 0 rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "1rem 1.5rem" }}>
          <div style={{ flex: "1 1 240px", minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: "1.45rem", fontWeight: 700, letterSpacing: "-0.02em" }}>Oxford media review</h1>
            <p style={{ margin: "0.4rem 0 0", fontSize: "0.95rem", color: "#64748b", maxWidth: "42rem", lineHeight: 1.45 }}>
              Local QA board for sorting available Oxford images. No DB writes.
            </p>
            <div style={{ marginTop: "0.65rem", display: "flex", flexWrap: "wrap", gap: "0.5rem 1rem", fontSize: "0.88rem" }}>
              <Link href="/qa/oxford-local-mvp-media" style={{ color: "#2563eb", fontWeight: 600 }}>
                Table plan QA
              </Link>
              <span style={{ color: "#cbd5e1" }} aria-hidden>
                ·
              </span>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText("docs/project/oxford-source-expansion-report.md")}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "#2563eb",
                  fontWeight: 600,
                  cursor: "pointer",
                  font: "inherit",
                }}
                title="Copies repo-relative path to clipboard"
              >
                Source expansion report (copy path)
              </button>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
            <Badge text="Local only" tone="neutral" />
            <Badge text="Oxford PAUSED" tone="amber" />
            <Badge text="No DB writes" tone="green" />
            <Badge text="Interim media" tone="neutral" />
            <Badge text="Not production-ready" tone="neutral" />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <button type="button" className="button" onClick={downloadExport} style={{ fontWeight: 600 }}>
              Export decisions
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
            marginTop: "0.85rem",
            paddingTop: "0.85rem",
            borderTop: "1px solid #f1f5f9",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem 1.25rem",
            alignItems: "center",
            fontSize: "0.84rem",
            color: "#475569",
          }}
        >
          <span style={{ fontWeight: 600 }}>
            Progress: {reviewed} / {allKeys.length} reviewed
          </span>
          <span style={{ color: "#94a3b8" }}>|</span>
          <span>
            Recorded: <strong>{reviewed}</strong> decisions (export to save)
          </span>
          <span style={{ color: "#94a3b8" }}>|</span>
          <span>
            Primary {dStrip.primary} · Gallery {dStrip.gallery} · Move {dStrip.move} · Remove {dStrip.remove} · White-bg later{" "}
            {dStrip.whiteBgLater} · Do not use {dStrip.doNotUse}
            {dStrip.other ? ` · Other ${dStrip.other}` : ""}
          </span>
        </div>

        <div style={{ marginTop: "0.85rem", display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          {tabBtn("sku", "Review by SKU")}
          {tabBtn("unassigned", "Unassigned images")}
          {tabBtn("backlog", "Source backlog")}
        </div>

        {lowUnassignedPool && (
          <div
            style={{
              marginTop: "0.85rem",
              padding: "0.75rem 1rem",
              borderRadius: "10px",
              background: "#fffbeb",
              border: "1px solid #fde68a",
              fontSize: "0.88rem",
              color: "#92400e",
              maxWidth: "52rem",
              lineHeight: 1.5,
            }}
          >
            <strong>Only {payload.aggregate.orphan_with_img_preview} previewable unassigned images</strong> right now — that is
            not the full Oxford pool. Mount WOODRIGHT/Yandex or run{" "}
            <code style={{ fontSize: "0.8em" }}>node scripts/expand-oxford-media-source-inventory.mjs</code> to expand inventory.
          </div>
        )}
      </header>

      {mode === "sku" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(260px, 300px) minmax(0, 1fr)",
            gap: "1.1rem",
            padding: "1.1rem",
            maxWidth: "1680px",
            margin: "0 auto",
            alignItems: "start",
          }}
          className="oxford-review-grid oxford-review-main-sku"
        >
          <aside
            className="oxford-review-sidebar"
            style={{
              position: "sticky",
              top: "12.5rem",
              alignSelf: "start",
              maxHeight: "calc(100vh - 13rem)",
              overflowY: "auto",
              background: "#fff",
              borderRadius: "14px",
              padding: "1rem",
              border: "1px solid #e5e7eb",
              boxShadow: "0 4px 14px rgba(15,23,42,0.06)",
            }}
          >
            <input
              type="search"
              placeholder="Search SKU, handle, title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "0.55rem 0.7rem",
                borderRadius: "10px",
                border: "1px solid #d1d9e6",
                marginBottom: "0.65rem",
                fontSize: "0.9rem",
              }}
            />
            <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Filter SKUs
            </label>
            <select
              value={listFilter}
              onChange={(e) => setListFilter(e.target.value as ListFilter)}
              style={{
                width: "100%",
                padding: "0.5rem",
                borderRadius: "10px",
                border: "1px solid #d1d9e6",
                marginTop: "0.35rem",
                marginBottom: "0.85rem",
                fontSize: "0.85rem",
              }}
            >
              <option value="all">All SKUs</option>
              <option value="needs_review">Needs review</option>
              <option value="has_candidates">Has candidates</option>
              <option value="has_primary">Has planned primary</option>
              <option value="no_primary">No primary</option>
              <option value="has_orphan_candidates">Has orphan-like candidates</option>
              <option value="attention">Ambiguous / backlog items</option>
              <option value="ambiguous">Ambiguous only (row)</option>
              <option value="product_missing">Missing product</option>
              <option value="gallery_backlog">Gallery backlog</option>
              <option value="no_media">No media</option>
              <option value="has_decisions">Has decisions</option>
            </select>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.45rem" }}>
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
            {filteredRows.length === 0 && <p style={{ fontSize: "0.88rem", color: "#94a3b8" }}>No SKUs match this filter.</p>}
          </aside>

          <main style={{ minWidth: 0 }}>
            {!selectedRow ? (
              <div
                style={{
                  padding: "3rem 2rem",
                  textAlign: "center",
                  background: "#fff",
                  borderRadius: "14px",
                  border: "1px dashed #cbd5e1",
                }}
              >
                <p style={{ margin: 0, fontSize: "1rem", color: "#64748b" }}>Select a SKU from the list to review images.</p>
              </div>
            ) : (
              <div
                style={{
                  background: "#fff",
                  borderRadius: "14px",
                  border: "1px solid #e5e7eb",
                  boxShadow: "0 4px 14px rgba(15,23,42,0.06)",
                  padding: "1.25rem 1.35rem",
                }}
              >
                <CenterPanel row={selectedRow} decisions={decisions} onDecision={updateDecision} />
                <div style={{ marginTop: "1.75rem", paddingTop: "1.35rem", borderTop: "1px solid #f1f5f9" }}>
                  <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.05rem", fontWeight: 700 }}>Candidates</h2>
                  <p style={{ margin: "0 0 1rem", fontSize: "0.86rem", color: "#64748b" }}>
                    Tap an action to tag this image. <strong>Remove</strong> means remove from a future assignment — not delete the file on disk.
                  </p>
                  <input
                    placeholder="Move to SKU (e.g. OX-90-1)"
                    value={moveTargetSku}
                    onChange={(e) => setMoveTargetSku(e.target.value)}
                    style={{
                      maxWidth: "320px",
                      width: "100%",
                      padding: "0.5rem 0.65rem",
                      borderRadius: "10px",
                      border: "1px solid #d1d9e6",
                      fontSize: "0.88rem",
                      marginBottom: "1.1rem",
                    }}
                  />
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                      gap: "1.15rem",
                    }}
                  >
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
                </div>
              </div>
            )}
          </main>
        </div>
      )}

      {mode === "unassigned" && (
        <section style={{ padding: "1.1rem", maxWidth: "1680px", margin: "0 auto" }}>
          <div
            style={{
              background: "#fff",
              borderRadius: "14px",
              padding: "1.35rem",
              border: "1px solid #e5e7eb",
              boxShadow: "0 4px 14px rgba(15,23,42,0.06)",
            }}
          >
            <h2 style={{ margin: "0 0 0.35rem", fontSize: "1.2rem", fontWeight: 700 }}>Unassigned images</h2>
            <p style={{ margin: "0 0 1rem", fontSize: "0.92rem", color: "#64748b", maxWidth: "40rem", lineHeight: 1.5 }}>
              Only images with a working preview. Assign to a SKU when you are ready — nothing here deletes files.
            </p>
            {displayOrphans.length === 0 ? (
              <p style={{ fontSize: "0.95rem", color: "#94a3b8" }}>No unassigned rows in the current data.</p>
            ) : (
              <>
                <input
                  type="search"
                  placeholder="Filter by filename…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    maxWidth: "320px",
                    width: "100%",
                    padding: "0.55rem 0.7rem",
                    borderRadius: "10px",
                    border: "1px solid #d1d9e6",
                    marginBottom: "0.85rem",
                    fontSize: "0.9rem",
                  }}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", alignItems: "center", marginBottom: "1.1rem" }}>
                  <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "#475569" }}>Assign to SKU</label>
                  <input
                    placeholder="e.g. OX-14-11"
                    value={orphanAssignSku}
                    onChange={(e) => setOrphanAssignSku(e.target.value)}
                    style={{
                      maxWidth: "220px",
                      width: "100%",
                      padding: "0.5rem 0.65rem",
                      borderRadius: "10px",
                      border: "1px solid #d1d9e6",
                      fontSize: "0.88rem",
                    }}
                  />
                </div>
                {orphanVisual.length > 0 ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                      gap: "1.25rem",
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
                  <div
                    style={{
                      padding: "1.25rem",
                      borderRadius: "12px",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      fontSize: "0.92rem",
                      color: "#475569",
                    }}
                  >
                    <p style={{ margin: "0 0 0.5rem" }}>
                      No previewable unassigned images match this filter. More files need a{" "}
                      <strong>WOODRIGHT/Yandex</strong> mount or repo-local discovery.
                    </p>
                    <p style={{ margin: 0, fontSize: "0.86rem", color: "#64748b" }}>
                      Run <code>node scripts/expand-oxford-media-source-inventory.mjs</code> from repo root after mounting source, then refresh this page.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {mode === "backlog" && (
        <section style={{ padding: "1.1rem", maxWidth: "1680px", margin: "0 auto" }}>
          <div
            style={{
              background: "#fff",
              borderRadius: "14px",
              padding: "1.35rem",
              border: "1px solid #e5e7eb",
              boxShadow: "0 4px 14px rgba(15,23,42,0.06)",
            }}
          >
            <h2 style={{ margin: "0 0 0.35rem", fontSize: "1.2rem", fontWeight: 700 }}>Source backlog</h2>
            <p style={{ margin: "0 0 1.1rem", fontSize: "0.92rem", color: "#64748b", maxWidth: "44rem", lineHeight: 1.55 }}>
              References without a browser preview — triage only. Use the <strong>Source backlog</strong> tab for manifests and
              disk paths; do not expect a visual sort here. <strong>Remove</strong> in export still means “exclude from assignment”, not delete on disk.
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.65rem 1.1rem",
                marginBottom: "1.25rem",
                fontSize: "0.86rem",
                color: "#334155",
              }}
            >
              <StatChip label="Total backlog rows" value={backlogStats.total} />
              <StatChip label="Source not mounted" value={backlogStats.sourceNotMounted} />
              <StatChip label="Manifest-only" value={backlogStats.manifestOnly} />
              <StatChip label="Missing local file" value={backlogStats.missingLocal} />
              <StatChip label="External path" value={backlogStats.externalAbs} />
            </div>
            {backlogStats.sourceNotMounted > 0 && (
              <div
                style={{
                  marginBottom: "1.1rem",
                  padding: "0.85rem 1rem",
                  borderRadius: "10px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  fontSize: "0.9rem",
                  color: "#475569",
                  maxWidth: "48rem",
                  lineHeight: 1.5,
                }}
              >
                <strong>WOODRIGHT/Yandex source is not mounted</strong> for some rows. This board only shows repo-local Oxford
                media with previews until you mount the mirror or run source expansion with{" "}
                <code style={{ fontSize: "0.85em" }}>WOODRIGHT_WHITE_BG_ROOT</code>.
              </div>
            )}
            {orphanUnpreviewable.length === 0 ? (
              <p style={{ color: "#64748b" }}>No backlog rows — everything in inventory has a preview or is assigned.</p>
            ) : (
              <SourceReferenceBacklogTable rows={orphanUnpreviewable} decisions={decisions} onDecision={updateDecision} />
            )}
          </div>
        </section>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
@media (max-width: 1100px) {
  .oxford-review-main-sku { grid-template-columns: 1fr !important; }
  .oxford-review-main-sku .oxford-review-sidebar { position: static !important; max-height: none !important; }
}`,
        }}
      />
    </div>
  )
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        padding: "0.35rem 0.65rem",
        borderRadius: "999px",
        background: "#f1f5f9",
        border: "1px solid #e2e8f0",
        fontWeight: 600,
      }}
    >
      <span style={{ color: "#64748b", fontWeight: 500 }}>{label}</span>
      <span>{value}</span>
    </span>
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
  const status = skuRowHumanStatus(row, decisions)
  const decided = rowDecisionCount(row, decisions)
  const thumb =
    row.planned_primary_url ||
    row.media_items.find((m) => previewCanUseImgTag(m))?.preview_url ||
    null
  const statusColor =
    status === "Ready"
      ? "#15803d"
      : status === "Missing product" || status === "No media"
        ? "#b45309"
        : status === "Ambiguous"
          ? "#c2410c"
          : "#1d4ed8"
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: "100%",
        textAlign: "left",
        display: "flex",
        gap: "0.55rem",
        alignItems: "flex-start",
        padding: "0.55rem",
        borderRadius: "12px",
        border: active ? "2px solid #2563eb" : "1px solid #e8eaed",
        background: active ? "#eff6ff" : "#fafbfc",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "10px",
          background: "#e8eaed",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {thumb ? <SidebarThumb url={thumb} /> : null}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: "0.84rem" }}>{row.sku}</div>
        <div style={{ fontSize: "0.72rem", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis" }}>{row.handle}</div>
        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: statusColor, marginTop: "0.2rem" }}>{status}</div>
        <div style={{ fontSize: "0.68rem", color: "#64748b", marginTop: "0.15rem" }}>
          {row.media_items.length} candidates · {decided} decided
        </div>
        <div style={{ display: "flex", gap: "0.2rem", marginTop: "0.28rem", flexWrap: "wrap" }}>
          {o > 0 && <MiniBadge label={`${o} unmapped`} ok={false} soft />}
          {c > 0 && <MiniBadge label={`${c} confirmed`} ok />}
          {p > 0 && <MiniBadge label={`${p} probable`} ok={false} soft />}
          {a > 0 && <MiniBadge label={`${a} ambiguous`} ok={false} />}
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
  const rowStatus = skuRowHumanStatus(row, decisions)

  return (
    <div>
      <div style={{ marginBottom: "1.1rem", display: "flex", flexWrap: "wrap", gap: "0.65rem", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, flex: "1 1 200px" }}>{row.title_or_canonical ?? row.sku}</h2>
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            padding: "0.25rem 0.6rem",
            borderRadius: "999px",
            background: row.product_in_local_medusa_db ? "#dcfce7" : "#ffedd5",
            color: row.product_in_local_medusa_db ? "#166534" : "#9a3412",
          }}
        >
          {row.product_in_local_medusa_db ? "Product in local DB" : "Missing product"}
        </span>
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            padding: "0.25rem 0.6rem",
            borderRadius: "999px",
            background: "#e0e7ff",
            color: "#3730a3",
          }}
        >
          {rowStatus}
        </span>
      </div>
      <p style={{ margin: "0 0 1rem", fontSize: "0.92rem", color: "#64748b" }}>
        {row.sku} · {row.handle}
      </p>

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

      <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "#334155" }}>
        Tagged {decidedForRow} / {row.media_items.length} images on this SKU
      </div>

      <details style={{ marginTop: "1rem", fontSize: "0.82rem", color: "#64748b" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Row notes</summary>
        <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.15rem" }}>
          <li>System status: {row.review_status.replace(/_/g, " ")}</li>
          {row.planned_primary_tier ? <li>Primary tier: {row.planned_primary_tier.replace(/_/g, " ")}</li> : null}
          {row.warnings.length > 0 ? (
            <li>
              Flags:{" "}
              {row.warnings
                .slice(0, 4)
                .map((w) => humanWarning(w))
                .join(", ")}
              {row.warnings.length > 4 ? "…" : ""}
            </li>
          ) : null}
        </ul>
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
        borderRadius: "14px",
        border: d !== "unset" ? "2px solid #2563eb" : "1px solid #e8eaed",
        padding: "0.75rem",
        background: "#fafbfc",
        minWidth: "240px",
      }}
    >
      <div
        style={{
          borderRadius: "12px",
          overflow: "hidden",
          background: "#eef1f4",
          marginBottom: "0.55rem",
          minHeight: "200px",
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginBottom: "0.55rem" }}>
        <TinyBadge text={humanConfidence(media.confidence)} title={media.confidence ?? ""} />
        <TinyBadge text={humanMediaClass(media.media_class)} muted title={media.media_class ?? ""} />
        <TinyBadge text={humanSourceKind(media.source_kind)} muted title={media.source_kind ?? ""} />
        {ambiguous && (
          <span title="Needs a human call" style={{ fontSize: "0.75rem" }}>
            ⚠
          </span>
        )}
      </div>
      {d !== "unset" && (
        <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "#1d4ed8", marginBottom: "0.45rem" }}>Choice: {visualDecisionHuman(d)}</p>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
        {btn("Primary", "keep_as_primary")}
        {btn("Gallery", "keep_in_gallery")}
        {btn("Move", "move_to_other_sku")}
        {btn("Remove", "remove_from_assignment")}
        {btn("White-bg later", "needs_white_bg_replacement")}
        {btn("Do not use", "do_not_use")}
      </div>
      <details style={{ marginTop: "0.55rem", fontSize: "0.72rem", color: "#64748b" }}>
        <summary>Details</summary>
        <div style={{ marginTop: "0.35rem", wordBreak: "break-all" }}>{media.source_display}</div>
        {media.warnings.length > 0 && (
          <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1rem" }}>
            {media.warnings.map((w) => (
              <li key={w}>{humanWarning(w)}</li>
            ))}
          </ul>
        )}
        <button
          type="button"
          style={{
            marginTop: "0.45rem",
            fontSize: "0.72rem",
            color: "#2563eb",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            textDecoration: "underline",
          }}
          onClick={() => onDecision(media.media_key, { decision: "needs_manual_review" })}
        >
          Flag for manual review
        </button>
      </details>
    </div>
  )
}

function TinyBadge({ text, muted, title }: { text: string; muted?: boolean; title?: string }) {
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
      title={title}
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
      <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#334155" }}>Not reviewable here</div>
      <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "0.45rem", maxWidth: "280px", lineHeight: 1.45 }}>
        {media.preview_status === "manifest_only_no_local_file" || media.preview_status === "source_not_mounted"
          ? "This is a reference, not a reviewable image yet."
          : media.preview_error_reason ?? "No preview available in this board."}
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
          Assign
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
        <p style={{ fontSize: "0.72rem", marginTop: "0.5rem", color: "#2563eb", fontWeight: 600 }}>Selected: {visualDecisionHuman(d)}</p>
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
        <TinyBadge text={humanSourceKind(media.source_kind)} muted />
        <TinyBadge text={humanConfidence(media.confidence)} />
      </div>
      {orphanActionRow(media, decisions, onDecision, assignSku)}
      <details style={{ marginTop: "0.45rem", fontSize: "0.7rem", color: "#64748b" }}>
        <summary>Details</summary>
        <div style={{ wordBreak: "break-all", marginTop: "0.35rem" }}>{media.debug_source_path ?? media.source_display}</div>
      </details>
    </div>
  )
}

const BACKLOG_DECISION_OPTIONS: Array<{ decision: ReviewDecision; label: string }> = [
  { decision: "needs_source_recovery", label: "Needs recovery" },
  { decision: "keep_as_reference", label: "Keep as reference" },
  { decision: "ignore_until_source_mounted", label: "Ignore for now" },
  { decision: "do_not_use_reference", label: "Do not use" },
]

function backlogDecisionHuman(d: ReviewDecision): string {
  switch (d) {
    case "needs_source_recovery":
      return "Needs recovery"
    case "keep_as_reference":
      return "Keep as reference"
    case "ignore_until_source_mounted":
      return "Ignore for now"
    case "do_not_use_reference":
    case "do_not_use":
      return "Do not use"
    default:
      return d.replace(/_/g, " ")
  }
}

function visualDecisionHuman(d: ReviewDecision): string {
  switch (d) {
    case "keep_as_primary":
      return "Primary"
    case "keep_in_gallery":
      return "Gallery"
    case "move_to_other_sku":
      return "Move"
    case "remove_from_assignment":
      return "Remove"
    case "needs_white_bg_replacement":
      return "White-bg later"
    case "do_not_use":
      return "Do not use"
    case "needs_manual_review":
      return "Needs review"
    case "unset":
      return "—"
    default:
      return d.replace(/_/g, " ")
  }
}

function SourceReferenceBacklogTable({
  rows,
  decisions,
  onDecision,
}: {
  rows: OxfordReviewMediaItem[]
  decisions: Record<string, StoredDecision>
  onDecision: (k: string, p: Partial<StoredDecision>) => void
}) {
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const ca = a.backlog_classification ?? ""
        const cb = b.backlog_classification ?? ""
        return ca.localeCompare(cb) || a.filename.localeCompare(b.filename)
      }),
    [rows]
  )

  return (
    <div style={{ overflowX: "auto", marginTop: "0.35rem" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>
            <th style={{ padding: "0.35rem 0.45rem", fontWeight: 600 }}>File</th>
            <th style={{ padding: "0.35rem 0.45rem", fontWeight: 600 }}>Source</th>
            <th style={{ padding: "0.35rem 0.45rem", fontWeight: 600 }}>Issue</th>
            <th style={{ padding: "0.35rem 0.45rem", fontWeight: 600 }}>Suggested next step</th>
            <th style={{ padding: "0.35rem 0.45rem", fontWeight: 600 }}>Decision</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => {
            const raw = decisionOf(decisions[m.media_key])
            const d = raw === "do_not_use" ? "do_not_use_reference" : raw
            const backlogSelected = BACKLOG_REFERENCE_DECISIONS.has(d)
            return (
              <tr key={m.media_key} style={{ borderBottom: "1px solid #f1f5f9", verticalAlign: "top" }}>
                <td style={{ padding: "0.45rem", fontWeight: 600, maxWidth: "220px" }}>
                  <div title={m.source_display}>{shortName(m.filename, 44)}</div>
                </td>
                <td style={{ padding: "0.45rem", color: "#475569", whiteSpace: "nowrap" }}>{humanSourceKind(m.source_kind)}</td>
                <td style={{ padding: "0.45rem", color: "#475569" }}>{humanBacklogReasonShort(m)}</td>
                <td style={{ padding: "0.45rem", color: "#334155", fontWeight: 500 }}>{humanSuggestedNextAction(m)}</td>
                <td style={{ padding: "0.45rem" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                    {BACKLOG_DECISION_OPTIONS.map(({ decision: dec, label }) => {
                      const active = backlogSelected && d === dec
                      return (
                        <button
                          key={dec}
                          type="button"
                          className="button"
                          style={{
                            fontSize: "0.68rem",
                            padding: "0.28rem 0.45rem",
                            borderColor: active ? "#2563eb" : undefined,
                            background: active ? "#eff6ff" : undefined,
                          }}
                          onClick={() => onDecision(m.media_key, { decision: dec })}
                        >
                          {label}
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      className="button"
                      style={{ fontSize: "0.68rem", padding: "0.28rem 0.45rem" }}
                      onClick={() => onDecision(m.media_key, { decision: "unset" })}
                    >
                      Clear
                    </button>
                  </div>
                  {backlogSelected && (
                    <div style={{ fontSize: "0.68rem", marginTop: "0.35rem", color: "#2563eb", fontWeight: 600 }}>
                      Selected: {backlogDecisionHuman(d)}
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
