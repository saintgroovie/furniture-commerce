"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { candidateToRowPatch, sourceFieldsFromCandidate } from "./matrix-candidate-patch"
import {
  countStillMissingMandatoryCells,
  formatBulkSummary,
  planBulkCandidateApply,
  type BulkCandidateMode,
} from "./matrix-bulk-candidates"
import { TIER_LABELS } from "./matrix-tier-policy"
import { sanitizeMediaUrlForBrowser } from "./matrix-media-urls"
import { computeRowWorkflowState, ROW_STATE_LABELS } from "./matrix-row-state"
import { computeReadiness, validateRow } from "./matrix-board-validation"
import type {
  CandidatesPayload,
  DecisionFilter,
  FieldSource,
  HandleCandidates,
  MatrixBootstrap,
  MatrixRow,
  RowFieldSources,
  RowValidation,
  WorkbookCandidate,
} from "./matrix-board-types"

const API = "/qa/willie-winkie-flow-a-matrix-board/api"
const TODO = "TODO_OPERATOR"

const FIELD_LABELS: Partial<Record<keyof MatrixRow, string>> = {
  workbook_row_key: "Ключ строки workbook",
  workbook_product_code: "Код продукта workbook",
  painting_name: "Название росписи",
  medusa_product_type: "Тип продукта Medusa",
  variant_strategy: "Стратегия вариантов",
  price_rub: "Workbook base price (справочно)",
  solid_full_price_rub: "Tier: полностью массив",
  solid_front_ldsp_body_price_rub: "Tier: фронты массив + ЛДСП",
  solid_full_sku_suffix: "SKU suffix (solid_full)",
  solid_front_ldsp_body_sku_suffix: "SKU suffix (LDSP tier)",
  tier_notes: "Заметки по tier",
  status_draft_or_published: "Статус публикации",
  operator_decision: "Решение оператора",
  operator_notes: "Заметки оператора",
  compare_at_price_rub: "Старая цена, ₽",
}

function isFilled(value: string | undefined | null): boolean {
  const v = (value ?? "").trim()
  return v.length > 0 && v !== TODO
}

function confidenceLabel(c: string): string {
  if (c === "exact") return "точное"
  if (c === "likely") return "вероятное"
  return "слабое"
}

