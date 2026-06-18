"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  canRouteToAssign,
  collectionGate,
  collectionGateMessage,
  isYandexUnmirrored,
} from "../../_lib/media-source-gates"
import {
  copyExportToClipboard,
  downloadExportJson,
} from "../../source-media-orphan-review/source-orphan-review-export"
import type { OrphanDecision, ReviewRow } from "./orphan-queue-types"
import { type TierFilter, useOrphanQueue } from "./useOrphanQueue"

const DECISION_BUTTONS: Array<{
  decision: OrphanDecision
  label: string
  primary?: boolean
  danger?: boolean
}> = [
  { decision: "map_candidate", label: "→ В Assign", primary: true },
  { decision: "reject_noise", label: "Отклонить" },
  { decision: "blocked_cross_sku", label: "Заблокировать cross-SKU", danger: true },
  { decision: "needs_more_context", label: "Нужен контекст" },
  { decision: "content_request", label: "Нужен источник" },
]

export type OrphanQueuePanelProps = {
  embeddedInShell?: boolean
  selectedSourceId?: string | null
  onSelectSourceId?: (id: string) => void
}

function highlightInventoryId(row: ReviewRow): string | null {
  const m = row.enrichment.duplicate_evidence.matches[0]
  return m?.inventory_id ?? null
}

