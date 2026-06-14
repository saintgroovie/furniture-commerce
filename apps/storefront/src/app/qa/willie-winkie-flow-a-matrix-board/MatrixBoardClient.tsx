"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { computeReadiness, validateRow } from "./matrix-board-validation"
import type {
  DecisionFilter,
  MatrixBootstrap,
  MatrixReadiness,
  MatrixRow,
} from "./matrix-board-types"

const API = "/qa/willie-winkie-flow-a-matrix-board/api"

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
      })
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const readiness = useMemo(() => computeReadiness(rows), [rows])
  const validations = useMemo(() => new Map(rows.map((r) => [r.handle, validateRow(r)])), [rows])

  const prefixes = useMemo(
    () => [...new Set(rows.map((r) => r.painting_prefix))].sort(),
    [rows]
  )
  const collections = useMemo(
    () => [...new Set(rows.map((r) => r.proposed_medusa_collection))].sort(),
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

  const updateRow = (handle: string, patch: Partial<MatrixRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.handle === handle ? { ...r, ...patch, ingestion_allowed: "no" } : r))
    )
  }

  const toggleSelect = (handle: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(handle)) next.delete(handle)
      else next.add(handle)
      return next
    })
  }

  const applyToSelected = (patch: Partial<MatrixRow>) => {
    if (selected.size === 0) {
      setMsg("Select rows first")
      return
    }
    setRows((prev) =>
      prev.map((r) =>
        selected.has(r.handle) ? { ...r, ...patch, ingestion_allowed: "no" } : r
      )
    )
    setMsg(`Updated ${selected.size} row(s)`)
  }

  const save = async () => {
    setMsg("Saving…")
    const res = await fetch(`${API}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    })
    const data = await res.json()
    if (!res.ok) {
      setMsg(`Save failed: ${data.error || res.status}`)
      return
    }
    setMsg(`Saved CSV + readiness (${data.readiness?.mandatory_filled_cells}/${data.readiness?.mandatory_total_cells} mandatory cells)`)
  }

  const copyJson = async () => {
    const res = await fetch(`${API}/export/json`)
    const data = await res.json()
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    setMsg("JSON copied to clipboard")
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
    setMsg(`Highlighted ${ready.length} complete row(s) — not auto-approved`)
  }

  if (error) {
    return (
      <div className="wwmx-err">
        <p>Failed to load matrix board.</p>
        <pre>{error}</pre>
        <button type="button" onClick={load}>
          Retry
        </button>
      </div>
    )
  }

  if (!meta) return <div className="wwmx-msg">Loading 28 rows…</div>

  return (
    <>
      <div className="wwmx-banner">
        Это business/catalog matrix. Не seed, не import, не media apply.
      </div>

      <header className="wwmx-header">
        <h1>Willie Winkie Flow A — Matrix Board</h1>
        <div className="wwmx-stats">
          <span className="wwmx-stat">
            Rows: <strong>{rows.length}</strong>
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
            mandatory: <strong>{readiness.mandatory_filled_cells}</strong>/
            {readiness.mandatory_total_cells}
          </span>
          <span className="wwmx-stat">
            ready: <strong>{readiness.rows_ready_for_approve}</strong>
          </span>
          <span className="wwmx-stat">
            blocked: <strong>{readiness.rows_blocked}</strong>
          </span>
        </div>
      </header>

      <div
        className={`wwmx-readiness ${readiness.seed_draft_allowed_later ? "ok" : ""}`}
      >
        <strong>Seed draft allowed later:</strong>{" "}
        {readiness.seed_draft_allowed_later ? "yes (all approve rows valid)" : "no"} —{" "}
        {readiness.reason}
      </div>

      <div className="wwmx-toolbar">
        <input
          placeholder="Search handle / title / prefix"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value as DecisionFilter)}>
          <option value="all">All rows</option>
          <option value="missing">Missing required</option>
          <option value="ready">Complete (not approved)</option>
          <option value="approve">approve</option>
          <option value="hold">hold</option>
          <option value="reject">reject</option>
        </select>
        <select value={prefixFilter} onChange={(e) => setPrefixFilter(e.target.value)}>
          <option value="all">All prefixes</option>
          {prefixes.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={collectionFilter} onChange={(e) => setCollectionFilter(e.target.value)}>
          <option value="all">All collections</option>
          {collections.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={bulkType} onChange={(e) => setBulkType(e.target.value)}>
          <option value="STANDARD">STANDARD</option>
          <option value="CONFIGURABLE">CONFIGURABLE</option>
          <option value="BESPOKE">BESPOKE</option>
        </select>
        <button type="button" onClick={() => applyToSelected({ medusa_product_type: bulkType as MatrixRow["medusa_product_type"] })}>
          Set type (selected)
        </button>
        <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
          <option value="draft">draft</option>
          <option value="published">published</option>
        </select>
        <button type="button" onClick={() => applyToSelected({ status_draft_or_published: bulkStatus as MatrixRow["status_draft_or_published"] })}>
          Set status (selected)
        </button>
        <select value={bulkVariant} onChange={(e) => setBulkVariant(e.target.value)}>
          <option value="single_default">single_default</option>
          <option value="configurable_tiers">configurable_tiers</option>
        </select>
        <button type="button" onClick={() => applyToSelected({ variant_strategy: bulkVariant as MatrixRow["variant_strategy"] })}>
          Set variant (selected)
        </button>
        <button type="button" onClick={() => applyToSelected({ operator_decision: "hold" })}>
          Set hold (selected)
        </button>
        <button type="button" onClick={highlightReady}>
          Select complete rows
        </button>
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

      {msg && <div className="wwmx-msg">{msg}</div>}

      <div className="wwmx-table-wrap">
        <table className="wwmx-table">
          <thead>
            <tr>
              <th className="sticky-col">☑</th>
              <th className="sticky-col">handle</th>
              <th>prefix</th>
              <th>legacy title</th>
              <th>collection</th>
              <th>category</th>
              <th>media</th>
              <th>workbook_row_key</th>
              <th>workbook_product_code</th>
              <th>painting_name</th>
              <th>type</th>
              <th>variant</th>
              <th>price_rub</th>
              <th>compare_at</th>
              <th>status</th>
              <th>decision</th>
              <th>notes</th>
              <th>readonly</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const v = validations.get(row.handle)!
              const rowClass = [
                selected.has(row.handle) ? "selected" : "",
                v.is_valid_approve ? "row-ready" : "",
                v.errors.length > 0 ? "row-error" : "",
              ]
                .filter(Boolean)
                .join(" ")
              return (
                <tr key={row.handle} className={rowClass}>
                  <td className="sticky-col">
                    <input
                      type="checkbox"
                      checked={selected.has(row.handle)}
                      onChange={() => toggleSelect(row.handle)}
                    />
                  </td>
                  <td className="sticky-col">
                    <strong>{row.handle}</strong>
                    {v.missing_fields.length > 0 && (
                      <div className="wwmx-readonly">missing: {v.missing_fields.length}</div>
                    )}
                  </td>
                  <td>{row.painting_prefix}</td>
                  <td style={{ maxWidth: 200 }}>{row.legacy_title}</td>
                  <td>{row.proposed_medusa_collection}</td>
                  <td>{row.proposed_category}</td>
                  <td>
                    <div className="wwmx-media-strip">
                      {(row.media_preview_urls || []).map((url, i) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer">
                          <img
                            src={url}
                            alt=""
                            onError={(e) => {
                              ;(e.target as HTMLImageElement).style.display = "none"
                            }}
                          />
                        </a>
                      ))}
                    </div>
                    {(row.media_filenames || []).map((f) => (
                      <div key={f} className="wwmx-media-fname">
                        {f}
                      </div>
                    ))}
                  </td>
                  <td>
                    <input
                      value={row.workbook_row_key}
                      onChange={(e) => updateRow(row.handle, { workbook_row_key: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      value={row.workbook_product_code}
                      onChange={(e) =>
                        updateRow(row.handle, { workbook_product_code: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={row.painting_name}
                      onChange={(e) => updateRow(row.handle, { painting_name: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      value={row.medusa_product_type || ""}
                      onChange={(e) =>
                        updateRow(row.handle, {
                          medusa_product_type: e.target.value as MatrixRow["medusa_product_type"],
                        })
                      }
                    >
                      <option value="">—</option>
                      <option value="TODO_OPERATOR">TODO_OPERATOR</option>
                      <option value="STANDARD">STANDARD</option>
                      <option value="CONFIGURABLE">CONFIGURABLE</option>
                      <option value="BESPOKE">BESPOKE</option>
                    </select>
                  </td>
                  <td>
                    <select
                      value={row.variant_strategy || ""}
                      onChange={(e) =>
                        updateRow(row.handle, {
                          variant_strategy: e.target.value as MatrixRow["variant_strategy"],
                        })
                      }
                    >
                      <option value="">—</option>
                      <option value="TODO_OPERATOR">TODO_OPERATOR</option>
                      <option value="single_default">single_default</option>
                      <option value="configurable_tiers">configurable_tiers</option>
                    </select>
                  </td>
                  <td>
                    <input
                      value={row.price_rub}
                      onChange={(e) => updateRow(row.handle, { price_rub: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      value={row.compare_at_price_rub}
                      onChange={(e) =>
                        updateRow(row.handle, { compare_at_price_rub: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <select
                      value={row.status_draft_or_published || ""}
                      onChange={(e) =>
                        updateRow(row.handle, {
                          status_draft_or_published: e.target
                            .value as MatrixRow["status_draft_or_published"],
                        })
                      }
                    >
                      <option value="">—</option>
                      <option value="TODO_OPERATOR">TODO_OPERATOR</option>
                      <option value="draft">draft</option>
                      <option value="published">published</option>
                    </select>
                  </td>
                  <td>
                    <select
                      value={row.operator_decision || ""}
                      onChange={(e) =>
                        updateRow(row.handle, {
                          operator_decision: e.target.value as MatrixRow["operator_decision"],
                        })
                      }
                    >
                      <option value="">—</option>
                      <option value="TODO_OPERATOR">TODO_OPERATOR</option>
                      <option value="hold">hold</option>
                      <option value="approve">approve</option>
                      <option value="reject">reject</option>
                    </select>
                  </td>
                  <td>
                    <textarea
                      value={row.operator_notes}
                      onChange={(e) => updateRow(row.handle, { operator_notes: e.target.value })}
                    />
                  </td>
                  <td className="wwmx-readonly">
                    cs: {row.legacy_cs_cart_product_id}
                    <br />
                    cat seed: {row.category_seed_needed}
                    <br />
                    ingest: {row.ingestion_allowed}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
