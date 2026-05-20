"use client"

import { useEffect, useState } from "react"
import type { InvItem, CandidateEntry, ProductRow, V2LoadStatus, V2DataCounts } from "./legacy-board-v2-types"

const V1_API_BASE = "/qa/legacy-media-assignment-board/api"

export function LegacyMediaBoardV2Client() {
  const [status, setStatus] = useState<V2LoadStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [counts, setCounts] = useState<V2DataCounts>({ products: 0, inventoryItems: 0, candidateEntries: 0 })

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    setError(null)

    async function load() {
      try {
        const [invRes, candidatesRes, productsRes] = await Promise.all([
          fetch(`${V1_API_BASE}/inventory`),
          fetch(`${V1_API_BASE}/candidates`),
          fetch(`${V1_API_BASE}/products`),
        ])

        if (!invRes.ok) throw new Error(`inventory: ${invRes.status} ${invRes.statusText}`)
        if (!candidatesRes.ok) throw new Error(`candidates: ${candidatesRes.status} ${candidatesRes.statusText}`)
        if (!productsRes.ok) throw new Error(`products: ${productsRes.status} ${productsRes.statusText}`)

        const invJson = await invRes.json() as { items?: InvItem[] }
        const candidatesJson = await candidatesRes.json() as { entries?: CandidateEntry[] }
        const productsJson = await productsRes.json() as { products?: ProductRow[] }

        if (cancelled) return

        const items = invJson.items ?? []
        const entries = candidatesJson.entries ?? []
        const products = productsJson.products ?? []

        setCounts({
          products: products.length,
          inventoryItems: items.length,
          candidateEntries: entries.length,
        })
        setStatus("loaded")
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus("error")
      }
    }

    void load()
    return () => { cancelled = true }
  }, [])

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <h1 style={styles.title}>Legacy Media Assignment Board v2</h1>
        <span style={styles.badge}>dev · QA only · no Medusa writes</span>
      </header>

      {status === "loading" && (
        <div style={styles.statusBar}>
          <span style={styles.spinner} aria-label="Loading" /> Loading inventory, candidates, products…
        </div>
      )}

      {status === "error" && (
        <div style={{ ...styles.statusBar, ...styles.errorBar }}>
          <strong>Fetch failed:</strong> {error}
          <div style={styles.errorHint}>
            Ensure the storefront dev server is running and v1 QA API routes are accessible at{" "}
            <code>{V1_API_BASE}</code>.
          </div>
        </div>
      )}

      {status === "loaded" && (
        <div style={styles.statusBar}>
          <strong>Loaded:</strong>{" "}
          {counts.products} products · {counts.inventoryItems} inventory items · {counts.candidateEntries} candidate entries
        </div>
      )}

      <div style={styles.grid}>
        <aside style={styles.colLeft}>
          <div style={styles.placeholderHeader}>Product selector</div>
          <div style={styles.placeholderBody}>
            {status === "loaded"
              ? `${counts.products} products available — selector UI in Commit 2`
              : "Waiting for data…"}
          </div>
        </aside>

        <main style={styles.colCenter}>
          <div style={styles.placeholderHeader}>Product workspace</div>
          <div style={styles.placeholderBody}>
            Select a product from the left panel to load its workspace.
            <br />
            <em style={{ color: "#999", fontSize: "12px" }}>
              Role checklist · color variant tabs · gallery strip · missing role strip — Commit 3
            </em>
          </div>
        </main>

        <aside style={styles.colRight}>
          <div style={styles.placeholderHeader}>Media pool</div>
          <div style={styles.placeholderBody}>
            {status === "loaded"
              ? `${counts.inventoryItems} inventory items · ${counts.candidateEntries} candidate entries — pool UI in Commit 2`
              : "Waiting for data…"}
          </div>
        </aside>
      </div>
    </div>
  )
}

const styles = {
  root: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100dvh",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: "14px",
    color: "#1a1a1a",
    background: "#f8f8f8",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 16px",
    background: "#fff",
    borderBottom: "1px solid #e0e0e0",
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: "16px",
    fontWeight: 600,
    color: "#111",
  },
  badge: {
    fontSize: "11px",
    background: "#f0f0f0",
    border: "1px solid #ddd",
    borderRadius: "4px",
    padding: "2px 6px",
    color: "#666",
  },
  statusBar: {
    padding: "8px 16px",
    background: "#eef6ff",
    borderBottom: "1px solid #cce0ff",
    color: "#1a3a6e",
    flexShrink: 0,
    display: "flex",
    gap: "8px",
    alignItems: "flex-start",
    flexDirection: "column" as const,
  },
  errorBar: {
    background: "#fff0f0",
    borderBottom: "1px solid #ffcccc",
    color: "#7a0000",
  },
  errorHint: {
    fontSize: "12px",
    color: "#a33",
    marginTop: "2px",
  },
  spinner: {
    display: "inline-block",
    width: "12px",
    height: "12px",
    border: "2px solid #99bbdd",
    borderTopColor: "#336699",
    borderRadius: "50%",
    animation: "v2spin 0.8s linear infinite",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "280px 1fr 360px",
    flex: 1,
    overflow: "hidden",
    gap: 0,
  },
  colLeft: {
    borderRight: "1px solid #ddd",
    overflowY: "auto" as const,
    background: "#fff",
    display: "flex",
    flexDirection: "column" as const,
  },
  colCenter: {
    overflowY: "auto" as const,
    background: "#fafafa",
    display: "flex",
    flexDirection: "column" as const,
  },
  colRight: {
    borderLeft: "1px solid #ddd",
    overflowY: "auto" as const,
    background: "#fff",
    display: "flex",
    flexDirection: "column" as const,
  },
  placeholderHeader: {
    padding: "10px 14px",
    fontWeight: 600,
    fontSize: "12px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: "#555",
    borderBottom: "1px solid #eee",
    background: "#f5f5f5",
  },
  placeholderBody: {
    padding: "16px 14px",
    color: "#888",
    lineHeight: 1.6,
  },
} as const
