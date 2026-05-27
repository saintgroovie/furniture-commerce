"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  autoRoleLabel,
  DUPLICATE_OPTIONS,
  OPERATOR_ROLES,
  WORKFLOW_FILTERS,
  type WorkflowFilter,
} from "./approval-board-constants"
import { autoguessLabel, guessOperatorRole } from "./approval-board-role-autoguess"
import {
  buildExportPayload,
  copyExportToClipboard,
  downloadExportJson,
} from "./approval-board-export"
import { ProductIdentityBlock } from "./approval-board-identity-ui"
import { wwApproveGuard } from "./approval-board-ww-triage"
import { candidatePreviewSrc, poolMediaPreviewSrc } from "./approval-board-preview"
import {
  clearBoardState,
  formatSavedAt,
  isDecision,
  isDuplicateStatus,
  isOperatorRole,
  loadBoardState,
  saveBoardState,
} from "./approval-board-persistence"
import type {
  ChecklistItem,
  ChecklistPayload,
  DecisionFilter,
  DesignerDecision,
  DuplicateStatus,
  OperatorRole,
  PersistedItemState,
  SkuPoolContext,
} from "./approval-board-types"

const API_BASE = "/qa/legacy-site-media-approval-board/api"

function countByDecision(items: ChecklistItem[]) {
  const c = { approve: 0, reject: 0, needs_review: 0, pending: 0 }
  for (const i of items) {
    if (i.designer_decision in c) c[i.designer_decision as keyof typeof c] += 1
  }
  return c
}

function normalizeFn(name: string) {
  return name.toLowerCase().split("?")[0]
}

function mergePersisted(list: ChecklistItem[]): ChecklistItem[] {
  const persisted = loadBoardState()
  if (!persisted) {
    return list.map((i) => ({
      ...i,
      operator_role: i.operator_role ?? null,
      operator_duplicate_status: i.operator_duplicate_status ?? "unchecked",
      operator_duplicate_note: i.operator_duplicate_note ?? "",
    }))
  }
  return list.map((item) => {
    const p = persisted.decisions[item.candidate_id]
    if (!p) {
      return {
        ...item,
        operator_role: item.operator_role ?? null,
        operator_duplicate_status: item.operator_duplicate_status ?? "unchecked",
        operator_duplicate_note: item.operator_duplicate_note ?? "",
      }
    }
    return {
      ...item,
      designer_decision: isDecision(p.designer_decision) ? p.designer_decision : item.designer_decision,
      notes: p.notes ?? item.notes,
      operator_role: isOperatorRole(p.operator_role) ? p.operator_role : item.operator_role ?? null,
      operator_duplicate_status: isDuplicateStatus(p.operator_duplicate_status)
        ? p.operator_duplicate_status
        : item.operator_duplicate_status ?? "unchecked",
      operator_duplicate_note: p.operator_duplicate_note ?? "",
    }
  })
}

function toPersistMap(items: ChecklistItem[]): Record<string, PersistedItemState> {
  const m: Record<string, PersistedItemState> = {}
  for (const i of items) {
    m[i.candidate_id] = {
      designer_decision: i.designer_decision,
      notes: i.notes ?? "",
      operator_role: i.operator_role ?? null,
      operator_duplicate_status: i.operator_duplicate_status ?? "unchecked",
      operator_duplicate_note: i.operator_duplicate_note ?? "",
    }
  }
  return m
}

function matchesWorkflow(item: ChecklistItem, wf: WorkflowFilter): boolean {
  if (wf === "all") return true
  if (wf === "approved_without_role") {
    return item.designer_decision === "approve" && !item.operator_role
  }
  if (wf === "needs_duplicate_check") {
    return (
      !item.operator_duplicate_status ||
      item.operator_duplicate_status === "unchecked" ||
      item.operator_duplicate_status === "possible_duplicate"
    )
  }
  if (wf === "needs_role") {
    return item.designer_decision !== "reject" && !item.operator_role
  }
  return true
}

