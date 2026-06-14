"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  buildExportJson,
  downloadBlob,
  parseImportJson,
  rowsToCsv,
} from "./business-gate-board-export"
import {
  clearGateState,
  loadGateState,
  mergePersistedRows,
  saveGateState,
} from "./business-gate-board-persistence"
import { computeSummary, validateRow } from "./business-gate-board-validation"
import type {
  GateBootstrap,
  GateFilter,
  GateRow,
  OperatorDecision,
  ProductType,
  PublishPolicy,
  VariantStrategy,
} from "./business-gate-board-types"

const API = "/qa/willie-winkie-business-gate-board/api"
const EXPECTED_PACKET_PATH =
  "tmp/willie-winkie-flow-a-business-gate-packet/operator-fill-matrix.json"
const LOCAL_DEV_COMMAND = `cd apps/storefront
FURNITURE_REPO_ROOT=/Users/leonidmbp/Documents/projects/furniture-commerce yarn dev --port 8010`
const LOCAL_BOARD_URL = "http://localhost:8010/qa/willie-winkie-business-gate-board"

type BootstrapApiError = {
  error?: string
  hint?: string
  expected_packet_path?: string
  launch_context?: string
  recommended_dev_command?: string
  recommended_url?: string
  cwd?: string
  checked_paths?: string[]
}

function parseBootstrapError(raw: string): BootstrapApiError | null {
  try {
    return JSON.parse(raw) as BootstrapApiError
  } catch {
    return null
  }
}

function looksLikeDockerContext(api?: BootstrapApiError): boolean {
  if (typeof window !== "undefined" && window.location.port === "8000") return true
  if (api?.launch_context === "docker_storefront") return true
  if (api?.cwd === "/app") return true
  return false
}

function BootstrapLoadErrorPanel({
  raw,
  onRetry,
}: {
  raw: string
  onRetry: () => void
}) {
  const api = parseBootstrapError(raw)
  const isPacketMissing = api?.error === "business_gate_packet_not_found"
  const dockerContext = looksLikeDockerContext(api)

  return (
    <div className="wbg-err wbg-err-panel">
      <h2>Business gate board cannot load packet</h2>
      {dockerContext && (
        <p className="wbg-err-lead">
          You opened <strong>Docker storefront</strong> (or the wrong local dev server). This QA
          board needs the host repo tmp packet and is not available on the default{" "}
          <code>:8000</code> container without <code>FURNITURE_REPO_ROOT</code> + volume mount.
        </p>
      )}
      {!dockerContext && isPacketMissing && (
        <p className="wbg-err-lead">
          Bootstrap could not find the operator packet on this server. Start local storefront dev
          with <code>FURNITURE_REPO_ROOT</code> pointing at the repo that contains the tmp packet.
        </p>
      )}
      <dl className="wbg-err-meta">
        <dt>Expected packet path</dt>
        <dd>
          <code>{api?.expected_packet_path || EXPECTED_PACKET_PATH}</code>
        </dd>
        <dt>Correct local URL</dt>
        <dd>
          <a href={api?.recommended_url || LOCAL_BOARD_URL}>
            {api?.recommended_url || LOCAL_BOARD_URL}
          </a>
        </dd>
      </dl>
      <p className="wbg-err-label">Local dev command</p>
      <pre className="wbg-err-code">{LOCAL_DEV_COMMAND}</pre>
      {api?.cwd && (
        <p className="wbg-err-detail">
          Server cwd: <code>{api.cwd}</code>
        </p>
      )}
      <details className="wbg-err-details">
        <summary>Raw bootstrap error</summary>
        <pre>{raw}</pre>
      </details>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}

function MediaThumb({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className="wbg-thumb-fallback" title={name}>
        {name}
      </div>
    )
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="wbg-thumb-link">
      <img src={url} alt={name} onError={() => setFailed(true)} />
    </a>
  )
}

