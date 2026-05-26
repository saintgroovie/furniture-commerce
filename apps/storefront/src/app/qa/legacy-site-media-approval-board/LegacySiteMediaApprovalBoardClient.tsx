"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type {
  ChecklistItem,
  ChecklistPayload,
  DecisionFilter,
  DesignerDecision,
} from "./approval-board-types"
import {
  buildExportPayload,
  copyExportToClipboard,
  downloadExportJson,
} from "./approval-board-export"
import {
  clearBoardState,
  formatSavedAt,
  isDecision,
  loadBoardState,
  saveBoardState,
} from "./approval-board-persistence"

const API_BASE = "/qa/legacy-site-media-approval-board/api"

function previewSrc(item: ChecklistItem): string {
  if (item.local_preview) {
    return `${API_BASE}/preview?path=${encodeURIComponent(item.local_preview)}`
  }
  return `${API_BASE}/preview?url=${encodeURIComponent(item.url)}`
}

function countByDecision(items: ChecklistItem[]) {
  const c = { approve: 0, reject: 0, needs_review: 0, pending: 0 }
  for (const i of items) {
    if (i.designer_decision in c) c[i.designer_decision as keyof typeof c] += 1
  }
  return c
}

export function LegacySiteMediaApprovalBoardClient() {
  const [base, setBase] = useState<ChecklistPayload | null>(null)
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>("all")
  const [collectionFilter, setCollectionFilter] = useState<string>("all")
  const [roleFilter, setRoleFilter] = useState<string>("all")
  const [colorFilter, setColorFilter] = useState<string>("all")
  const [handleFilter, setHandleFilter] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [copyStatus, setCopyStatus] = useState<"idle" | "ok" | "err">("idle")
  const [confirmReset, setConfirmReset] = useState(false)

  const applyPersisted = useCallback((list: ChecklistItem[]) => {
    const persisted = loadBoardState()
    if (!persisted) return list
    setSavedAt(persisted.savedAt)
    return list.map((item) => {
      const p = persisted.decisions[item.candidate_id]
      if (!p) return item
      return {
        ...item,
        designer_decision: isDecision(p.designer_decision) ? p.designer_decision : item.designer_decision,
        notes: p.notes ?? item.notes,
      }
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`${API_BASE}/checklist`)
        const data = (await res.json()) as ChecklistPayload & { error?: string; hint?: string }
        if (!res.ok) {
          setLoadError(data.hint || data.error || `HTTP ${res.status}`)
          return
        }
        if (cancelled) return
        const merged = applyPersisted(data.items || [])
        setBase(data)
        setItems(merged)
        setLoadError(null)
      } catch (e) {
        setLoadError(String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [applyPersisted])

  const persist = useCallback((next: ChecklistItem[]) => {
    const decisions: Record<string, { designer_decision: DesignerDecision; notes: string }> = {}
    for (const i of next) {
      decisions[i.candidate_id] = {
        designer_decision: i.designer_decision,
        notes: i.notes ?? "",
      }
    }
    const at = saveBoardState(decisions)
    setSavedAt(at)
  }, [])

  const setDecision = useCallback(
    (id: string, decision: DesignerDecision) => {
      setItems((prev) => {
        const next = prev.map((i) =>
          i.candidate_id === id ? { ...i, designer_decision: decision } : i
        )
        persist(next)
        return next
      })
    },
    [persist]
  )

  const setNotes = useCallback(
    (id: string, notes: string) => {
      setItems((prev) => {
        const next = prev.map((i) => (i.candidate_id === id ? { ...i, notes } : i))
        persist(next)
        return next
      })
    },
    [persist]
  )

  const counts = useMemo(() => countByDecision(items), [items])

  const collections = useMemo(
    () => Array.from(new Set(items.map((i) => i.collection).filter(Boolean))).sort(),
    [items]
  )
  const handles = useMemo(
    () => Array.from(new Set(items.map((i) => i.handle).filter(Boolean))).sort(),
    [items]
  )
  const roles = useMemo(
    () => Array.from(new Set(items.map((i) => i.role_guess).filter(Boolean))).sort(),
    [items]
  )
  const colors = useMemo(
    () => Array.from(new Set(items.map((i) => i.color_guess).filter(Boolean))).sort(),
    [items]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((i) => {
      if (decisionFilter !== "all" && i.designer_decision !== decisionFilter) return false
      if (collectionFilter !== "all" && i.collection !== collectionFilter) return false
      if (handleFilter !== "all" && i.handle !== handleFilter) return false
      if (roleFilter !== "all" && i.role_guess !== roleFilter) return false
      if (colorFilter !== "all" && i.color_guess !== colorFilter) return false
      if (!q) return true
      const hay = `${i.filename} ${i.handle} ${i.source_page} ${i.candidate_id}`.toLowerCase()
      return hay.includes(q)
    })
  }, [items, decisionFilter, collectionFilter, handleFilter, roleFilter, colorFilter, search])

  const exportInput = useMemo(
    () => (base ? { base, items } : null),
    [base, items]
  )

  async function handleCopy() {
    if (!exportInput) return
    const ok = await copyExportToClipboard(exportInput)
    setCopyStatus(ok ? "ok" : "err")
    setTimeout(() => setCopyStatus("idle"), 2000)
  }

  function handleDownload() {
    if (!exportInput) return
    downloadExportJson(exportInput)
  }

  function handleReset() {
    if (!confirmReset) {
      setConfirmReset(true)
      setTimeout(() => setConfirmReset(false), 4000)
      return
    }
    clearBoardState()
    setSavedAt(null)
    setConfirmReset(false)
    if (base) {
      const reset = (base.items || []).map((i) => ({
        ...i,
        designer_decision: "pending" as const,
        notes: "",
      }))
      setItems(reset)
    }
  }

  if (loading) {
    return <div className="ab-empty">Загрузка approval pack…</div>
  }

  if (loadError || !base) {
    return (
      <div className="ab-empty">
        <h2>Approval pack not found</h2>
        <p>{loadError || "Build it first from tmp/legacy-site-media-approval-pack."}</p>
        <p style={{ fontSize: 11, marginTop: 12 }}>
          Ожидается: <code>tmp/legacy-site-media-approval-pack/designer-approval-checklist.json</code>
        </p>
      </div>
    )
  }

  return (
    <div className="ab-shell">
      <aside className="ab-sidebar">
        <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Legacy site media</h2>
        <p style={{ margin: "0 0 12px", color: "var(--ab-muted)", fontSize: 11 }}>
          {items.length} candidates · dev-only
        </p>
        <div className="ab-stat">
          <span>Approved</span>
          <strong style={{ color: "var(--ab-approve)" }}>{counts.approve}</strong>
        </div>
        <div className="ab-stat">
          <span>Rejected</span>
          <strong style={{ color: "var(--ab-reject)" }}>{counts.reject}</strong>
        </div>
        <div className="ab-stat">
          <span>Needs review</span>
          <strong style={{ color: "var(--ab-review)" }}>{counts.needs_review}</strong>
        </div>
        <div className="ab-stat">
          <span>Pending</span>
          <strong>{counts.pending}</strong>
        </div>
        <hr style={{ margin: "12px 0", border: "none", borderTop: "1px solid var(--ab-border)" }} />
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Decision filter</div>
        {(["all", "pending", "approve", "reject", "needs_review"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className="ab-filter-btn"
            data-active={decisionFilter === f}
            onClick={() => setDecisionFilter(f)}
          >
            {f} {f !== "all" ? `(${counts[f as keyof typeof counts] ?? 0})` : ""}
          </button>
        ))}
        <hr style={{ margin: "12px 0", border: "none", borderTop: "1px solid var(--ab-border)" }} />
        <label style={{ display: "block", fontSize: 11, marginBottom: 4 }}>Collection</label>
        <select
          value={collectionFilter}
          onChange={(e) => setCollectionFilter(e.target.value)}
          style={{ width: "100%", marginBottom: 8 }}
        >
          <option value="all">All</option>
          {collections.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label style={{ display: "block", fontSize: 11, marginBottom: 4 }}>Handle / SKU</label>
        <select
          value={handleFilter}
          onChange={(e) => setHandleFilter(e.target.value)}
          style={{ width: "100%", marginBottom: 8 }}
        >
          <option value="all">All</option>
          {handles.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <label style={{ display: "block", fontSize: 11, marginBottom: 4 }}>Role</label>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          style={{ width: "100%", marginBottom: 8 }}
        >
          <option value="all">All</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <label style={{ display: "block", fontSize: 11, marginBottom: 4 }}>Color</label>
        <select
          value={colorFilter}
          onChange={(e) => setColorFilter(e.target.value)}
          style={{ width: "100%", marginBottom: 8 }}
        >
          <option value="all">All</option>
          {colors.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label style={{ display: "block", fontSize: 11, marginBottom: 4 }}>Search</label>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="filename, handle, URL…"
          style={{ width: "100%" }}
        />
      </aside>

      <div className="ab-main">
        <div className="ab-toolbar">
          <span style={{ color: savedAt ? "var(--ab-approve)" : "var(--ab-muted)" }}>
            {savedAt ? `💾 ${formatSavedAt(savedAt)}` : "○ Не сохранено в localStorage"}
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ color: "var(--ab-muted)" }}>
            Showing {filtered.length} / {items.length}
          </span>
          <button type="button" className="primary" onClick={handleCopy}>
            {copyStatus === "ok" ? "Copied!" : copyStatus === "err" ? "Copy failed" : "Copy JSON"}
          </button>
          <button type="button" className="primary" onClick={handleDownload}>
            Download JSON
          </button>
          <button type="button" className="danger" onClick={handleReset}>
            {confirmReset ? "Confirm reset?" : "Reset board state"}
          </button>
        </div>

        <div className="ab-grid-wrap">
          {filtered.length === 0 ? (
            <div className="ab-empty">Нет кандидатов по текущим фильтрам.</div>
          ) : (
            <div className="ab-grid">
              {filtered.map((item) => (
                <article
                  key={item.candidate_id}
                  className="ab-card"
                  data-decision={item.designer_decision}
                >
                  <img
                    className="ab-card-img"
                    src={previewSrc(item)}
                    alt={item.filename}
                    loading="lazy"
                  />
                  <div className="ab-card-body">
                    <div className="ab-filename">{item.filename}</div>
                    <div className="ab-meta">
                      <div>
                        <b>{item.handle}</b> · {item.collection}
                      </div>
                      <div>
                        role: {item.role_guess} · color: {item.color_guess} · conf: {item.confidence}
                      </div>
                      <div>
                        <a href={item.source_page} target="_blank" rel="noreferrer">
                          PDP
                        </a>{" "}
                        · <span style={{ wordBreak: "break-all" }}>{item.candidate_id}</span>
                      </div>
                    </div>
                    <div className="ab-actions">
                      <button
                        type="button"
                        className="approve"
                        data-active={item.designer_decision === "approve"}
                        onClick={() => setDecision(item.candidate_id, "approve")}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="reject"
                        data-active={item.designer_decision === "reject"}
                        onClick={() => setDecision(item.candidate_id, "reject")}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className="review"
                        data-active={item.designer_decision === "needs_review"}
                        onClick={() => setDecision(item.candidate_id, "needs_review")}
                      >
                        Review
                      </button>
                      <button
                        type="button"
                        data-active={item.designer_decision === "pending"}
                        onClick={() => setDecision(item.candidate_id, "pending")}
                      >
                        Pending
                      </button>
                    </div>
                    <textarea
                      className="ab-notes"
                      placeholder="Notes (optional)"
                      value={item.notes}
                      onChange={(e) => setNotes(item.candidate_id, e.target.value)}
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