function PoolStrip({ ctx }: { ctx: SkuPoolContext | undefined }) {
  if (!ctx) return null
  if (!ctx.has_reference_media) {
    return (
      <div className="ab-pool-warn">
        Нет текущего пула для сравнения — дубль проверить нельзя, approve только по уверенности в товаре.
      </div>
    )
  }
  return (
    <div className="ab-pool-strip">
      <div className="ab-pool-label">Текущий пул / existing media</div>
      <div className="ab-pool-scroll">
        {ctx.existing_media.map((ref) => {
          const src = poolMediaPreviewSrc(ref)
          return (
            <div key={ref.id} className="ab-pool-thumb" title={ref.filename || ref.label}>
              {src ? (
                <img src={src} alt={ref.filename || ref.label} loading="lazy" />
              ) : (
                <div className="ab-pool-placeholder">{ref.filename?.slice(0, 12) || "—"}</div>
              )}
              <span className="ab-pool-cap">{ref.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CandidateCard({
  item,
  ctx,
  onPatch,
  onCompare,
}: {
  item: ChecklistItem
  ctx: SkuPoolContext | undefined
  onPatch: (id: string, patch: Partial<ChecklistItem>) => void
  onCompare: (item: ChecklistItem) => void
}) {
  const dup = item.operator_duplicate_status || "unchecked"
  const filenameDup =
    ctx?.existing_media?.some((m) => m.filename && normalizeFn(m.filename) === normalizeFn(item.filename)) ??
    false
  const roleGuess = guessOperatorRole(item)
  const hasOperatorRole = Boolean(item.operator_role)

  return (
    <article className="ab-card" data-decision={item.designer_decision} data-dup={dup}>
      <button type="button" className="ab-card-img-btn" onClick={() => onCompare(item)}>
        <img className="ab-card-img" src={candidatePreviewSrc(item)} alt={item.filename} loading="lazy" />
      </button>
      <div className="ab-card-body">
        <ProductIdentityBlock ctx={ctx} handle={item.handle} item={item} compact />
        <div className="ab-filename">{item.filename}</div>
        <div className="ab-meta">
          <div className="ab-auto-role">авто-роль: {autoRoleLabel(item.role_guess)}</div>
          <div className="ab-role-autoguess">
            авто-догадка: {autoRoleLabel(roleGuess.auto_role_guess)} · {autoguessLabel(roleGuess.auto_role_confidence)}{" "}
            <span className="ab-role-reason" title={roleGuess.auto_role_reason}>
              ({roleGuess.auto_role_reason})
            </span>
          </div>
          {!hasOperatorRole ? (
            <div className="ab-role-hint">Автодогадка не заменяет выбор оператора.</div>
          ) : item.operator_role !== roleGuess.auto_role_guess ? (
            <div className="ab-role-hint ab-role-override">оператор переопределил автодогадку</div>
          ) : null}
          {filenameDup ? <div className="ab-dup-hint">⚠ имя файла совпадает с existing</div> : null}
          {item.designer_decision === "approve" && !item.operator_role ? (
            <div className="ab-warn">Роль не назначена — supplement будет менее полезен.</div>
          ) : null}
          {(() => {
            const g = wwApproveGuard(item, ctx)
            if (g.warning && item.designer_decision === "approve") {
              return <div className="ab-warn ab-ww-warn ab-ww-info">{g.warning}</div>
            }
            if (!g.ok && item.designer_decision === "approve") {
              return <div className="ab-warn ab-ww-warn">{g.reason}</div>
            }
            return null
          })()}
        </div>

        <div className="ab-section-label">Роль (оператор)</div>
        <div className="ab-chips">
          {OPERATOR_ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              className="ab-chip"
              data-active={item.operator_role === r.id}
              data-suggested={!hasOperatorRole && roleGuess.auto_role_guess === r.id}
              onClick={() => onPatch(item.candidate_id, { operator_role: r.id })}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="ab-section-label">Дубль</div>
        <div className="ab-chips ab-chips-dup">
          {DUPLICATE_OPTIONS.map((d) => (
            <button
              key={d.id}
              type="button"
              className="ab-chip"
              data-active={dup === d.id}
              onClick={() => {
                const patch: Partial<ChecklistItem> = { operator_duplicate_status: d.id }
                if (d.id === "duplicate_reject" && item.designer_decision === "pending") {
                  patch.designer_decision = "reject"
                }
                if (d.id === "possible_duplicate" && item.designer_decision === "pending") {
                  patch.designer_decision = "needs_review"
                }
                if (d.id === "not_duplicate" && item.designer_decision === "pending") {
                  /* no auto approve */
                }
                onPatch(item.candidate_id, patch)
              }}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="ab-section-label">Решение supplement</div>
        <div className="ab-actions">
          <button
            type="button"
            className="approve"
            data-active={item.designer_decision === "approve"}
            onClick={() => {
              const guard = wwApproveGuard(item, ctx)
              if (!guard.ok) {
                const note = guard.reason ? `[WW] ${guard.reason}` : "[WW] Needs review"
                onPatch(item.candidate_id, {
                  designer_decision: "needs_review",
                  notes: item.notes?.includes("[WW]") ? item.notes : [item.notes, note].filter(Boolean).join("\n"),
                })
                return
              }
              onPatch(item.candidate_id, { designer_decision: "approve" })
            }}
          >
            Approve
          </button>
          <button
            type="button"
            className="reject"
            data-active={item.designer_decision === "reject"}
            onClick={() => onPatch(item.candidate_id, { designer_decision: "reject" })}
          >
            Reject
          </button>
          <button
            type="button"
            className="review"
            data-active={item.designer_decision === "needs_review"}
            onClick={() => onPatch(item.candidate_id, { designer_decision: "needs_review" })}
          >
            Needs review
          </button>
          <button
            type="button"
            data-active={item.designer_decision === "pending"}
            onClick={() => onPatch(item.candidate_id, { designer_decision: "pending" })}
          >
            Pending
          </button>
        </div>
        <textarea
          className="ab-notes"
          placeholder="Заметки (optional)"
          value={item.notes}
          onChange={(e) => onPatch(item.candidate_id, { notes: e.target.value })}
        />
      </div>
    </article>
  )
}

export function LegacySiteMediaApprovalBoardClient() {
  const [base, setBase] = useState<ChecklistPayload | null>(null)
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [contexts, setContexts] = useState<Record<string, SkuPoolContext>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>("all")
  const [workflowFilter, setWorkflowFilter] = useState<WorkflowFilter>("all")
  const [collectionFilter, setCollectionFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [copyStatus, setCopyStatus] = useState<"idle" | "ok" | "err">("idle")
  const [confirmReset, setConfirmReset] = useState(false)
  const [compareItem, setCompareItem] = useState<ChecklistItem | null>(null)

  const persistAll = useCallback((next: ChecklistItem[]) => {
    const at = saveBoardState(toPersistMap(next))
    setSavedAt(at)
  }, [])

  const patchItem = useCallback(
    (id: string, patch: Partial<ChecklistItem>) => {
      setItems((prev) => {
        const next = prev.map((i) => (i.candidate_id === id ? { ...i, ...patch } : i))
        persistAll(next)
        return next
      })
    },
    [persistAll]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [clRes, ctxRes] = await Promise.all([
          fetch(`${API_BASE}/checklist`),
          fetch(`${API_BASE}/sku-context`),
        ])
        const data = (await clRes.json()) as ChecklistPayload & { error?: string; hint?: string }
        if (!clRes.ok) {
          setLoadError(data.hint || data.error || `HTTP ${clRes.status}`)
          return
        }
        const ctxData = ctxRes.ok
          ? ((await ctxRes.json()) as { contexts: Record<string, SkuPoolContext> })
          : { contexts: {} }
        if (cancelled) return
        const merged = mergePersisted(data.items || []).map((item) => {
          const ctx = ctxData.contexts?.[item.handle]
          return {
            ...item,
            product_title_source: ctx?.product_identity_source ?? item.product_title_source ?? null,
            product_identity_source: ctx?.product_identity_source ?? item.product_identity_source ?? null,
            motif_source: ctx?.motif_source ?? item.motif_source ?? null,
          }
        })
        setBase(data)
        setItems(merged)
        setContexts(ctxData.contexts || {})
        const p = loadBoardState()
        if (p) setSavedAt(p.savedAt)
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
  }, [])

  const counts = useMemo(() => countByDecision(items), [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((i) => {
      if (decisionFilter !== "all" && i.designer_decision !== decisionFilter) return false
      if (!matchesWorkflow(i, workflowFilter)) return false
      if (collectionFilter !== "all" && i.collection !== collectionFilter) return false
      if (!q) return true
      return `${i.filename} ${i.handle} ${i.source_page}`.toLowerCase().includes(q)
    })
  }, [items, decisionFilter, workflowFilter, collectionFilter, search])

  const groups = useMemo(() => {
    const map = new Map<string, ChecklistItem[]>()
    for (const item of filtered) {
      const h = item.handle || "_unknown"
      if (!map.has(h)) map.set(h, [])
      map.get(h)!.push(item)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  const collections = useMemo(
    () => Array.from(new Set(items.map((i) => i.collection).filter(Boolean))).sort(),
    [items]
  )

  const exportInput = useMemo(
    () => (base ? { base, items, contexts } : null),
    [base, items, contexts]
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
      setItems(
        (base.items || []).map((i) => ({
          ...i,
          designer_decision: "pending",
          notes: "",
          operator_role: null,
          operator_duplicate_status: "unchecked",
          operator_duplicate_note: "",
        }))
      )
    }
  }

  if (loading) return <div className="ab-empty">Загрузка supplement triage board…</div>

  if (loadError || !base) {
    return (
      <div className="ab-empty">
        <h2>Approval pack not found</h2>
        <p>{loadError || "Build pack under tmp/legacy-site-media-approval-pack."}</p>
      </div>
    )
  }

  const compareCtx = compareItem ? contexts[compareItem.handle] : undefined

  return (
    <div className="ab-shell">
      <aside className="ab-sidebar">
        <h1 className="ab-title">Разбор legacy-site кандидатов</h1>
        <p className="ab-subtitle">
          Supplement triage · не просто approve/reject
          <br />
          <b>проверить дубль → назначить роль → approve</b>
          <br />
          Reject — неверный SKU / дубль / мусор. Сомнения → Needs review.
        </p>
        <div className="ab-ww-guide">
          <b>Willie Winkie:</b> коллекция одна; <b>Ant&apos;s Village</b>, <b>Ballet</b> и др. — это{" "}
          <b>роспись / мотив (подколлекция)</b>, не отдельная коллекция. Строка 1: SKU + тип (комод, стол…).
          Строка 2: Willie Winkie + роспись + гл. Approve только если тип и мотив совпадают с SKU и фото;
          расхождение мотива при той же форме → Needs review / Reject.
        </div>
        <div className="ab-stat">
          <span>Всего</span>
          <strong>{items.length}</strong>
        </div>
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
        <hr className="ab-hr" />
        <div className="ab-side-label">Workflow</div>
        {WORKFLOW_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className="ab-filter-btn"
            data-active={workflowFilter === f.id}
            onClick={() => setWorkflowFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
        <hr className="ab-hr" />
        <div className="ab-side-label">Решение</div>
        {(["all", "pending", "approve", "reject", "needs_review"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className="ab-filter-btn"
            data-active={decisionFilter === f}
            onClick={() => setDecisionFilter(f)}
          >
            {f}
          </button>
        ))}
        <label className="ab-side-label">Collection</label>
        <select value={collectionFilter} onChange={(e) => setCollectionFilter(e.target.value)} className="ab-select">
          <option value="all">All</option>
          {collections.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="ab-side-label">Search</label>
        <input className="ab-search" value={search} onChange={(e) => setSearch(e.target.value)} />
      </aside>

      <div className="ab-main">
        <div className="ab-toolbar">
          <span style={{ color: savedAt ? "var(--ab-approve)" : "var(--ab-muted)" }}>
            {savedAt ? `💾 ${formatSavedAt(savedAt)}` : "○ localStorage"}
          </span>
          <span className="ab-toolbar-meta">
            {groups.length} SKU · {filtered.length} cards
          </span>
          <button type="button" className="primary" onClick={handleCopy}>
            {copyStatus === "ok" ? "Copied!" : copyStatus === "err" ? "Copy failed" : "Copy JSON"}
          </button>
          <button type="button" className="primary" onClick={handleDownload}>
            Download JSON
          </button>
          <button type="button" className="danger" onClick={handleReset}>
            {confirmReset ? "Confirm reset?" : "Reset board"}
          </button>
        </div>

        <div className="ab-groups-wrap">
          {groups.map(([handle, groupItems]) => {
            const ctx = contexts[handle]
            const gc = countByDecision(groupItems)
            const roles = groupItems.filter((i) => i.operator_role).length
            return (
              <section key={handle} className="ab-product-group" data-handle={handle}>
                <header className="ab-group-header">
                  <div className="ab-group-header-main">
                    <ProductIdentityBlock ctx={ctx} handle={handle} />
                  </div>
                  <div className="ab-group-stats">
                    <span>{groupItems.length} кандидатов</span>
                    <span>
                      ✓{gc.approve} ✗{gc.reject} ?{gc.needs_review} ○{gc.pending}
                    </span>
                    <span>ролей: {roles}</span>
                  </div>
                </header>
                <PoolStrip ctx={ctx} />
                <div className="ab-grid">
                  {groupItems.map((item) => (
                    <CandidateCard
                      key={item.candidate_id}
                      item={item}
                      ctx={ctx}
                      onPatch={patchItem}
                      onCompare={setCompareItem}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>

      {compareItem ? (
        <div className="ab-modal" role="dialog" aria-modal="true">
          <div className="ab-modal-inner">
            <button type="button" className="ab-modal-close" onClick={() => setCompareItem(null)}>
              ✕
            </button>
            <h3>Сравнение · {compareItem.handle}</h3>
            <ProductIdentityBlock ctx={compareCtx} handle={compareItem.handle} item={compareItem} />
            <div className="ab-compare-row">
              <div>
                <div className="ab-compare-label">Кандидат (new)</div>
                <img
                  className="ab-compare-img"
                  src={candidatePreviewSrc(compareItem)}
                  alt={compareItem.filename}
                />
                <div>{compareItem.filename}</div>
              </div>
              <div className="ab-compare-pool">
                <div className="ab-compare-label">Existing pool</div>
                <PoolStrip ctx={compareCtx} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