export function BusinessGateBoardClient() {
  const [rows, setRows] = useState<GateRow[]>([])
  const [meta, setMeta] = useState<GateBootstrap | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState("")
  const [filter, setFilter] = useState<GateFilter>("all")
  const [motifFilter, setMotifFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [search, setSearch] = useState("")
  const importRef = useRef<HTMLInputElement>(null)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(() => {
    fetch(`${API}/bootstrap`, { signal: AbortSignal.timeout(60000) })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text())
        return res.json() as Promise<GateBootstrap>
      })
      .then((data) => {
        const merged = mergePersistedRows(data.rows, loadGateState())
        setMeta(data)
        setRows(merged)
        setError(null)
      })
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (rows.length === 0) return
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => saveGateState(rows), 400)
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current)
    }
  }, [rows])

  const summary = useMemo(() => computeSummary(rows), [rows])
  const validations = useMemo(() => new Map(rows.map((r) => [r.handle, validateRow(r)])), [rows])

  const motifs = useMemo(
    () => Array.from(new Set(rows.map((r) => r.motif_painting_name))).sort(),
    [rows]
  )

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const v = validations.get(row.handle)!
      if (motifFilter !== "all" && row.motif_painting_name !== motifFilter) return false
      if (typeFilter !== "all" && row.product_type !== typeFilter) return false
      if (filter === "incomplete" && v.is_seed_ready) return false
      if (filter === "seed_ready" && !v.is_seed_ready) return false
      if (filter === "needs_more_info" && row.operator_decision !== "needs_more_info") return false
      if (filter === "excluded" && row.operator_decision !== "exclude_from_pilot") return false
      if (filter === "missing_price" && !v.missing_fields.includes("price")) return false
      if (
        filter === "missing_ww_mapping" &&
        !v.missing_fields.includes("workbook_row_key") &&
        !v.missing_fields.includes("workbook_product_code_ww")
      )
        return false
      if (search.trim()) {
        const q = search.toLowerCase()
        if (
          !row.handle.includes(q) &&
          !row.sku.toLowerCase().includes(q) &&
          !row.raw_legacy_title.toLowerCase().includes(q) &&
          !row.motif_painting_name.toLowerCase().includes(q)
        )
          return false
      }
      return true
    })
  }, [rows, filter, motifFilter, typeFilter, search, validations])

  const updateRow = (handle: string, patch: Partial<GateRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.handle === handle ? { ...r, ...patch, do_not_auto_apply: true } : r))
    )
  }

  const copyJson = async () => {
    if (!meta) return
    const payload = buildExportJson(rows, meta.source_packet_path)
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
    setMsg("JSON copied to clipboard")
  }

  const downloadJson = () => {
    if (!meta) return
    const payload = buildExportJson(rows, meta.source_packet_path)
    downloadBlob(
      `willie-winkie-business-gate-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      "application/json"
    )
    setMsg("JSON downloaded")
  }

  const downloadCsv = () => {
    downloadBlob(
      `operator-fill-matrix-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(rows),
      "text/csv"
    )
    setMsg("CSV downloaded (28 columns)")
  }

  const onImport = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result))
        const baseHandles = new Set(rows.map((r) => r.handle))
        const imported = parseImportJson(data, baseHandles)
        if (!imported?.length) {
          setMsg("Import failed: no matching rows")
          return
        }
        const byHandle = new Map(imported.map((r) => [r.handle!, r]))
        setRows((prev) =>
          prev.map((r) => ({ ...r, ...byHandle.get(r.handle), do_not_auto_apply: true }))
        )
        setMsg(`Imported ${imported.length} row patch(es)`)
      } catch {
        setMsg("Import failed: invalid JSON")
      }
    }
    reader.readAsText(file)
  }

  const resetEdits = () => {
    if (!meta) return
    clearGateState()
    setRows(meta.rows.map((r) => ({ ...r })))
    setMsg("Local edits cleared")
  }

  if (error) {
    return <BootstrapLoadErrorPanel raw={error} onRetry={load} />
  }

  if (!meta) return <div className="wbg-msg">Loading 28 handles…</div>

  return (
    <>
      <div className="wbg-banner">
        Catalog / business gate only — does not write DB, seed, or product media.
      </div>

      <header className="wbg-header">
        <h1>Willie Winkie / Molly — Business Gate Board</h1>
        <div className="wbg-stats">
          <span className="wbg-stat">
            Total: <strong>{summary.total_rows}</strong>
          </span>
          <span className="wbg-stat">
            approve_for_seed: <strong>{summary.approve_for_seed_count}</strong>
          </span>
          <span className="wbg-stat">
            needs_more_info: <strong>{summary.needs_more_info_count}</strong>
          </span>
          <span className="wbg-stat">
            excluded: <strong>{summary.excluded_from_pilot_count}</strong>
          </span>
          <span className="wbg-stat">
            missing fields: <strong>{summary.missing_required_fields_count}</strong>
          </span>
          <span className="wbg-stat wbg-stat-highlight">
            seed-ready: <strong>{summary.seed_ready_count}</strong>
          </span>
        </div>
      </header>

      <div className="wbg-toolbar">
        <input
          placeholder="Search handle / SKU / title / motif"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value as GateFilter)}>
          <option value="all">All</option>
          <option value="incomplete">Incomplete</option>
          <option value="seed_ready">Seed-ready</option>
          <option value="needs_more_info">needs_more_info</option>
          <option value="excluded">excluded</option>
          <option value="missing_price">Missing price</option>
          <option value="missing_ww_mapping">Missing WW mapping</option>
        </select>
        <select value={motifFilter} onChange={(e) => setMotifFilter(e.target.value)}>
          <option value="all">All motifs</option>
          {motifs.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All product_type</option>
          <option value="STANDARD">STANDARD</option>
          <option value="CONFIGURABLE">CONFIGURABLE</option>
          <option value="BESPOKE">BESPOKE</option>
          <option value="TODO_OPERATOR">TODO_OPERATOR</option>
        </select>
        <button type="button" onClick={copyJson}>
          Copy JSON
        </button>
        <button type="button" onClick={downloadJson}>
          Download JSON
        </button>
        <button type="button" onClick={downloadCsv}>
          Download CSV
        </button>
        <button type="button" onClick={() => importRef.current?.click()}>
          Import JSON
        </button>
        <input
          ref={importRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onImport(f)
            e.target.value = ""
          }}
        />
        <button type="button" onClick={resetEdits}>
          Reset local edits
        </button>
      </div>

      {msg && <div className="wbg-msg">{msg}</div>}

      <div className="wbg-cards">
        {filtered.map((row) => {
          const v = validations.get(row.handle)!
          const cardClass = [
            "wbg-card",
            v.is_seed_ready ? "wbg-card-ready" : "",
            v.errors.length > 0 ? "wbg-card-error" : "",
          ]
            .filter(Boolean)
            .join(" ")

          return (
            <article key={row.handle} className={cardClass}>
              <header className="wbg-card-head">
                <div>
                  <h2>
                    {row.handle} <span className="wbg-sku">{row.sku}</span>
                  </h2>
                  <p className="wbg-meta">
                    {row.collection} · {row.motif_painting_name}
                  </p>
                  <p className="wbg-title">{row.raw_legacy_title}</p>
                  <p className="wbg-meta">
                    category: {row.raw_legacy_category} · media: {row.media_count} · roles:{" "}
                    {row.available_roles}
                  </p>
                </div>
                <div className="wbg-status">
                  {v.is_seed_ready ? (
                    <span className="wbg-badge wbg-badge-ok">seed-ready</span>
                  ) : (
                    <span className="wbg-badge">incomplete</span>
                  )}
                </div>
              </header>

              <div className="wbg-media-strip">
                {(row.media_preview_urls || []).map((url, i) => (
                  <MediaThumb
                    key={url}
                    url={url}
                    name={row.media_filenames?.[i] || pathBasename(url)}
                  />
                ))}
              </div>
              {row.static_sample_repo_path && (
                <p className="wbg-path">
                  <a
                    href={`${meta.backend_static_base}${row.static_sample_public_url}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {row.static_sample_public_url}
                  </a>
                </p>
              )}

              <div className="wbg-fields">
                <label>
                  workbook_row_key
                  <input
                    value={row.workbook_row_key}
                    onChange={(e) => updateRow(row.handle, { workbook_row_key: e.target.value })}
                  />
                </label>
                <label>
                  workbook_product_code_ww
                  <input
                    value={row.workbook_product_code_ww}
                    onChange={(e) =>
                      updateRow(row.handle, { workbook_product_code_ww: e.target.value })
                    }
                  />
                </label>
                <label>
                  price
                  <input
                    value={row.price}
                    onChange={(e) => updateRow(row.handle, { price: e.target.value })}
                  />
                </label>
                <label>
                  currency
                  <input
                    value={row.currency}
                    onChange={(e) => updateRow(row.handle, { currency: e.target.value })}
                  />
                </label>
                <label>
                  product_type
                  <select
                    value={row.product_type || ""}
                    onChange={(e) =>
                      updateRow(row.handle, { product_type: e.target.value as ProductType })
                    }
                  >
                    <option value="">—</option>
                    <option value="TODO_OPERATOR">TODO_OPERATOR</option>
                    {meta.acceptable_values.product_type.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  variant_strategy
                  <select
                    value={row.variant_strategy || ""}
                    onChange={(e) =>
                      updateRow(row.handle, { variant_strategy: e.target.value as VariantStrategy })
                    }
                  >
                    <option value="">—</option>
                    <option value="TODO_OPERATOR">TODO_OPERATOR</option>
                    {meta.acceptable_values.variant_strategy.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  publish_policy
                  <select
                    value={row.publish_policy || ""}
                    onChange={(e) =>
                      updateRow(row.handle, { publish_policy: e.target.value as PublishPolicy })
                    }
                  >
                    <option value="">—</option>
                    <option value="TODO_OPERATOR">TODO_OPERATOR</option>
                    {meta.acceptable_values.publish_policy.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  operator_decision
                  <select
                    value={row.operator_decision || ""}
                    onChange={(e) =>
                      updateRow(row.handle, {
                        operator_decision: e.target.value as OperatorDecision,
                      })
                    }
                  >
                    <option value="">—</option>
                    <option value="TODO_OPERATOR">TODO_OPERATOR</option>
                    {meta.acceptable_values.operator_decision.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="wbg-full">
                  operator_note
                  <textarea
                    value={row.operator_note}
                    onChange={(e) => updateRow(row.handle, { operator_note: e.target.value })}
                    rows={2}
                  />
                </label>
              </div>

              {(v.errors.length > 0 || v.missing_fields.length > 0) && (
                <div className="wbg-validation">
                  {v.missing_fields.length > 0 && (
                    <p>Missing: {v.missing_fields.join(", ")}</p>
                  )}
                  {v.errors.map((e) => (
                    <p key={e} className="wbg-err-line">
                      {e}
                    </p>
                  ))}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </>
  )
}

function pathBasename(url: string): string {
  const parts = url.split("/")
  return parts[parts.length - 1] || url
}
