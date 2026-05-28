"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  buildExportPayload,
  copyExportToClipboard,
  downloadExportJson,
} from "./source-orphan-review-export"
import {
  isOrphanDecision,
  loadOrphanReviewState,
  saveOrphanReviewState,
  type PersistedRow,
} from "./source-orphan-review-persistence"
import type {
  BootstrapPayload,
  OrphanDecision,
  PriorityTier,
  ReviewRow,
} from "./source-orphan-review-types"

const API_BASE = "/qa/source-media-orphan-review/api"
const DEFAULT_DISPLAY_LIMIT = 50

type TierFilter = PriorityTier | "all"
type ClassFilter = "all" | "needs_manual_mapping" | "unmapped_orphan"
type ProvenanceFilter = "all" | "yandex" | "legacy_parent" | "legacy_tmp" | "legacy_both"

function provenanceBucket(row: ReviewRow): ProvenanceFilter | "other" {
  if (row.source_kind === "yandex_public") return "yandex"
  if (row.legacy_cache_provenance === "parent_cache") return "legacy_parent"
  if (row.legacy_cache_provenance === "tmp_cache") return "legacy_tmp"
  if (row.legacy_cache_provenance === "both") return "legacy_both"
  return "other"
}

function mergePersisted(items: ReviewRow[]): ReviewRow[] {
  const persisted = loadOrphanReviewState()
  if (!persisted) return items
  return items.map((item) => {
    const p = persisted.rows[item.source_id]
    if (!p) return item
    return {
      ...item,
      operator_decision: isOrphanDecision(p.operator_decision)
        ? p.operator_decision
        : item.operator_decision,
      operator_notes: p.operator_notes ?? item.operator_notes,
    }
  })
}

function toPersistMap(items: ReviewRow[]): Record<string, PersistedRow> {
  const rows: Record<string, PersistedRow> = {}
  for (const i of items) {
    rows[i.source_id] = {
      operator_decision: i.operator_decision,
      operator_notes: i.operator_notes,
      saved_at: new Date().toISOString(),
    }
  }
  return rows
}