export function OrphanQueuePanel({
  embeddedInShell = false,
  selectedSourceId = null,
  onSelectSourceId,
}: OrphanQueuePanelProps) {
  const router = useRouter()
  const queue = useOrphanQueue()
  const [exportMsg, setExportMsg] = useState("")

  const {
    payload,
    error,
    tier,
    setTier,
    crossSkuOnly,
    setCrossSkuOnly,
    search,
    setSearch,
    filtered,
    decisionCounts,
    setDecision,
    setNotes,
    exportItems,
    loading,
  } = queue

  const activeRow = useMemo(() => {
    if (!filtered.length) return null
    if (selectedSourceId) {
      return filtered.find((r) => r.source_id === selectedSourceId) ?? filtered[0]
    }
    return filtered[0]
  }, [filtered, selectedSourceId])

  useEffect(() => {
    if (!activeRow || !onSelectSourceId) return
    if (activeRow.source_id !== selectedSourceId) {
      onSelectSourceId(activeRow.source_id)
    }
  }, [activeRow, onSelectSourceId, selectedSourceId])

  const goAssign = useCallback(
    (row: ReviewRow) => {
      const handle = row.enrichment.sku_context.handle || row.handle_guess
      if (!handle) return
      setDecision(row.source_id, "map_candidate")
      const highlight = highlightInventoryId(row)
      const q = new URLSearchParams({
        handle: handle.toLowerCase(),
        from: "orphan",
      })
      if (highlight) q.set("highlight", highlight)
      router.push(`/qa/media-ops/assign?${q}`)
    },
    [router, setDecision]
  )

  const stepRow = useCallback(
    (delta: number) => {
      if (!activeRow || !onSelectSourceId) return
      const idx = filtered.findIndex((r) => r.source_id === activeRow.source_id)
      const next = filtered[idx + delta]
      if (next) onSelectSourceId(next.source_id)
    },
    [activeRow, filtered, onSelectSourceId]
  )

  if (error) {
    return (
      <div className="sor-root" data-media-ops-orphan-panel data-embedded={embeddedInShell}>
        <div className="sor-error">Failed to load audit data: {error}</div>
      </div>
    )
  }

  if (loading || !payload) {
    return (
      <div className="sor-root" data-media-ops-orphan-panel data-embedded={embeddedInShell}>
        <p>Загрузка очереди сирот…</p>
      </div>
    )
  }

  const stats = payload.stats
  const gate = activeRow ? collectionGate(activeRow.collection_guess) : null
  const gateMsg = gate ? collectionGateMessage(gate) : null

  const handleCopy = async () => {
    const ok = await copyExportToClipboard(exportItems, payload.audit_variant || "")
    setExportMsg(ok ? "Copied JSON" : "Copy failed")
  }

  const handleDownload = () => {
    downloadExportJson(exportItems, payload.audit_variant || "")
    setExportMsg("Download started")
  }

  return (
    <div
      className="sor-root"
      data-media-ops-orphan-panel
      data-embedded={embeddedInShell ? "true" : "false"}
      data-media-ops-orphan-layout="master-detail"
    >
      {!embeddedInShell ? (
        <>
          <div className="sor-banner">
            <strong>Это очередь источников, не approval product media.</strong>
          </div>
          <header className="sor-header">
            <h1>Source media orphan review (QA)</h1>
            <p>
              {payload.audit_variant} · queue {stats.total_queue_rows}
            </p>
          </header>
        </>
      ) : (
        <div className="media-ops-inbox-subheader">
          <span className="media-ops-inbox-chip">Очередь сирот</span>
          <span className="media-ops-inbox-meta">
            P0: {stats.p0_count} · в очереди: {stats.total_queue_rows}
          </span>
        </div>
      )}

      {embeddedInShell ? (
        <div className="media-ops-source-banner" data-media-ops-source-hints>
          <strong>Источники:</strong> прайс-лист = identity · Яндекс = файлы (нужен local mirror) ·
          legacy site = evidence. Operable: CLP, Oliver, Provence.
        </div>
      ) : null}

      <div className="sor-toolbar" data-media-ops-orphan-filters>
        <label>
          Tier
          <select value={tier} onChange={(e) => setTier(e.target.value as TierFilter)}>
            <option value="P0_review_first">P0</option>
            <option value="P1_white_bg_sku">P1</option>
            <option value="all">Все</option>
          </select>
        </label>
        <label>
          Search
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="basename / SKU"
          />
        </label>
        <label className="sor-toolbar-check">
          <input
            type="checkbox"
            checked={crossSkuOnly}
            onChange={(e) => setCrossSkuOnly(e.target.checked)}
          />
          Только cross-SKU risk
        </label>
        {!embeddedInShell ? (
          <>
            <button type="button" className="primary" onClick={handleCopy}>
              Copy JSON
            </button>
            <button type="button" onClick={handleDownload}>
              Download JSON
            </button>
            {exportMsg ? <span>{exportMsg}</span> : null}
          </>
        ) : null}
      </div>

      <div className="sor-footer">
        {filtered.length} в фильтре · {decisionCounts.pending ?? 0} pending
      </div>

      <div className="media-ops-orphan-master-detail">
        <aside className="media-ops-orphan-list" data-media-ops-orphan-list>
          {filtered.slice(0, 200).map((row) => (
            <button
              key={row.source_id}
              type="button"
              className={`media-ops-orphan-list-item${row.source_id === activeRow?.source_id ? " active" : ""}${row.cross_sku_risk ? " risk" : ""}`}
              onClick={() => onSelectSourceId?.(row.source_id)}
            >
              <span className="media-ops-orphan-list-name">{row.basename}</span>
              <span className="media-ops-orphan-list-meta">
                {row.sku_guess || "—"}
                {isYandexUnmirrored(row) ? " · нет mirror" : ""}
              </span>
            </button>
          ))}
        </aside>

        {activeRow ? (
          <>
            <div className="media-ops-orphan-preview">
              <div className="sor-thumb media-ops-orphan-preview-img">
                {activeRow.preview_url ? (
                  <img src={activeRow.preview_url} alt="" />
                ) : (
                  <span>No preview</span>
                )}
              </div>
              <h3>{activeRow.basename}</h3>
              <p className="sor-meta">
                {activeRow.source_kind}
                {isYandexUnmirrored(activeRow) ? (
                  <span className="media-ops-warn-chip"> Яндекс без local mirror — не assignable</span>
                ) : null}
              </p>
              <p className="sor-meta">
                SKU: {activeRow.sku_guess || "—"} · handle: {activeRow.handle_guess || "—"}
              </p>
              {gateMsg ? <p className="media-ops-gate-warn">{gateMsg}</p> : null}
              <details className="sor-details" open={false}>
                <summary>Почему не safe ▾</summary>
                <p className="sor-why">{activeRow.why_not_safe}</p>
                <p className="sor-precheck">{activeRow.enrichment.precheck_summary}</p>
              </details>
              <div className="media-ops-orphan-nav">
                <button type="button" onClick={() => stepRow(-1)}>
                  ← Prev
                </button>
                <button type="button" onClick={() => stepRow(1)}>
                  Next →
                </button>
              </div>
            </div>

            <div className="sor-actions media-ops-orphan-actions" data-media-ops-orphan-decisions>
              <button
                type="button"
                className="primary"
                disabled={!canRouteToAssign(activeRow)}
                data-orphan-decision="map_candidate"
                data-primary="true"
                onClick={() => goAssign(activeRow)}
              >
                → В Assign
              </button>
              {DECISION_BUTTONS.filter((b) => !b.primary).map(({ decision, label, danger }) => (
                <button
                  key={decision}
                  type="button"
                  className={[
                    activeRow.operator_decision === decision ? "active" : "",
                    danger ? "danger" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  data-orphan-decision={decision}
                  onClick={() => setDecision(activeRow.source_id, decision)}
                >
                  {label}
                </button>
              ))}
              <textarea
                className="sor-notes"
                placeholder="Notes"
                value={activeRow.operator_notes}
                onChange={(e) => setNotes(activeRow.source_id, e.target.value)}
              />
              {activeRow.enrichment.sku_context.assignment_board_url ? (
                <p className="sor-meta">
                  <Link href={activeRow.enrichment.sku_context.assignment_board_url}>
                    Open assign for {activeRow.enrichment.sku_context.handle}
                  </Link>
                </p>
              ) : null}
            </div>
          </>
        ) : (
          <p>Нет строк в очереди для выбранного фильтра.</p>
        )}
      </div>
    </div>
  )
}
