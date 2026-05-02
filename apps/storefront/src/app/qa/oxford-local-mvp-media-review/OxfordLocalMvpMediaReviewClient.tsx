"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type {
  OxfordLocalMvpMediaReviewPayload,
  OxfordReviewMediaItem,
  OxfordSkuReviewRow,
} from "@/lib/qa/oxford-local-mvp-media-review-types"

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

type SkuFilter =
  | "all"
  | "existing"
  | "missing"
  | "has_ambiguous"
  | "gallery_backlog"
  | "no_media"
  | "orphan_focus"

type ConfFilter = "all" | "confirmed" | "probable" | "ambiguous" | "unassigned"

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

function decisionSelectValue(d: StoredDecision | undefined): ReviewDecision {
  return d?.decision ?? "unset"
}

export function OxfordLocalMvpMediaReviewClient({ payload }: Props) {
  const [skuFilter, setSkuFilter] = useState<SkuFilter>("all")
  const [confFilter, setConfFilter] = useState<ConfFilter>("all")
  const [search, setSearch] = useState("")
  const [decisions, setDecisions] = useState<Record<string, StoredDecision>>({})

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

  const filteredSkuRows = useMemo(() => {
    return payload.sku_rows.filter((row) => {
      if (skuFilter === "existing" && !row.product_in_local_medusa_db) return false
      if (skuFilter === "missing" && row.product_in_local_medusa_db) return false
      if (skuFilter === "has_ambiguous" && row.review_status !== "has_ambiguous_media") return false
      if (skuFilter === "gallery_backlog" && row.gallery_review_backlog_urls.length === 0) return false
      if (skuFilter === "no_media" && row.review_status !== "no_media_candidates") return false
      if (skuFilter === "orphan_focus") return false

      if (confFilter !== "all") {
        const match = row.media_items.some((m) => (m.confidence ?? "unassigned") === confFilter)
        if (!match) return false
      }

      if (q) {
        const blob = `${row.sku} ${row.handle} ${row.title_or_canonical ?? ""}`.toLowerCase()
        const mediaHit = row.media_items.some((m) =>
          `${m.filename} ${m.source_display} ${m.matched_sku ?? ""}`.toLowerCase().includes(q)
        )
        if (!blob.includes(q) && !mediaHit) return false
      }
      return true
    })
  }, [payload.sku_rows, skuFilter, confFilter, q])

  const displayOrphans = useMemo(() => {
    if (skuFilter !== "all" && skuFilter !== "orphan_focus") return []
    return payload.orphan_media.filter((m) => {
      if (confFilter !== "all") {
        const c = m.confidence ?? "unassigned"
        if (confFilter === "unassigned") {
          if (m.confidence && m.confidence !== "unassigned") return false
        } else if (c !== confFilter) return false
      }
      if (q && !`${m.filename} ${m.source_display}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [payload.orphan_media, skuFilter, confFilter, q])

  const showOrphanSection = skuFilter === "all" || skuFilter === "orphan_focus"

  const exportJson = useCallback(() => {
    const decisionsList: Array<Record<string, unknown>> = []
    const allKeys = new Set<string>()
    for (const row of payload.sku_rows) {
      for (const m of row.media_items) allKeys.add(m.media_key)
    }
    for (const m of payload.orphan_media) allKeys.add(m.media_key)
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

    const doc = {
      review_meta: {
        scope: "oxford_local_mvp_media_visual_review",
        status: "manual_review_pending",
        created_at: new Date().toISOString(),
        local_dev_only: true,
        production_rollout: false,
      },
      decisions: decisionsList,
    }
    return JSON.stringify(doc, null, 2)
  }, [decisions, payload])

  const downloadExport = useCallback(() => {
    const body = exportJson()
    const blob = new Blob([body], { type: "application/json" })
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
      <div className="status-message">
        <p>
          <strong>Не удалось загрузить артефакты:</strong>
        </p>
        <ul className="info-text">
          {payload.load_errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 1rem 2rem" }}>
      <div className="status-message" style={{ marginBottom: "1rem" }}>
        <strong>Local QA only.</strong> Oxford remains PAUSED in storefront scope. Non-white / interim images are
        allowed only for local preview — not white-background readiness or production rollout.
      </div>

      <h1 style={{ fontSize: "1.5rem" }}>Oxford local MVP — visual media review</h1>
      <p className="info-text" style={{ marginTop: "0.5rem" }}>
        Решения хранятся в <code>localStorage</code> ({LS_KEY}). Экспортируйте JSON и сохраните вручную как{" "}
        <code>data/normalized/oxford-local-mvp-media-review-decisions.json</code> после ревью. Medusa DB не меняется.
      </p>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: "0.75rem",
          marginTop: "1rem",
        }}
      >
        <Counter label="SKU rows" value={payload.aggregate.total_sku_rows} />
        <Counter label="In local Medusa" value={payload.aggregate.products_in_local_medusa} />
        <Counter label="Missing product" value={payload.aggregate.product_missing_rows} />
        <Counter label="Inventory records" value={payload.aggregate.total_inventory_records} />
        <Counter label="Confirmed (candidates)" value={payload.aggregate.media_confirmed} />
        <Counter label="Probable" value={payload.aggregate.media_probable} />
        <Counter label="Ambiguous" value={payload.aggregate.media_ambiguous} />
        <Counter label="Other / unassigned" value={payload.aggregate.media_unassigned} />
        <Counter label="SKU w/ gallery backlog" value={payload.aggregate.sku_rows_with_gallery_backlog} />
        <Counter label="Orphan / unmapped" value={payload.aggregate.orphan_media_count} />
      </section>

      <div style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
        <label className="info-text">
          SKU scope{" "}
          <select
            value={skuFilter}
            onChange={(e) => setSkuFilter(e.target.value as SkuFilter)}
            style={{ marginLeft: "0.35rem" }}
          >
            <option value="all">all</option>
            <option value="existing">existing products</option>
            <option value="missing">missing products</option>
            <option value="has_ambiguous">has ambiguous</option>
            <option value="gallery_backlog">gallery backlog</option>
            <option value="no_media">no media</option>
            <option value="orphan_focus">orphan / unassigned only</option>
          </select>
        </label>
        <label className="info-text">
          Confidence{" "}
          <select
            value={confFilter}
            onChange={(e) => setConfFilter(e.target.value as ConfFilter)}
            style={{ marginLeft: "0.35rem" }}
          >
            <option value="all">all</option>
            <option value="confirmed">confirmed</option>
            <option value="probable">probable</option>
            <option value="ambiguous">ambiguous</option>
            <option value="unassigned">unassigned</option>
          </select>
        </label>
        <label className="info-text">
          Search{" "}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SKU, handle, filename…"
            style={{ marginLeft: "0.35rem", minWidth: "12rem" }}
          />
        </label>
        <button
          type="button"
          className="button"
          onClick={() => {
            setDecisions({})
            saveDecisions({})
          }}
        >
          Clear decisions (local)
        </button>
        <button type="button" className="button" onClick={downloadExport}>
          Download decisions JSON
        </button>
        <button type="button" className="button" onClick={copyExport}>
          Copy JSON
        </button>
      </div>

      {showOrphanSection && (
        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.15rem" }}>Orphan / unassigned inventory</h2>
          <p className="info-text" style={{ marginBottom: "0.75rem" }}>
            Записи из inventory, не попавшие в SKU candidate map. «Remove» здесь означает только исключение из
            будущего assignment в Medusa, а не удаление файла с диска.
          </p>
          {displayOrphans.length === 0 ? (
            <p className="info-text">Нет orphan-записей по текущим фильтрам.</p>
          ) : (
            <ul className="product-grid" style={{ listStyle: "none", padding: 0 }}>
              {displayOrphans.map((m) => (
                <MediaCard key={m.media_key} media={m} decisions={decisions} onChange={updateDecision} />
              ))}
            </ul>
          )}
        </section>
      )}

      {skuFilter !== "orphan_focus" && (
        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.15rem" }}>SKU cards</h2>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "1.25rem" }}>
            {filteredSkuRows.map((row) => (
              <SkuCard key={row.sku} row={row} decisions={decisions} onChange={updateDecision} />
            ))}
          </ul>
          {filteredSkuRows.length === 0 && <p className="info-text">Нет строк по текущим фильтрам.</p>}
        </section>
      )}
    </div>
  )
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="card" style={{ padding: "0.5rem 0.65rem" }}>
      <div className="info-text" style={{ fontSize: "0.75rem" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function MediaCard({
  media,
  decisions,
  onChange,
}: {
  media: OxfordReviewMediaItem
  decisions: Record<string, StoredDecision>
  onChange: (key: string, p: Partial<StoredDecision>) => void
}) {
  const d = decisions[media.media_key]
  return (
    <li className="card" style={{ padding: "0.65rem", maxWidth: "220px" }}>
      <div style={{ fontSize: "0.75rem", marginBottom: "0.35rem" }}>
        {media.is_orphan ? <strong>Orphan</strong> : media.role ?? "—"}
      </div>
      {media.preview_url ? (
        <img
          src={media.preview_url}
          alt={media.filename}
          style={{ width: "100%", height: "140px", objectFit: "contain", background: "#f4f4f4" }}
        />
      ) : (
        <div
          className="info-text"
          style={{
            height: "140px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#eee",
            fontSize: "0.8rem",
            padding: "0.35rem",
            textAlign: "center",
          }}
        >
          No browser preview (path not served as /static/). Open file locally.
        </div>
      )}
      <p className="info-text" style={{ fontSize: "0.72rem", wordBreak: "break-all", marginTop: "0.35rem" }}>
        {media.filename}
      </p>
      {media.matched_sku && (
        <p className="info-text" style={{ fontSize: "0.72rem" }}>
          → {media.matched_sku} / {media.matched_handle}
        </p>
      )}
      <p className="info-text" style={{ fontSize: "0.68rem" }}>
        {media.confidence ?? "—"} · {media.match_tier ?? "—"}
      </p>
      {media.warnings.length > 0 && (
        <ul className="info-text" style={{ fontSize: "0.65rem", margin: "0.25rem 0", paddingLeft: "1rem" }}>
          {media.warnings.slice(0, 4).map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <DecisionControls mediaKey={media.media_key} decisions={decisions} onChange={onChange} />
    </li>
  )
}

function DecisionControls({
  mediaKey,
  decisions,
  onChange,
}: {
  mediaKey: string
  decisions: Record<string, StoredDecision>
  onChange: (key: string, p: Partial<StoredDecision>) => void
}) {
  const d = decisions[mediaKey]
  const val = decisionSelectValue(d)
  return (
    <div style={{ marginTop: "0.5rem", display: "grid", gap: "0.35rem" }}>
      <label className="info-text" style={{ fontSize: "0.72rem" }}>
        Decision
        <select
          value={val}
          onChange={(e) =>
            onChange(mediaKey, {
              decision: e.target.value as ReviewDecision,
            })
          }
          style={{ display: "block", width: "100%", marginTop: "0.2rem", fontSize: "0.75rem" }}
        >
          <option value="unset">— unset —</option>
          <option value="keep_as_primary">keep_as_primary</option>
          <option value="keep_in_gallery">keep_in_gallery</option>
          <option value="move_to_other_sku">move_to_other_sku</option>
          <option value="remove_from_assignment">remove_from_assignment</option>
          <option value="needs_manual_review">needs_manual_review</option>
          <option value="needs_white_bg_replacement">needs_white_bg_replacement</option>
          <option value="do_not_use">do_not_use</option>
        </select>
      </label>
      {(val === "move_to_other_sku" || val === "remove_from_assignment") && (
        <label className="info-text" style={{ fontSize: "0.72rem" }}>
          Target SKU (optional)
          <input
            style={{ display: "block", width: "100%", fontSize: "0.75rem" }}
            placeholder="OX-…"
            value={d?.target_sku ?? ""}
            onChange={(e) => onChange(mediaKey, { target_sku: e.target.value })}
          />
        </label>
      )}
      <label className="info-text" style={{ fontSize: "0.72rem" }}>
        Note
        <input
          style={{ display: "block", width: "100%", fontSize: "0.75rem" }}
          value={d?.reviewer_note ?? ""}
          onChange={(e) => onChange(mediaKey, { reviewer_note: e.target.value })}
        />
      </label>
      <label className="info-text" style={{ fontSize: "0.72rem", display: "flex", gap: "0.35rem", alignItems: "center" }}>
        <input
          type="checkbox"
          checked={Boolean(d?.needs_white_bg_replacement)}
          onChange={(e) => onChange(mediaKey, { needs_white_bg_replacement: e.target.checked })}
        />
        needs_white_bg_replacement
      </label>
    </div>
  )
}

function SkuCard({
  row,
  decisions,
  onChange,
}: {
  row: OxfordSkuReviewRow
  decisions: Record<string, StoredDecision>
  onChange: (key: string, p: Partial<StoredDecision>) => void
}) {
  return (
    <li className="card" style={{ padding: "1rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "baseline" }}>
        <strong>{row.sku}</strong>
        <span className="info-text">{row.handle}</span>
        <span
          style={{
            fontSize: "0.75rem",
            padding: "0.15rem 0.45rem",
            borderRadius: "4px",
            background: row.product_in_local_medusa_db ? "#e6f4ea" : "#fdeaea",
          }}
        >
          {row.product_in_local_medusa_db ? "product in Medusa" : "product_missing_for_media_assignment"}
        </span>
        <span className="info-text" style={{ fontSize: "0.75rem" }}>
          status: {row.review_status}
        </span>
      </div>
      <p className="info-text" style={{ marginTop: "0.35rem" }}>
        {row.title_or_canonical ?? "—"}
      </p>
      {row.warnings.length > 0 && (
        <ul className="info-text" style={{ fontSize: "0.75rem" }}>
          {row.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div className="info-text" style={{ fontSize: "0.8rem", marginBottom: "0.25rem" }}>
            Planned primary
          </div>
          {row.planned_primary_url ? (
            <img
              src={row.planned_primary_url}
              alt="primary"
              style={{ width: "200px", maxHeight: "160px", objectFit: "contain", background: "#f4f4f4" }}
            />
          ) : (
            <span className="info-text">—</span>
          )}
          <div className="info-text" style={{ fontSize: "0.7rem", marginTop: "0.2rem" }}>{row.planned_primary_tier ?? ""}</div>
        </div>
        <div style={{ flex: "1", minWidth: "200px" }}>
          <div className="info-text" style={{ fontSize: "0.8rem", marginBottom: "0.25rem" }}>
            Gallery / candidates / backlog
          </div>
          <ul className="product-grid" style={{ listStyle: "none", padding: 0, display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {row.media_items.map((m) => (
              <MediaCard key={`${row.sku}-${m.media_key}`} media={m} decisions={decisions} onChange={onChange} />
            ))}
          </ul>
        </div>
      </div>
    </li>
  )
}