export function SourceMediaOrphanReviewClient() {
  const [payload, setPayload] = useState<BootstrapPayload | null>(null)
  const [items, setItems] = useState<ReviewRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tier, setTier] = useState<TierFilter>("P0_review_first")
  const [classFilter, setClassFilter] = useState<ClassFilter>("all")
  const [provenance, setProvenance] = useState<ProvenanceFilter>("all")
  const [newLegacyOnly, setNewLegacyOnly] = useState(false)
  const [crossSkuOnly, setCrossSkuOnly] = useState(false)
  const [search, setSearch] = useState("")
  const [displayLimit, setDisplayLimit] = useState(DEFAULT_DISPLAY_LIMIT)
  const [exportMsg, setExportMsg] = useState("")

  useEffect(() => {
    fetch(`${API_BASE}/bootstrap`, { signal: AbortSignal.timeout(120000) })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        return res.json() as Promise<BootstrapPayload>
      })
      .then((data) => {
        setPayload(data)
        setItems(mergePersisted(data.items))
      })
      .catch((e) => setError(String(e.message || e)))
  }, [])

  const persist = useCallback((next: ReviewRow[]) => {
    setItems(next)
    saveOrphanReviewState(toPersistMap(next))
  }, [])

  const filtered = useMemo(() => {
    let list = items
    if (tier !== "all") list = list.filter((r) => r.priority_tier === tier)
    if (classFilter !== "all") list = list.filter((r) => r.classification_status === classFilter)
    if (provenance !== "all") {
      list = list.filter((r) => provenanceBucket(r) === provenance)
    }
    if (newLegacyOnly) {
      list = list.filter((r) => r.legacy_newly_included === true)
    }
    if (crossSkuOnly) list = list.filter((r) => r.cross_sku_risk)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (r) =>
          r.basename.toLowerCase().includes(q) ||
          (r.sku_guess || "").toLowerCase().includes(q) ||
          (r.handle_guess || "").toLowerCase().includes(q) ||
          (r.collection_guess || "").toLowerCase().includes(q)
      )
    }
    return list
  }, [items, tier, classFilter, provenance, newLegacyOnly, crossSkuOnly, search])

  const visible = useMemo(() => filtered.slice(0, displayLimit), [filtered, displayLimit])

  const decisionCounts = useMemo(() => {
    const c: Record<string, number> = { pending: 0 }
    for (const i of items) {
      c[i.operator_decision] = (c[i.operator_decision] || 0) + 1
    }
    return c
  }, [items])

  const setDecision = (sourceId: string, decision: OrphanDecision) => {
    persist(
      items.map((i) =>
        i.source_id === sourceId ? { ...i, operator_decision: decision } : i
      )
    )
  }

  const setNotes = (sourceId: string, notes: string) => {
    persist(items.map((i) => (i.source_id === sourceId ? { ...i, operator_notes: notes } : i)))
  }

  const exportItems = useMemo(
    () => items.filter((i) => i.operator_decision !== "pending"),
    [items]
  )

  const handleCopy = async () => {
    const ok = await copyExportToClipboard(exportItems, payload?.audit_variant || "")
    setExportMsg(ok ? "Copied JSON" : "Copy failed")
  }

  const handleDownload = () => {
    downloadExportJson(exportItems, payload?.audit_variant || "")
    setExportMsg("Download started")
  }

  if (error) {
    return (
      <div className="sor-root">
        <div className="sor-error">Failed to load audit data: {error}</div>
      </div>
    )
  }

  if (!payload) {
    return (
      <div className="sor-root">
        <p>Loading source orphan review queue…</p>
      </div>
    )
  }

  const stats = payload.stats

  return (
    <div className="sor-root">
      <div className="sor-banner">
        <strong>Это очередь источников, не approval product media.</strong>
        Решения здесь не применяются к каталогу. CO-02-1 exact gaps нельзя закрывать cross-SKU
        substitute. 58 safe supplement candidates живут отдельно в{" "}
        <a href="/qa/legacy-site-media-approval-board">/qa/legacy-site-media-approval-board</a>.
      </div>

      <header className="sor-header">
        <h1>Source media orphan review (QA)</h1>
        <p>
          Full-cache audit · {payload.audit_variant} · queue {stats.total_queue_rows} rows ·
          manifest read-only
        </p>
      </header>

      <div className="sor-stats">
        <div className="sor-stat">
          <b>{stats.total_queue_rows}</b>
          queue rows
        </div>
        <div className="sor-stat">
          <b>{stats.p0_count}</b>
          P0
        </div>
        <div className="sor-stat">
          <b>{stats.needs_manual_mapping_count}</b>
          needs_manual_mapping
        </div>
        <div className="sor-stat">
          <b>{stats.newly_included_legacy_count}</b>
          new legacy URLs
        </div>
        <div className="sor-stat">
          <b>{stats.stable_safe_supplement_count}</b>
          safe supplement (separate)
        </div>
      </div>

      <p className="sor-meta" style={{ marginBottom: "0.75rem" }}>
        CO-02-1 still missing: {stats.co02_missing_targets.join(", ")}
      </p>

      <div className="sor-toolbar">
        <label>
          Tier
          <select value={tier} onChange={(e) => setTier(e.target.value as TierFilter)}>
            <option value="P0_review_first">P0</option>
            <option value="P1_white_bg_sku">P1</option>
            <option value="P2_possible_product">P2</option>
            <option value="P3_low_noise_or_ambiguous">P3</option>
            <option value="all">All</option>
          </select>
        </label>
        <label>
          Classification
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value as ClassFilter)}
          >
            <option value="all">All</option>
            <option value="needs_manual_mapping">needs_manual_mapping</option>
            <option value="unmapped_orphan">unmapped_orphan</option>
          </select>
        </label>
        <label>
          Provenance
          <select
            value={provenance}
            onChange={(e) => setProvenance(e.target.value as ProvenanceFilter)}
          >
            <option value="all">All</option>
            <option value="yandex">Yandex</option>
            <option value="legacy_parent">Legacy parent cache</option>
            <option value="legacy_tmp">Legacy tmp cache</option>
            <option value="legacy_both">Legacy both</option>
          </select>
        </label>
        <label>
          Search SKU/file
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="co-02-1" />
        </label>
        <label>
          <input
            type="checkbox"
            checked={newLegacyOnly}
            onChange={(e) => setNewLegacyOnly(e.target.checked)}
          />{" "}
          New legacy only
        </label>
        <label>
          <input
            type="checkbox"
            checked={crossSkuOnly}
            onChange={(e) => setCrossSkuOnly(e.target.checked)}
          />{" "}
          Cross-SKU risk
        </label>
        <button type="button" className="primary" onClick={handleCopy}>
          Copy JSON
        </button>
        <button type="button" onClick={handleDownload}>
          Download JSON
        </button>
        {exportMsg ? <span>{exportMsg}</span> : null}
      </div>

      <div className="sor-footer">
        Showing {visible.length} of {filtered.length} filtered ({items.length} total) · decisions:{" "}
        {JSON.stringify(decisionCounts)}
      </div>

      <div className="sor-grid">
        {visible.map((row) => (
          <article
            key={row.source_id}
            className={`sor-card${row.cross_sku_risk ? " risk" : ""}`}
            data-testid="sor-card"
            data-source-id={row.source_id}
          >
            <div className="sor-thumb">
              {row.preview_url ? (
                <img src={row.preview_url} alt="" loading="lazy" />
              ) : (
                <span>No preview</span>
              )}
            </div>
            <div className="sor-body">
              <h3>{row.basename}</h3>
              <p className="sor-meta">
                {row.source_kind} · {row.classification_status} · score {row.priority_score}
              </p>
              <div className="sor-tags">
                <span className={`sor-tag tier-p0`}>{row.priority_tier}</span>
                {row.legacy_cache_provenance ? (
                  <span className="sor-tag">{row.legacy_cache_provenance}</span>
                ) : null}
                {row.legacy_newly_included ? (
                  <span className="sor-tag">new legacy</span>
                ) : null}
                {row.cross_sku_risk ? <span className="sor-tag">cross-SKU risk</span> : null}
              </div>
              <p className="sor-meta">
                SKU: {row.sku_guess || "—"} · handle: {row.handle_guess || "—"}
              </p>
              <p className="sor-meta">Collection: {row.collection_guess || "—"}</p>
              <p className="sor-meta" style={{ wordBreak: "break-all", fontSize: "0.72rem" }}>
                {row.source_url || row.source_path}
              </p>
              <p className="sor-why">{row.why_not_safe}</p>
            </div>
            <div className="sor-actions">
              {(
                [
                  ["map_candidate", "Map"],
                  ["reject_noise", "Noise"],
                  ["needs_more_context", "More ctx"],
                  ["blocked_cross_sku", "Blk X-SKU"],
                  ["content_request", "Content req"],
                ] as const
              ).map(([dec, label]) => (
                <button
                  key={dec}
                  type="button"
                  className={row.operator_decision === dec ? "active" : ""}
                  onClick={() => setDecision(row.source_id, dec)}
                >
                  {label}
                </button>
              ))}
              <textarea
                className="sor-notes"
                placeholder="Notes"
                value={row.operator_notes}
                onChange={(e) => setNotes(row.source_id, e.target.value)}
              />
            </div>
          </article>
        ))}
      </div>

      {filtered.length > displayLimit ? (
        <p style={{ marginTop: "1rem" }}>
          <button type="button" onClick={() => setDisplayLimit((n) => n + 50)}>
            Show 50 more ({filtered.length - displayLimit} remaining)
          </button>
        </p>
      ) : null}
    </div>
  )
}
