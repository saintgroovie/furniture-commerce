"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { computeReadiness, validateRow } from "./matrix-board-validation"
import type {
  DecisionFilter,
  MatrixBootstrap,
  MatrixRow,
  RowValidation,
} from "./matrix-board-types"

const API = "/qa/willie-winkie-flow-a-matrix-board/api"

const TODO = "TODO_OPERATOR"

function isFilled(value: string | undefined | null): boolean {
  const v = (value ?? "").trim()
  return v.length > 0 && v !== TODO
}

function decisionLabel(d: string): string {
  if (d === "approve" || d === "hold" || d === "reject") return d
  return "—"
}

function RowChecklist({ row, validation }: { row: MatrixRow; validation: RowValidation }) {
  const checks = [
    {
      label: "Workbook mapping",
      ok: isFilled(row.workbook_row_key) && isFilled(row.workbook_product_code),
    },
    {
      label: "Painting name",
      ok: isFilled(row.painting_name),
    },
    {
      label: "Product type",
      ok: isFilled(row.medusa_product_type),
    },
    {
      label: "Variant strategy",
      ok: isFilled(row.variant_strategy),
    },
    {
      label: "Price (RUB)",
      ok: isFilled(row.price_rub),
    },
    {
      label: "Status",
      ok: isFilled(row.status_draft_or_published),
    },
    {
      label: "Operator decision",
      ok: isFilled(row.operator_decision),
    },
    {
      label: "Row ready for approve",
      ok: validation.is_complete_for_approve,
    },
  ]

  return (
    <fieldset className="wwmx-fieldset">
      <legend>Что нужно заполнить</legend>
      <ul className="wwmx-checklist">
        {checks.map((c) => (
          <li key={c.label}>
            <span className={`wwmx-check-icon ${c.ok ? "ok" : "no"}`}>{c.ok ? "✓" : "○"}</span>
            <span>
              {c.label}: {c.ok ? "заполнено" : "не заполнено"}
            </span>
          </li>
        ))}
      </ul>
      {validation.is_complete_for_approve ? (
        <div className="wwmx-approve-verdict can">Можно approve — все обязательные поля валидны.</div>
      ) : (
        <div className="wwmx-approve-verdict cannot">
          Нельзя approve
          {validation.missing_fields.length > 0 && (
            <ul>
              {validation.missing_fields.map((f) => (
                <li key={f}>нет: {f}</li>
              ))}
            </ul>
          )}
          {validation.errors.length > 0 && (
            <ul>
              {validation.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </fieldset>
  )
}

function RowEditor({
  row,
  validation,
  onChange,
}: {
  row: MatrixRow
  validation: RowValidation
  onChange: (patch: Partial<MatrixRow>) => void
}) {
  const missing = new Set(validation.missing_fields)
  const fieldClass = (name: string) => (missing.has(name) ? "wwmx-field invalid" : "wwmx-field")

  return (
    <div className="wwmx-card">
      <h2>{row.handle}</h2>

      <fieldset className="wwmx-fieldset">
        <legend>Идентичность (только чтение)</legend>
        <dl className="wwmx-identity-grid">
          <div>
            <dt>Handle</dt>
            <dd>{row.handle}</dd>
          </div>
          <div>
            <dt>Painting prefix</dt>
            <dd>{row.painting_prefix}</dd>
          </div>
          <div>
            <dt>Legacy title</dt>
            <dd>{row.legacy_title}</dd>
          </div>
          <div>
            <dt>Legacy collection hint</dt>
            <dd>{row.legacy_collection_hint || "—"}</dd>
          </div>
          <div>
            <dt>Proposed Medusa collection</dt>
            <dd>{row.proposed_medusa_collection}</dd>
          </div>
          <div>
            <dt>Proposed category</dt>
            <dd>{row.proposed_category}</dd>
          </div>
          <div>
            <dt>Legacy CS-Cart product id</dt>
            <dd>{row.legacy_cs_cart_product_id}</dd>
          </div>
          <div>
            <dt>Flow A media count</dt>
            <dd>{(row.media_filenames || []).length}</dd>
          </div>
        </dl>
      </fieldset>

      <fieldset className="wwmx-fieldset">
        <legend>Media preview (Flow A)</legend>
        <div className="wwmx-media-grid">
          {(row.media_filenames || []).map((fname, i) => {
            const url = row.media_preview_urls?.[i]
            return (
              <div key={fname} className="wwmx-media-card">
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer">
                    <img
                      src={url}
                      alt={fname}
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).style.display = "none"
                      }}
                    />
                  </a>
                ) : (
                  <div
                    style={{
                      width: 120,
                      height: 120,
                      background: "#1a222c",
                      borderRadius: 6,
                      border: "1px solid #3a4a5a",
                    }}
                  />
                )}
                <div className="fname">{fname}</div>
              </div>
            )
          })}
          {(row.media_filenames || []).length === 0 && (
            <span style={{ color: "#8a9aaa" }}>Нет файлов Flow A</span>
          )}
        </div>
      </fieldset>

      <fieldset className="wwmx-fieldset">
        <legend>Обязательные бизнес-поля</legend>
        <div className="wwmx-form-grid">
          <div className={fieldClass("workbook_row_key")}>
            <label>
              workbook_row_key <span className="req">*</span>
            </label>
            <input
              value={row.workbook_row_key}
              onChange={(e) => onChange({ workbook_row_key: e.target.value })}
            />
          </div>
          <div className={fieldClass("workbook_product_code")}>
            <label>
              workbook_product_code <span className="req">*</span>
            </label>
            <input
              value={row.workbook_product_code}
              onChange={(e) => onChange({ workbook_product_code: e.target.value })}
            />
          </div>
          <div className={fieldClass("painting_name")}>
            <label>
              painting_name <span className="req">*</span>
            </label>
            <input
              value={row.painting_name}
              onChange={(e) => onChange({ painting_name: e.target.value })}
            />
          </div>
          <div className={fieldClass("medusa_product_type")}>
            <label>
              medusa_product_type <span className="req">*</span>
            </label>
            <select
              value={row.medusa_product_type || ""}
              onChange={(e) =>
                onChange({
                  medusa_product_type: e.target.value as MatrixRow["medusa_product_type"],
                })
              }
            >
              <option value="">— выберите —</option>
              <option value={TODO}>{TODO}</option>
              <option value="STANDARD">STANDARD</option>
              <option value="CONFIGURABLE">CONFIGURABLE</option>
              <option value="BESPOKE">BESPOKE</option>
            </select>
          </div>
          <div className={fieldClass("variant_strategy")}>
            <label>
              variant_strategy <span className="req">*</span>
            </label>
            <select
              value={row.variant_strategy || ""}
              onChange={(e) =>
                onChange({
                  variant_strategy: e.target.value as MatrixRow["variant_strategy"],
                })
              }
            >
              <option value="">— выберите —</option>
              <option value={TODO}>{TODO}</option>
              <option value="single_default">single_default</option>
              <option value="configurable_tiers">configurable_tiers</option>
            </select>
          </div>
          <div className={fieldClass("price_rub")}>
            <label>
              price_rub <span className="req">*</span>
            </label>
            <input
              value={row.price_rub}
              onChange={(e) => onChange({ price_rub: e.target.value })}
              inputMode="decimal"
            />
          </div>
          <div className={fieldClass("status_draft_or_published")}>
            <label>
              status_draft_or_published <span className="req">*</span>
            </label>
            <select
              value={row.status_draft_or_published || ""}
              onChange={(e) =>
                onChange({
                  status_draft_or_published: e.target
                    .value as MatrixRow["status_draft_or_published"],
                })
              }
            >
              <option value="">— выберите —</option>
              <option value={TODO}>{TODO}</option>
              <option value="draft">draft</option>
              <option value="published">published</option>
            </select>
          </div>
          <div className={fieldClass("operator_decision")}>
            <label>
              operator_decision <span className="req">*</span>
            </label>
            <select
              value={row.operator_decision || ""}
              onChange={(e) =>
                onChange({
                  operator_decision: e.target.value as MatrixRow["operator_decision"],
                })
              }
            >
              <option value="">— выберите —</option>
              <option value={TODO}>{TODO}</option>
              <option value="hold">hold</option>
              <option value="approve">approve</option>
              <option value="reject">reject</option>
            </select>
          </div>
          <div className="wwmx-field">
            <label>operator_notes</label>
            <textarea
              value={row.operator_notes}
              onChange={(e) => onChange({ operator_notes: e.target.value })}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="wwmx-fieldset">
        <legend>Опционально</legend>
        <div className="wwmx-form-grid">
          <div className="wwmx-field">
            <label>compare_at_price_rub</label>
            <input
              value={row.compare_at_price_rub}
              onChange={(e) => onChange({ compare_at_price_rub: e.target.value })}
              inputMode="decimal"
            />
          </div>
        </div>
      </fieldset>

      <RowChecklist row={row} validation={validation} />
    </div>
  )
}