function MediaPreviewItem({
  fname,
  previewUrl,
  openUrl,
}: {
  fname: string
  previewUrl?: string
  openUrl?: string
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const thumbSrc = previewUrl ? sanitizeMediaUrlForBrowser(previewUrl) : null
  const linkHref = openUrl
    ? sanitizeMediaUrlForBrowser(openUrl)
    : thumbSrc

  return (
    <div className="wwmx-media-card">
      {thumbSrc && !imgFailed ? (
        <img
          src={thumbSrc}
          alt={fname}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="wwmx-media-placeholder" />
      )}
      <div className="fname">{fname}</div>
      {linkHref && (
        <a className="wwmx-media-open" href={linkHref} target="_blank" rel="noreferrer">
          Open image
        </a>
      )}
      {imgFailed && (
        <p className="wwmx-media-down-note">
          Backend static server not running; file exists locally but preview unavailable.
        </p>
      )}
    </div>
  )
}

function FieldLabel({
  field,
  required,
  source,
}: {
  field: keyof MatrixRow
  required?: boolean
  source?: FieldSource
}) {
  return (
    <label>
      {FIELD_LABELS[field] || field}
      {required && <span className="req"> *</span>}
      {source === "source" && <span className="wwmx-src-badge">из workbook</span>}
      {source === "manual" && <span className="wwmx-src-badge manual">вручную</span>}
    </label>
  )
}

function CandidatePanel({
  handleCandidates,
  onUse,
  onNoSource,
}: {
  handleCandidates: HandleCandidates | null
  onUse: (c: WorkbookCandidate) => void
  onNoSource: () => void
}) {
  if (!handleCandidates) {
    return <div className="wwmx-candidate-empty">Загрузка кандидатов workbook…</div>
  }

  if (!handleCandidates.has_workbook_source || handleCandidates.candidates.length === 0) {
    return (
      <fieldset className="wwmx-fieldset wwmw-candidates">
        <legend>Источник / workbook candidates</legend>
        <div className="wwmx-candidate-empty">
          <strong>No workbook candidate — keep HOLD</strong>
          <p>Для этого handle нет строки в parsed workbook. Оставьте hold и заполните вручную позже.</p>
          <button type="button" className="wwmx-cand-btn secondary" onClick={onNoSource}>
            Mark as no source / hold
          </button>
        </div>
      </fieldset>
    )
  }

  return (
    <fieldset className="wwmx-fieldset wwmw-candidates">
      <legend>Источник / workbook candidates</legend>
      <p className="wwmx-candidate-hint">
        Сначала выбери workbook candidate. Потом проверь тип/цену/статус. Потом ставь approve или hold.
      </p>
      <div className="wwmx-candidate-list">
        {handleCandidates.candidates.map((c) => (
          <div key={c.candidate_id} className={`wwmx-candidate-card conf-${c.confidence}`}>
            <div className="wwmx-candidate-head">
              <span className={`wwmx-badge conf-${c.confidence}`}>{confidenceLabel(c.confidence)}</span>
              <strong>{c.workbook_product_code}</strong>
            </div>
            <div className="wwmx-candidate-title">{c.candidate_title}</div>
            <dl className="wwmx-candidate-meta">
              <div>
                <dt>Лист</dt>
                <dd>{c.source_sheet}</dd>
              </div>
              <div>
                <dt>Row key</dt>
                <dd>{c.workbook_row_key}</dd>
              </div>
              {c.painting_name && (
                <div>
                  <dt>Роспись</dt>
                  <dd>{c.painting_name}</dd>
                </div>
              )}
              {c.category && (
                <div>
                  <dt>Категория</dt>
                  <dd>
                    {c.category_raw || c.category}
                  </dd>
                </div>
              )}
              {c.workbook_base_price_rub != null && (
                <div>
                  <dt>Workbook base price</dt>
                  <dd>{c.workbook_base_price_rub.toLocaleString("ru-RU")} rub</dd>
                </div>
              )}
              {c.tier_source_note && (
                <div>
                  <dt>Tier source</dt>
                  <dd>{c.tier_source_note}</dd>
                </div>
              )}
              {c.tier_split_in_source && c.tier_source_prices && (
                <>
                  <div>
                    <dt>Tier solid_full (source)</dt>
                    <dd>
                      {c.tier_source_prices.solid_full_price_rub?.toLocaleString("ru-RU") ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Tier LDSP (source)</dt>
                    <dd>
                      {c.tier_source_prices.solid_front_ldsp_body_price_rub?.toLocaleString(
                        "ru-RU"
                      ) ?? "—"}
                    </dd>
                  </div>
                </>
              )}
              {c.price != null && (
                <div>
                  <dt>Цена</dt>
                  <dd>
                    {c.price.toLocaleString("ru-RU")} {c.currency || "rub"}
                  </dd>
                </div>
              )}
            </dl>
            <div className="wwmx-why-matched">
              <strong>Почему совпало:</strong>
              <ul>
                {c.why_matched.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
            <button type="button" className="wwmx-cand-btn primary" onClick={() => onUse(c)}>
              Use this candidate
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="wwmx-cand-btn secondary" onClick={onNoSource}>
        Mark as no source / hold
      </button>
    </fieldset>
  )
}

function RowChecklist({ row, validation }: { row: MatrixRow; validation: RowValidation }) {
  const isConfigurable = row.medusa_product_type === "CONFIGURABLE"
  const checks = [
    {
      label: "Workbook mapping",
      ok: isFilled(row.workbook_row_key) && isFilled(row.workbook_product_code),
    },
    { label: "Painting name", ok: isFilled(row.painting_name) },
    { label: "Product type", ok: isFilled(row.medusa_product_type) },
    {
      label: "Variant strategy (configurable_tiers)",
      ok: isFilled(row.variant_strategy) && (!isConfigurable || row.variant_strategy === "configurable_tiers"),
    },
    ...(isConfigurable
      ? [
          { label: TIER_LABELS.solid_full, ok: isFilled(row.solid_full_price_rub) },
          {
            label: TIER_LABELS.solid_front_ldsp_body,
            ok: isFilled(row.solid_front_ldsp_body_price_rub),
          },
        ]
      : [{ label: "Price (RUB)", ok: isFilled(row.price_rub) }]),
    { label: "Workbook reference price", ok: isFilled(row.price_rub) },
    { label: "Status", ok: isFilled(row.status_draft_or_published) },
    { label: "Operator decision", ok: isFilled(row.operator_decision) },
    { label: "Row ready for approve", ok: validation.is_complete_for_approve },
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
          {isConfigurable && (
            <p className="wwmx-tier-warn">
              Для CONFIGURABLE нужны обе tier-цены (полностью массив &gt; фронты массив + ЛДСП) и
              variant_strategy=configurable_tiers. Workbook price_rub — только справочник.
            </p>
          )}
          {validation.missing_fields.length > 0 && (
            <ul>
              {validation.missing_fields.map((f) => (
                <li key={f}>нет: {FIELD_LABELS[f as keyof MatrixRow] || f}</li>
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
  fieldSources,
  handleCandidates,
  onChange,
  onFieldManual,
  onUseCandidate,
  onNoSource,
}: {
  row: MatrixRow
  validation: RowValidation
  fieldSources: RowFieldSources
  handleCandidates: HandleCandidates | null
  onChange: (patch: Partial<MatrixRow>) => void
  onFieldManual: (field: keyof MatrixRow) => void
  onUseCandidate: (c: WorkbookCandidate) => void
  onNoSource: () => void
}) {
  const missing = new Set(validation.missing_fields)
  const fieldClass = (name: string) => (missing.has(name) ? "wwmx-field invalid" : "wwmx-field")
  const workflowState = computeRowWorkflowState(row, validation)

  const manual = (field: keyof MatrixRow, patch: Partial<MatrixRow>) => {
    onFieldManual(field)
    onChange(patch)
  }

  return (
    <div className="wwmx-card">
      <div className="wwmx-editor-head">
        <h2>{row.handle}</h2>
        <span className={`wwmx-state-badge state-${workflowState}`}>
          {ROW_STATE_LABELS[workflowState]}
        </span>
      </div>

      <CandidatePanel
        handleCandidates={handleCandidates}
        onUse={onUseCandidate}
        onNoSource={onNoSource}
      />

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
          {(row.media_filenames || []).map((fname, i) => (
            <MediaPreviewItem
              key={fname}
              fname={fname}
              previewUrl={row.media_preview_urls?.[i]}
              openUrl={row.media_open_urls?.[i]}
            />
          ))}
          {(row.media_filenames || []).length === 0 && (
            <span className="wwmx-muted">Нет файлов Flow A</span>
          )}
        </div>
      </fieldset>

      <fieldset className="wwmx-fieldset">
        <legend>Бизнес-поля (можно править после выбора candidate)</legend>
        <div className="wwmx-form-grid">
          <div className={fieldClass("workbook_row_key")}>
            <FieldLabel field="workbook_row_key" required source={fieldSources.workbook_row_key} />
            <input
              placeholder="Нужно выбрать workbook row"
              value={row.workbook_row_key === TODO ? "" : row.workbook_row_key}
              onChange={(e) => manual("workbook_row_key", { workbook_row_key: e.target.value })}
            />
          </div>
          <div className={fieldClass("workbook_product_code")}>
            <FieldLabel
              field="workbook_product_code"
              required
              source={fieldSources.workbook_product_code}
            />
            <input
              placeholder="Нужно выбрать workbook row"
              value={row.workbook_product_code === TODO ? "" : row.workbook_product_code}
              onChange={(e) =>
                manual("workbook_product_code", { workbook_product_code: e.target.value })
              }
            />
          </div>
          <div className={fieldClass("painting_name")}>
            <FieldLabel field="painting_name" required source={fieldSources.painting_name} />
            <input
              placeholder="Из prefix / workbook candidate"
              value={row.painting_name === TODO ? "" : row.painting_name}
              onChange={(e) => manual("painting_name", { painting_name: e.target.value })}
            />
          </div>
          <div className={fieldClass("medusa_product_type")}>
            <FieldLabel field="medusa_product_type" required source={fieldSources.medusa_product_type} />
            <select
              value={row.medusa_product_type || ""}
              onChange={(e) =>
                manual("medusa_product_type", {
                  medusa_product_type: e.target.value as MatrixRow["medusa_product_type"],
                })
              }
            >
              <option value="">Выбери STANDARD / CONFIGURABLE / BESPOKE</option>
              <option value="STANDARD">STANDARD</option>
              <option value="CONFIGURABLE">CONFIGURABLE</option>
              <option value="BESPOKE">BESPOKE</option>
            </select>
          </div>
          <fieldset className="wwmx-fieldset wwmx-tier-block">
            <legend>Варианты исполнения / цены</legend>
            <p className="wwmx-tier-hint">
              Это цена из workbook/source; нужно подтвердить, к какому tier она относится, или
              заполнить обе tier-цены вручную. Approve нельзя, пока обе tier-цены не заполнены.
            </p>
            <div className={fieldClass("variant_strategy")}>
              <FieldLabel field="variant_strategy" required source={fieldSources.variant_strategy} />
              <select
                value={row.variant_strategy || ""}
                onChange={(e) =>
                  manual("variant_strategy", {
                    variant_strategy: e.target.value as MatrixRow["variant_strategy"],
                  })
                }
              >
                <option value="">Выбери стратегию</option>
                <option value="configurable_tiers">configurable_tiers (Willie Winkie)</option>
                <option value="single_default">single_default (не рекомендуется для WW)</option>
              </select>
            </div>
            <div className={fieldClass("price_rub")}>
              <FieldLabel field="price_rub" required source={fieldSources.price_rub} />
              <input
                placeholder="Из workbook candidate (справочно)"
                value={row.price_rub === TODO ? "" : row.price_rub}
                onChange={(e) => manual("price_rub", { price_rub: e.target.value })}
                inputMode="decimal"
              />
              <span className="wwmx-field-note">workbook_base_price_rub — справочно, не tier price</span>
            </div>
            <div className={fieldClass("solid_full_price_rub")}>
              <FieldLabel
                field="solid_full_price_rub"
                required
                source={fieldSources.solid_full_price_rub}
              />
              <input
                placeholder={TIER_LABELS.solid_full}
                value={row.solid_full_price_rub === TODO ? "" : row.solid_full_price_rub}
                onChange={(e) =>
                  manual("solid_full_price_rub", { solid_full_price_rub: e.target.value })
                }
                inputMode="decimal"
              />
            </div>
            <div className={fieldClass("solid_front_ldsp_body_price_rub")}>
              <FieldLabel
                field="solid_front_ldsp_body_price_rub"
                required
                source={fieldSources.solid_front_ldsp_body_price_rub}
              />
              <input
                placeholder={TIER_LABELS.solid_front_ldsp_body}
                value={
                  row.solid_front_ldsp_body_price_rub === TODO
                    ? ""
                    : row.solid_front_ldsp_body_price_rub
                }
                onChange={(e) =>
                  manual("solid_front_ldsp_body_price_rub", {
                    solid_front_ldsp_body_price_rub: e.target.value,
                  })
                }
                inputMode="decimal"
              />
            </div>
            <div className="wwmx-field">
              <FieldLabel field="solid_full_sku_suffix" source={fieldSources.solid_full_sku_suffix} />
              <input
                placeholder="опционально, напр. _solid_full"
                value={row.solid_full_sku_suffix || ""}
                onChange={(e) =>
                  manual("solid_full_sku_suffix", { solid_full_sku_suffix: e.target.value })
                }
              />
            </div>
            <div className="wwmx-field">
              <FieldLabel
                field="solid_front_ldsp_body_sku_suffix"
                source={fieldSources.solid_front_ldsp_body_sku_suffix}
              />
              <input
                placeholder="опционально, напр. _ldsp_body"
                value={row.solid_front_ldsp_body_sku_suffix || ""}
                onChange={(e) =>
                  manual("solid_front_ldsp_body_sku_suffix", {
                    solid_front_ldsp_body_sku_suffix: e.target.value,
                  })
                }
              />
            </div>
            <div className="wwmx-field">
              <FieldLabel field="tier_notes" source={fieldSources.tier_notes} />
              <textarea
                placeholder="Tier policy / operator notes"
                value={row.tier_notes || ""}
                onChange={(e) => manual("tier_notes", { tier_notes: e.target.value })}
              />
            </div>
          </fieldset>
          <div className={fieldClass("status_draft_or_published")}>
            <FieldLabel
              field="status_draft_or_published"
              required
              source={fieldSources.status_draft_or_published}
            />
            <select
              value={row.status_draft_or_published || ""}
              onChange={(e) =>
                manual("status_draft_or_published", {
                  status_draft_or_published: e.target
                    .value as MatrixRow["status_draft_or_published"],
                })
              }
            >
              <option value="">draft или published</option>
              <option value="draft">draft</option>
              <option value="published">published</option>
            </select>
          </div>
          <div className={fieldClass("operator_decision")}>
            <FieldLabel field="operator_decision" required source={fieldSources.operator_decision} />
            <select
              value={row.operator_decision || ""}
              onChange={(e) =>
                manual("operator_decision", {
                  operator_decision: e.target.value as MatrixRow["operator_decision"],
                })
              }
            >
              <option value="">hold пока не заполнено</option>
              <option value="hold">hold</option>
              <option value="approve">approve</option>
              <option value="reject">reject</option>
            </select>
          </div>
          <div className="wwmx-field">
            <FieldLabel field="operator_notes" source={fieldSources.operator_notes} />
            <textarea
              placeholder="Причина hold/reject или уточнения"
              value={row.operator_notes}
              onChange={(e) => manual("operator_notes", { operator_notes: e.target.value })}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="wwmx-fieldset">
        <legend>Опционально</legend>
        <div className="wwmx-form-grid">
          <div className="wwmx-field">
            <FieldLabel field="compare_at_price_rub" source={fieldSources.compare_at_price_rub} />
            <input
              placeholder="Старая цена, если есть"
              value={row.compare_at_price_rub}
              onChange={(e) =>
                manual("compare_at_price_rub", { compare_at_price_rub: e.target.value })
              }
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
  const [candidatesByHandle, setCandidatesByHandle] = useState<Map<string, HandleCandidates>>(
    new Map()
  )
  const [fieldSourcesByHandle, setFieldSourcesByHandle] = useState<Map<string, RowFieldSources>>(
    new Map()
  )
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
  const [bulkVariant, setBulkVariant] = useState("configurable_tiers")
  const [bulkSummary, setBulkSummary] = useState<string | null>(null)

  const load = useCallback(() => {
    Promise.all([
      fetch(`${API}/bootstrap`, { signal: AbortSignal.timeout(60000) }).then(async (res) => {
        if (!res.ok) throw new Error(await res.text())
        return res.json() as Promise<MatrixBootstrap>
      }),
      fetch(`${API}/candidates`, { signal: AbortSignal.timeout(60000) }).then(async (res) => {
        if (!res.ok) throw new Error(`candidates: ${await res.text()}`)
        return res.json() as Promise<CandidatesPayload>
      }),
    ])
      .then(([data, candidates]) => {
        setMeta(data)
        setRows(data.rows)
        setCandidatesByHandle(new Map(candidates.by_handle.map((h) => [h.handle, h])))
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
  const activeCandidates = activeHandle ? candidatesByHandle.get(activeHandle) ?? null : null
  const activeFieldSources = activeHandle
    ? fieldSourcesByHandle.get(activeHandle) ?? {}
    : {}

  const updateRow = (handle: string, patch: Partial<MatrixRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.handle === handle ? { ...r, ...patch, ingestion_allowed: "no" } : r))
    )
  }

  const markFieldManual = (handle: string, field: keyof MatrixRow) => {
    setFieldSourcesByHandle((prev) => {
      const next = new Map(prev)
      const cur = { ...(next.get(handle) || {}) }
      cur[field] = "manual"
      next.set(handle, cur)
      return next
    })
  }

  const useCandidate = (handle: string, candidate: WorkbookCandidate) => {
    const patch = candidateToRowPatch(candidate)
    const sources = sourceFieldsFromCandidate(candidate)
    setFieldSourcesByHandle((prev) => {
      const next = new Map(prev)
      const cur: RowFieldSources = { ...(next.get(handle) || {}) }
      for (const f of sources) cur[f] = "source"
      next.set(handle, cur)
      return next
    })
    updateRow(handle, {
      ...patch,
      operator_decision: "hold",
      operator_notes: rowNoteForCandidate(candidate),
    })
    setMsg(`Candidate применён для ${handle} — decision=hold, проверьте тип/статус`)
  }

  const rowNoteForCandidate = (c: WorkbookCandidate) =>
    `source: ${c.source_sheet}:${c.workbook_row_key} ${c.workbook_product_code}`

  const markNoSource = (handle: string) => {
    updateRow(handle, {
      operator_decision: "hold",
      operator_notes: "no workbook candidate — operator hold",
    })
    setMsg(`${handle}: hold — нет подходящего workbook source`)
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

  const applyBulkCandidates = (mode: BulkCandidateMode, scope: "selected" | "all") => {
    const targetHandles =
      scope === "all" ? rows.map((r) => r.handle) : Array.from(selected)

    if (targetHandles.length === 0) {
      setMsg("Сначала отметьте строки чекбоксом слева")
      return
    }

    let overwriteManual = false
    if (mode === "likely") {
      const ok = window.confirm(
        `Применить likely-кандидатов к ${targetHandles.length} строкам? Approve не будет поставлен.`
      )
      if (!ok) return
      overwriteManual = window.confirm(
        "Перезаписать поля, которые уже заполнены вручную? (Отмена = пропустить такие поля)"
      )
    }

    const rowsByHandle = new Map(rows.map((r) => [r.handle, r]))
    const plan = planBulkCandidateApply({
      targetHandles,
      rowsByHandle,
      candidatesByHandle,
      fieldSourcesByHandle,
      mode,
      overwriteManual,
    })

    const nextRows = rows.map((row) => {
      const item = plan.rows.find((p) => p.handle === row.handle && p.kind === "apply")
      if (!item || item.kind !== "apply") return row
      return { ...row, ...item.patch }
    })

    setFieldSourcesByHandle((prev) => {
      const next = new Map(prev)
      for (const item of plan.rows) {
        if (item.kind !== "apply") continue
        const cur: RowFieldSources = { ...(next.get(item.handle) || {}) }
        for (const f of item.sourceFields) cur[f] = "source"
        next.set(item.handle, cur)
      }
      return next
    })

    setRows(nextRows)
    const stillMissing = countStillMissingMandatoryCells(nextRows)
    const summary = formatBulkSummary(plan, stillMissing)
    setBulkSummary(summary)
    setMsg(summary)
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

  const handlesWithCandidates = useMemo(
    () => Array.from(candidatesByHandle.values()).filter((h) => h.candidates.length > 0).length,
    [candidatesByHandle]
  )

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

  if (!meta) return <div className="wwmx-msg">Загрузка 28 строк и workbook candidates…</div>

  return (
    <>
      <div className="wwmx-banner">
        Канонический operator route для Willie Winkie Flow A matrix (workbook candidates + bulk fill).
        Не seed, не import, не media apply.
      </div>

      <div className="wwmx-instructions">
        <strong>Как работать:</strong> 1. Выбери товар слева. 2. Выбери workbook candidate справа.
        3. Проверь тип, variant, статус. 4. Approve только когда всё заполнено. 5. Save filled CSV.
        Seed/import отдельно.
      </div>

      <header className="wwmx-header">
        <h1>Willie Winkie Flow A — Matrix Board</h1>
        <div className="wwmx-stats">
          <span className="wwmx-stat">
            Строк: <strong>{rows.length}</strong>
          </span>
          <span className="wwmx-stat">
            С candidates: <strong>{handlesWithCandidates}</strong>
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
            Пропусков:{" "}
            <strong>{readiness.mandatory_total_cells - readiness.mandatory_filled_cells}</strong>
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
        <span>Workbook candidates (без approve):</span>
        <button type="button" onClick={() => applyBulkCandidates("exact", "selected")}>
          Use exact candidates for selected
        </button>
        <button type="button" onClick={() => applyBulkCandidates("exact", "all")}>
          Use exact candidates for all
        </button>
        <button type="button" onClick={() => applyBulkCandidates("likely", "selected")}>
          Use likely candidates for selected
        </button>
      </div>

      {bulkSummary && <div className="wwmx-bulk-summary">{bulkSummary}</div>}

      <div className="wwmx-bulk">
        <span>Batch для отмеченных ({selected.size}) — без approve/price/mapping:</span>
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
            const workflowState = computeRowWorkflowState(row, v)
            const topCand = candidatesByHandle.get(row.handle)?.candidates[0]
            return (
              <button
                key={row.handle}
                type="button"
                className={["wwmx-list-item", isActive ? "active" : "", workflowState === "ready_to_approve" || workflowState === "approved" ? "ready" : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setActiveHandle(row.handle)}
              >
                <div className="wwmx-list-row">
                  <input
                    type="checkbox"
                    checked={selected.has(row.handle)}
                    onClick={(e) => toggleSelect(row.handle, e)}
                    onChange={() => {}}
                    aria-label={`Select ${row.handle}`}
                  />
                  <div className="wwmx-list-body">
                    <div className="wwmx-list-handle">{row.handle}</div>
                    <div className="wwmx-list-title">{row.legacy_title}</div>
                    <div className="wwmx-list-meta">
                      <span>{row.painting_prefix}</span>
                      <span>·</span>
                      <span>{row.proposed_category}</span>
                      <span>·</span>
                      <span>media: {(row.media_filenames || []).length}</span>
                    </div>
                    <div className="wwmx-list-meta wwmw-list-badges">
                      <span className={`wwmx-state-badge state-${workflowState}`}>
                        {ROW_STATE_LABELS[workflowState]}
                      </span>
                      {topCand && (
                        <span className={`wwmx-badge conf-${topCand.confidence}`}>
                          {topCand.workbook_product_code}
                        </span>
                      )}
                      {isFilled(row.price_rub) && <span>₽{row.price_rub}</span>}
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
              fieldSources={activeFieldSources}
              handleCandidates={activeCandidates}
              onChange={(patch) => updateRow(activeRow.handle, patch)}
              onFieldManual={(field) => markFieldManual(activeRow.handle, field)}
              onUseCandidate={(c) => useCandidate(activeRow.handle, c)}
              onNoSource={() => markNoSource(activeRow.handle)}
            />
          ) : (
            <div className="wwmx-editor-empty">Выберите товар слева</div>
          )}
        </main>
      </div>

      <div className="wwmx-save-bar">
        {msg && <div className="wwmx-msg">{msg}</div>}
        <div className="wwmx-save-actions">
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
