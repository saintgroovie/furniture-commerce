"use client"

import { useEffect, useMemo, useState } from "react"
import type { InvItem, CandidateEntry, ProductRow, V2LoadStatus } from "./legacy-board-v2-types"
import { MediaPoolPanel } from "./MediaPoolPanel"

const V1_API_BASE = "/qa/legacy-media-assignment-board/api"

export function LegacyMediaBoardV2Client() {
  const [status, setStatus] = useState<V2LoadStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [products, setProducts] = useState<ProductRow[]>([])
  const [invById, setInvById] = useState<Map<string, InvItem>>(new Map())
  const [candidatesByHandle, setCandidatesByHandle] = useState<Map<string, string[]>>(new Map())
  const [entryByInventoryId, setEntryByInventoryId] = useState<Map<string, CandidateEntry>>(new Map())
  const [selectedHandle, setSelectedHandle] = useState<string | null>(null)
  const [search, setSearch] = useState("")

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

        const invJson = (await invRes.json()) as { items?: InvItem[] }
        const candidatesJson = (await candidatesRes.json()) as { entries?: CandidateEntry[] }
        const productsJson = (await productsRes.json()) as { products?: ProductRow[] }

        if (cancelled) return

        const items = invJson.items ?? []
        const entries = candidatesJson.entries ?? []
        const prods = productsJson.products ?? []

        // Build lookup maps
        const byId = new Map<string, InvItem>()
        for (const item of items) byId.set(item.id, item)

        const byHandle = new Map<string, string[]>()
        const entryById = new Map<string, CandidateEntry>()
        for (const entry of entries) {
          entryById.set(entry.inventory_id, entry)
          const handle = entry.top_candidate?.medusa_product_handle
          if (handle) {
            const list = byHandle.get(handle) ?? []
            list.push(entry.inventory_id)
            byHandle.set(handle, list)
          }
        }

        setProducts(prods)
        setInvById(byId)
        setCandidatesByHandle(byHandle)
        setEntryByInventoryId(entryById)
        setStatus("loaded")
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus("error")
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products
    const q = search.toLowerCase()
    return products.filter(
      (p) =>
        p.handle.toLowerCase().includes(q) ||
        (p.title && p.title.toLowerCase().includes(q)) ||
        p.collection.toLowerCase().includes(q)
    )
  }, [products, search])

  const statusLine = (() => {
    if (status === "loading") return "Загрузка inventory, candidates, products…"
    if (status === "loaded")
      return `Загружено: ${products.length} продуктов · ${invById.size} inventory items · ${entryByInventoryId.size} candidate entries`
    return null
  })()

  return (
    <div style={styles.root}>
      {/* Top bar */}
      <header style={styles.header}>
        <h1 style={styles.title}>Legacy Media Assignment Board v2</h1>
        <span style={styles.badge}>dev · QA only · no Medusa writes</span>
        {selectedHandle && <span style={styles.activeHandle}>{selectedHandle}</span>}
      </header>

      {/* Status bar */}
      {status === "loading" && (
        <div style={styles.statusBar}>
          <span style={styles.spinner} aria-label="Loading" />
          {statusLine}
        </div>
      )}
      {status === "error" && (
        <div style={{ ...styles.statusBar, ...styles.errorBar }}>
          <strong>Fetch failed:</strong> {error}
          <div style={styles.errorHint}>
            Убедитесь, что dev server запущен и v1 QA API доступен по <code>{V1_API_BASE}</code>
          </div>
        </div>
      )}
      {status === "loaded" && (
        <div style={{ ...styles.statusBar, ...styles.successBar }}>{statusLine}</div>
      )}

      {/* 3-column grid */}
      <div style={styles.grid}>
        {/* Left: Product selector */}
        <aside style={styles.colLeft}>
          <div style={styles.colHeader}>Выбор продукта</div>

          {status === "loaded" ? (
            <>
              <div style={styles.searchWrap}>
                <input
                  type="text"
                  placeholder="Поиск handle / коллекции…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={styles.searchInput}
                />
                <button
                  style={styles.quickBtn}
                  onClick={() => {
                    setSearch("")
                    setSelectedHandle("co-02-1")
                  }}
                >
                  ↗ Быстро: co-02-1
                </button>
              </div>

              <div style={styles.productList}>
                {filteredProducts.map((p) => {
                  const count = candidatesByHandle.get(p.handle)?.length ?? 0
                  const isSelected = selectedHandle === p.handle
                  return (
                    <button
                      key={p.handle}
                      style={{
                        ...styles.productRow,
                        ...(isSelected ? styles.productRowActive : {}),
                      }}
                      onClick={() => setSelectedHandle(p.handle)}
                    >
                      <span style={styles.productHandle}>{p.handle}</span>
                      <span style={styles.productCollection}>{p.collection}</span>
                      {count > 0 && <span style={styles.mediaBadge}>{count}</span>}
                    </button>
                  )
                })}
                {filteredProducts.length === 0 && (
                  <div style={styles.emptySearch}>
                    Нет результатов по «{search}»
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={styles.placeholderBody}>Ожидание загрузки…</div>
          )}
        </aside>

        {/* Center: Workspace placeholder */}
        <main style={styles.colCenter}>
          <div style={styles.colHeader}>Рабочая область продукта</div>
          <div style={styles.placeholderBody}>
            {selectedHandle ? (
              <>
                Продукт: <strong>{selectedHandle}</strong> — workspace в Commit 3
              </>
            ) : (
              "Выберите продукт из левой панели."
            )}
            <br />
            <em style={{ color: "#bbb", fontSize: "11px" }}>
              Чеклист ролей · цветовые варианты · gallery strip — Commit 3
            </em>
          </div>
        </main>

        {/* Right: Media pool */}
        <MediaPoolPanel
          selectedHandle={selectedHandle}
          invById={invById}
          candidatesByHandle={candidatesByHandle}
          entryByInventoryId={entryByInventoryId}
        />
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
    padding: "9px 16px",
    background: "#fff",
    borderBottom: "1px solid #e0e0e0",
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: "15px",
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
  activeHandle: {
    fontSize: "12px",
    background: "#e8f0ff",
    color: "#1a3a6e",
    borderRadius: "4px",
    padding: "2px 8px",
    fontWeight: 600,
  },
  statusBar: {
    padding: "6px 16px",
    background: "#eef6ff",
    borderBottom: "1px solid #cce0ff",
    color: "#1a3a6e",
    flexShrink: 0,
    display: "flex",
    gap: "8px",
    alignItems: "center",
    fontSize: "13px",
  },
  successBar: {
    background: "#f0faf0",
    borderBottom: "1px solid #c0e8c0",
    color: "#1a4a1a",
  },
  errorBar: {
    background: "#fff0f0",
    borderBottom: "1px solid #ffcccc",
    color: "#7a0000",
    flexDirection: "column" as const,
    alignItems: "flex-start",
  },
  errorHint: {
    fontSize: "12px",
    color: "#a33",
  },
  spinner: {
    display: "inline-block",
    width: "12px",
    height: "12px",
    border: "2px solid #99bbdd",
    borderTopColor: "#336699",
    borderRadius: "50%",
    flexShrink: 0,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "280px 1fr 380px",
    flex: 1,
    overflow: "hidden",
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
  colHeader: {
    padding: "9px 14px",
    fontWeight: 600,
    fontSize: "11px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "#555",
    borderBottom: "1px solid #eee",
    background: "#f5f5f5",
    flexShrink: 0,
  },
  searchWrap: {
    padding: "8px 10px",
    borderBottom: "1px solid #eee",
    display: "flex",
    flexDirection: "column" as const,
    gap: "5px",
    flexShrink: 0,
  },
  searchInput: {
    width: "100%",
    padding: "5px 8px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    fontSize: "12px",
    boxSizing: "border-box" as const,
    outline: "none",
  },
  quickBtn: {
    padding: "4px 8px",
    fontSize: "11px",
    border: "1px solid #aacaff",
    borderRadius: "4px",
    background: "#e8f0ff",
    color: "#1a3a6e",
    cursor: "pointer",
    fontWeight: 600,
    textAlign: "left" as const,
  },
  productList: {
    flex: 1,
    overflowY: "auto" as const,
    display: "flex",
    flexDirection: "column" as const,
  },
  productRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "center",
    gap: "4px",
    padding: "7px 12px",
    border: "none",
    borderBottom: "1px solid #f0f0f0",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left" as const,
    fontSize: "12px",
    color: "#222",
    lineHeight: 1.4,
  },
  productRowActive: {
    background: "#e8f0ff",
    borderLeft: "3px solid #1a3a6e",
    paddingLeft: "9px",
  },
  productHandle: {
    fontWeight: 600,
    flex: "0 0 auto",
    maxWidth: "160px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  productCollection: {
    fontSize: "10px",
    color: "#999",
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  mediaBadge: {
    fontSize: "10px",
    background: "#e0eecc",
    color: "#335500",
    borderRadius: "8px",
    padding: "1px 6px",
    fontWeight: 600,
    flexShrink: 0,
  },
  emptySearch: {
    padding: "16px 12px",
    color: "#aaa",
    fontSize: "12px",
  },
  placeholderBody: {
    padding: "16px 14px",
    color: "#888",
    lineHeight: 1.6,
    fontSize: "13px",
  },
} as const