export function MatrixBoardClient() {
  const [rows, setRows] = useState<MatrixRow[]>([])
  const [meta, setMeta] = useState<MatrixBootstrap | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState("")
  const [filter, setFilter] = useState<DecisionFilter>("all")
  const [prefixFilter, setPrefixFilter] = useState("all")
  const [collectionFilter, setCollectionFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [activeHandle, setActiveHandle] = useState<string | null>(null)
  const [bulkType, setBulkType] = useState("CONFIGURABLE")
  const [bulkStatus, setBulkStatus] = useState("draft")
  const [bulkVariant, setBulkVariant] = useState("single_default")

  const load = useCallback(() => {
    fetch(`${API}/bootstrap`, { signal: AbortSignal.timeout(60000) })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text())
        return res.json() as Promise<MatrixBootstrap>
      })
      .then((data) => {
        setMeta(data)
        setRows(data.rows)
        setError(null)
        if (data.rows.length > 0) {
          setActiveHandle((prev) => prev ?? data.rows[0].handle)
        }
      })
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const readiness = useMemo(() => computeReadiness(rows), [rows])
  const validations = useMemo(() => new Map(rows.map((r) => [r.handle, validateRow(r)])), [rows])

  const prefixes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.painting_prefix))).sort(),
    [rows]
  )
  const collections = useMemo(
    () => Array.from(new Set(rows.map((r) => r.proposed_medusa_collection))).sort(),
    [rows]
  )

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const v = validations.get(row.handle)!
      if (prefixFilter !== "all" && row.painting_prefix !== prefixFilter) return false
      if (collectionFilter !== "all" && row.proposed_medusa_collection !== collectionFilter)
        return false
      if (filter === "approve" && row.operator_decision !== "approve") return false
      if (filter === "hold" && row.operator_decision !== "hold") return false
      if (filter === "reject" && row.operator_decision !== "reject") return false
      if (filter === "missing" && v.missing_fields.length === 0) return false
      if (filter === "ready" && !v.is_complete_for_approve) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        if (
          !row.handle.includes(q) &&
          !row.legacy_title.toLowerCase().includes(q) &&
          !row.painting_prefix.toLowerCase().includes(q)
        )
          return false
      }
      return true
    })
  }, [rows, filter, prefixFilter, collectionFilter, search, validations])

  useEffect(() => {
    if (filtered.length === 0) return
    if (!activeHandle || !filtered.some((r) => r.handle === activeHandle)) {
      setActiveHandle(filtered[0].handle)
    }
  }, [filtered, activeHandle])

  const activeRow = useMemo(
    () => rows.find((r) => r.handle === activeHandle) ?? null,
    [rows, activeHandle]
  )
  const activeValidation = activeRow ? validations.get(activeRow.handle) : null

  const updateRow = (handle: string, patch: Partial<MatrixRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.handle === handle ? { ...r, ...patch, ingestion_allowed: "no" } : r))
    )
  }

  const toggleSelect = (handle: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(handle)) next.delete(handle)
      else next.add(handle)
      return next
    })
  }

  const applyToSelected = (patch: Partial<MatrixRow>) => {
    if (selected.size === 0) {
      setMsg("Сначала отметьте строки чекбоксом слева")
      return
    }
    setRows((prev) =>
      prev.map((r) =>
        selected.has(r.handle) ? { ...r, ...patch, ingestion_allowed: "no" } : r
      )
    )
    setMsg(`Обновлено строк: ${selected.size}`)
  }

  const save = async () => {
    setMsg("Сохранение…")
    const res = await fetch(`${API}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    })
    const data = await res.json()
    if (!res.ok) {
      setMsg(`Ошибка сохранения: ${data.error || res.status}`)
      return
    }
    setMsg(
      `Сохранено CSV + readiness (${data.readiness?.mandatory_filled_cells}/${data.readiness?.mandatory_total_cells} обязательных ячеек)`
    )
  }

  const copyJson = async () => {
    const res = await fetch(`${API}/export/json`)
    const data = await res.json()
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    setMsg("JSON скопирован в буфер")
  }

  const downloadCsv = () => {
    window.open(`${API}/export/csv`, "_blank")
  }

  const downloadReadiness = () => {
    window.open(`${API}/readiness`, "_blank")
  }

  const highlightReady = () => {
    const ready = rows.filter((r) => validateRow(r).is_complete_for_approve).map((r) => r.handle)
    setSelected(new Set(ready))
    setMsg(`Выбрано готовых строк: ${ready.length} — approve не ставится автоматически`)
  }

  if (error) {
    return (
      <div className="wwmx-err">
        <p>Не удалось загрузить matrix board.</p>
        <pre>{error}</pre>
        <button type="button" onClick={load}>
          Повторить
        </button>
      </div>
    )
  }

  if (!meta) return <div className="wwmx-msg">Загрузка 28 строк…</div>

  return (
    <>
      <div className="wwmx-banner">
        Это business/catalog matrix. Не seed, не import, не media apply.
      </div>

      <div className="wwmx-instructions">
        <strong>Как работать:</strong> 1. Выбери товар слева. 2. Заполни поля справа. 3. Если
        данных нет — ставь hold. 4. Approve только когда есть workbook mapping, цена, тип, статус и
        стратегия. 5. Save filled CSV. Seed/import отдельно, не здесь.
      </div>

      <header className="wwmx-header">
        <h1>Willie Winkie Flow A — Matrix Board</h1>
        <div className="wwmx-stats">
          <span className="wwmx-stat">
            Строк: <strong>{rows.length}</strong>
          </span>
          <span className="wwmx-stat">
            Готово: <strong>{readiness.rows_ready_for_approve}</strong>
          </span>
          <span className="wwmx-stat">
            approve: <strong>{readiness.approve_count}</strong>
          </span>
          <span className="wwmx-stat">
            hold: <strong>{readiness.hold_count}</strong>
          </span>
          <span className="wwmx-stat">
            reject: <strong>{readiness.reject_count}</strong>
          </span>
          <span className="wwmx-stat">
            Пропусков: <strong>{readiness.mandatory_total_cells - readiness.mandatory_filled_cells}</strong>
          </span>
          <span className="wwmx-stat">
            blocked: <strong>{readiness.rows_blocked}</strong>
          </span>
        </div>
      </header>

      <div className={`wwmx-readiness ${readiness.seed_draft_allowed_later ? "ok" : ""}`}>
        <strong>Seed draft allowed later:</strong>{" "}
        {readiness.seed_draft_allowed_later ? "yes" : "no"} — {readiness.reason}
      </div>

      <div className="wwmx-filters">
        <input
          placeholder="Поиск: handle / title / prefix"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value as DecisionFilter)}>
          <option value="all">Все строки</option>
          <option value="missing">С пропусками</option>
          <option value="ready">Готовы к approve</option>
          <option value="approve">approve</option>
          <option value="hold">hold</option>
          <option value="reject">reject</option>
        </select>
        <select value={prefixFilter} onChange={(e) => setPrefixFilter(e.target.value)}>
          <option value="all">Все prefix</option>
          {prefixes.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={collectionFilter} onChange={(e) => setCollectionFilter(e.target.value)}>
          <option value="all">Все collection</option>
          {collections.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button type="button" onClick={highlightReady}>
          Выбрать готовые
        </button>
      </div>

      <div className="wwmx-bulk">
        <span>Batch для отмеченных ({selected.size}):</span>
        <select value={bulkType} onChange={(e) => setBulkType(e.target.value)}>
          <option value="STANDARD">STANDARD</option>
          <option value="CONFIGURABLE">CONFIGURABLE</option>
          <option value="BESPOKE">BESPOKE</option>
        </select>
        <button
          type="button"
          onClick={() =>
            applyToSelected({ medusa_product_type: bulkType as MatrixRow["medusa_product_type"] })
          }
        >
          Тип
        </button>
        <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
          <option value="draft">draft</option>
          <option value="published">published</option>
        </select>
        <button
          type="button"
          onClick={() =>
            applyToSelected({
              status_draft_or_published: bulkStatus as MatrixRow["status_draft_or_published"],
            })
          }
        >
          Статус
        </button>
        <select value={bulkVariant} onChange={(e) => setBulkVariant(e.target.value)}>
          <option value="single_default">single_default</option>
          <option value="configurable_tiers">configurable_tiers</option>
        </select>
        <button
          type="button"
          onClick={() =>
            applyToSelected({ variant_strategy: bulkVariant as MatrixRow["variant_strategy"] })
          }
        >
          Variant
        </button>
        <button type="button" onClick={() => applyToSelected({ operator_decision: "hold" })}>
          hold
        </button>
      </div>

      <div className="wwmx-body">
        <aside className="wwmx-list-pane">
          {filtered.map((row) => {
            const v = validations.get(row.handle)!
            const isActive = row.handle === activeHandle
            const decision = decisionLabel(row.operator_decision)
            return (
              <button
                key={row.handle}
                type="button"
                className={[
                  "wwmx-list-item",
                  isActive ? "active" : "",
                  v.is_complete_for_approve ? "ready" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setActiveHandle(row.handle)}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    checked={selected.has(row.handle)}
                    onClick={(e) => toggleSelect(row.handle, e)}
                    onChange={() => {}}
                    aria-label={`Select ${row.handle}`}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="wwmx-list-handle">{row.handle}</div>
                    <div className="wwmx-list-title">{row.legacy_title}</div>
                    <div className="wwmx-list-meta">
                      <span>{row.painting_prefix}</span>
                      <span>·</span>
                      <span>{row.proposed_medusa_collection}</span>
                      <span>·</span>
                      <span>{row.proposed_category}</span>
                      <span>·</span>
                      <span>media: {(row.media_filenames || []).length}</span>
                    </div>
                    <div className="wwmx-list-meta" style={{ marginTop: 6 }}>
                      {v.missing_fields.length > 0 && (
                        <span className="wwmx-badge missing">пропусков: {v.missing_fields.length}</span>
                      )}
                      {v.is_complete_for_approve && (
                        <span className="wwmx-badge ready">готово</span>
                      )}
                      {decision !== "—" && (
                        <span className={`wwmx-badge decision-${decision}`}>{decision}</span>
                      )}
                      {isFilled(row.price_rub) && <span>₽{row.price_rub}</span>}
                      {isFilled(row.status_draft_or_published) && (
                        <span>{row.status_draft_or_published}</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
          {filtered.length === 0 && (
            <div className="wwmx-editor-empty">Нет строк по текущему фильтру</div>
          )}
        </aside>

        <main className="wwmx-editor-pane">
          {activeRow && activeValidation ? (
            <RowEditor
              row={activeRow}
              validation={activeValidation}
              onChange={(patch) => updateRow(activeRow.handle, patch)}
            />
          ) : (
            <div className="wwmx-editor-empty">Выберите товар слева</div>
          )}
        </main>
      </div>

      <div className="wwmx-save-bar">
        {msg && <div className="wwmx-msg">{msg}</div>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="primary" onClick={save}>
            Save filled CSV
          </button>
          <button type="button" onClick={downloadCsv}>
            Download CSV
          </button>
          <button type="button" onClick={copyJson}>
            Copy JSON
          </button>
          <button type="button" onClick={downloadReadiness}>
            Readiness JSON
          </button>
        </div>
      </div>
    </>
  )
}
