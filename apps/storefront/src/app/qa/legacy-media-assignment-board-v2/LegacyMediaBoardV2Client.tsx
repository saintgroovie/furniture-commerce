"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  InvItem,
  CandidateEntry,
  ProductRow,
  V2LoadStatus,
  V2ProductState,
  V2VariantRoleAssignment,
  V2ColorVariant,
  V2RoleFilter,
  V2RoleSlot,
} from "./legacy-board-v2-types"
import { extractColorTokenFromMedia } from "@/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"
import { MediaPoolPanel } from "./MediaPoolPanel"
import { ProductWorkspace } from "./ProductWorkspace"
import { ExportToolbar } from "./ExportToolbar"
import {
  loadV2PersistedState,
  saveV2PersistedState,
} from "./legacy-board-v2-persistence"

const V1_API_BASE = "/qa/legacy-media-assignment-board/api"

function productReadiness(state: V2ProductState | undefined): "ready" | "partial" | "empty" {
  if (!state) return "empty"
  const hasMain = Object.values(state.rolesByVariant).some((v) => !!(v as V2VariantRoleAssignment).main)
  const hasGallery = Object.values(state.galleriesByVariant).some((g) => g.length > 0)
  if (hasMain && hasGallery) return "ready"
  if (hasMain || hasGallery) return "partial"
  return "empty"
}

// Russian color token labels (subset; fallback to raw token)
const TOKEN_TO_RU: Record<string, string> = {
  blue: "Синий",
  grey: "Серый",
  gray: "Серый",
  white: "Белый",
  cream: "Кремовый",
  milk: "Молочный",
  beige: "Бежевый",
  olive: "Оливковый",
  green: "Зелёный",
  black: "Чёрный",
  brown: "Коричневый",
  graphite: "Графит",
  ivory: "Слоновая кость",
  walnut: "Орех",
  natural: "Натуральный",
  oak: "Дуб",
  wenge: "Венге",
}

const SLOT_TO_FILTER: Record<V2RoleSlot, V2RoleFilter> = {
  main: "front",
  front_anfas: "front",
  front_3_4: "3_4",
  interior: "interior",
  detail: "detail",
  lifestyle: "lifestyle",
  scheme: "scheme",
}

function makeEmptyProductState(handle: string, variantKey: string): V2ProductState {
  return {
    handle,
    activeVariantKey: variantKey,
    rolesByVariant: {},
    galleriesByVariant: {},
    rejectedIds: [],
  }
}

export function LegacyMediaBoardV2Client() {
  // --- Data loading state ---
  const [status, setStatus] = useState<V2LoadStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [products, setProducts] = useState<ProductRow[]>([])
  const [invById, setInvById] = useState<Map<string, InvItem>>(new Map())
  const [candidatesByHandle, setCandidatesByHandle] = useState<Map<string, string[]>>(new Map())
  const [entryByInventoryId, setEntryByInventoryId] = useState<Map<string, CandidateEntry>>(new Map())

  // --- UI selection state ---
  const [selectedHandle, setSelectedHandle] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  // --- Assignment state (persisted via localStorage Commit 4) ---
  const [productStates, setProductStates] = useState<Record<string, V2ProductState>>({})

  // --- Persistence state ---
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const hasSavedOnceRef = useRef(false)

  // --- Lifted pool filter state (Commit 3) ---
  const [poolFilter, setPoolFilter] = useState<V2RoleFilter>("all")

  // Reset filter when selected handle changes
  useEffect(() => {
    setPoolFilter("all")
  }, [selectedHandle])

  // --- Hydrate from localStorage on mount ---
  useEffect(() => {
    const persisted = loadV2PersistedState()
    if (persisted) {
      setProductStates(persisted.productStates)
      if (persisted.selectedHandle) setSelectedHandle(persisted.selectedHandle)
      setSavedAt(persisted.savedAt)
    }
  }, [])

  // --- Auto-save whenever assignments change (skip initial mount render) ---
  useEffect(() => {
    if (!hasSavedOnceRef.current) {
      hasSavedOnceRef.current = true
      return
    }
    saveV2PersistedState(productStates, selectedHandle)
    setSavedAt(new Date().toISOString())
  }, [productStates, selectedHandle])

  // --- Data loading ---
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
    return () => { cancelled = true }
  }, [])

  // --- Derived: color variants for selected product ---
  const colorVariants = useMemo<V2ColorVariant[]>(() => {
    if (!selectedHandle) return []
    const ids = candidatesByHandle.get(selectedHandle) ?? []
    const byToken = new Map<string, string[]>()

    for (const id of ids) {
      const inv = invById.get(id)
      if (!inv) continue
      const token = extractColorTokenFromMedia(inv, selectedHandle) ?? "__none__"
      const list = byToken.get(token) ?? []
      list.push(id)
      byToken.set(token, list)
    }

    const result: V2ColorVariant[] = []
    for (const [token, itemIds] of Array.from(byToken.entries())) {
      if (token === "__none__") continue
      result.push({
        variantKey: token,
        label: TOKEN_TO_RU[token] ?? token,
        itemIds,
      })
    }
    result.sort((a, b) => b.itemIds.length - a.itemIds.length)

    const hasColorless = byToken.has("__none__")
    if (result.length === 0 || hasColorless) {
      const allIds = ids.filter((id) => invById.has(id))
      result.unshift({ variantKey: "__all__", label: "Все", itemIds: allIds })
    }

    return result
  }, [selectedHandle, candidatesByHandle, invById])

  // --- Derived: active variant key ---
  const activeVariantKey = useMemo<string>(() => {
    if (!selectedHandle || colorVariants.length === 0) return "__all__"
    return productStates[selectedHandle]?.activeVariantKey ?? colorVariants[0]!.variantKey
  }, [selectedHandle, colorVariants, productStates])

  // --- Derived: current product assignment state ---
  const currentProductState = useMemo<V2ProductState | null>(() => {
    return selectedHandle ? (productStates[selectedHandle] ?? null) : null
  }, [selectedHandle, productStates])

  // --- Derived: pool state for active variant (passed to MediaPoolPanel) ---
  const currentMainId = useMemo<string | null>(
    () => (currentProductState?.rolesByVariant[activeVariantKey]?.main as string | null | undefined) ?? null,
    [currentProductState, activeVariantKey]
  )
  const currentGalleryIds = useMemo<string[]>(
    () => currentProductState?.galleriesByVariant[activeVariantKey] ?? [],
    [currentProductState, activeVariantKey]
  )

  // --- Assignment state helpers ---
  const updateProductState = useCallback(
    (handle: string, variantKey: string, updater: (s: V2ProductState) => V2ProductState) => {
      setProductStates((prev) => {
        const existing = prev[handle] ?? makeEmptyProductState(handle, variantKey)
        return { ...prev, [handle]: updater(existing) }
      })
    },
    []
  )

  const handleSetVariant = useCallback(
    (variantKey: string) => {
      if (!selectedHandle) return
      updateProductState(selectedHandle, variantKey, (s) => ({ ...s, activeVariantKey: variantKey }))
    },
    [selectedHandle, updateProductState]
  )

  const handleSetMain = useCallback(
    (mediaId: string) => {
      if (!selectedHandle) return
      updateProductState(selectedHandle, activeVariantKey, (s) => ({
        ...s,
        rolesByVariant: {
          ...s.rolesByVariant,
          [activeVariantKey]: {
            ...s.rolesByVariant[activeVariantKey],
            main: mediaId,
          },
        },
      }))
    },
    [selectedHandle, activeVariantKey, updateProductState]
  )

  const handleRemoveMain = useCallback(() => {
    if (!selectedHandle) return
    updateProductState(selectedHandle, activeVariantKey, (s) => ({
      ...s,
      rolesByVariant: {
        ...s.rolesByVariant,
        [activeVariantKey]: {
          ...s.rolesByVariant[activeVariantKey],
          main: null,
        },
      },
    }))
  }, [selectedHandle, activeVariantKey, updateProductState])

  const handleAddToGallery = useCallback(
    (mediaId: string) => {
      if (!selectedHandle) return
      updateProductState(selectedHandle, activeVariantKey, (s) => {
        const existing = s.galleriesByVariant[activeVariantKey] ?? []
        if (existing.includes(mediaId)) return s
        return {
          ...s,
          galleriesByVariant: {
            ...s.galleriesByVariant,
            [activeVariantKey]: [...existing, mediaId],
          },
        }
      })
    },
    [selectedHandle, activeVariantKey, updateProductState]
  )

  const handleRemoveFromGallery = useCallback(
    (mediaId: string) => {
      if (!selectedHandle) return
      updateProductState(selectedHandle, activeVariantKey, (s) => ({
        ...s,
        galleriesByVariant: {
          ...s.galleriesByVariant,
          [activeVariantKey]: (s.galleriesByVariant[activeVariantKey] ?? []).filter(
            (id) => id !== mediaId
          ),
        },
      }))
    },
    [selectedHandle, activeVariantKey, updateProductState]
  )

  const handleFocusRole = useCallback(
    (slot: V2RoleSlot) => {
      setPoolFilter(SLOT_TO_FILTER[slot])
    },
    []
  )

  // --- Reset: clear v2board LS + reset in-memory state ---
  const handleReset = useCallback(() => {
    setProductStates({})
    setSelectedHandle(null)
    setSavedAt(null)
    hasSavedOnceRef.current = false
  }, [])

  // --- Filtered product list ---
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

      {/* Export / persistence toolbar */}
      <ExportToolbar
        productStates={productStates}
        invById={invById}
        products={products}
        savedAt={savedAt}
        onReset={handleReset}
      />

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
                  const readiness = productReadiness(productStates[p.handle])
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
                      {readiness === "ready" && (
                        <span style={styles.readyBadge} title="Главное + галерея назначены">◉</span>
                      )}
                      {readiness === "partial" && (
                        <span style={styles.partialBadge} title="Назначение неполное">◑</span>
                      )}
                      {count > 0 && <span style={styles.mediaBadge}>{count}</span>}
                    </button>
                  )
                })}
                {filteredProducts.length === 0 && (
                  <div style={styles.emptySearch}>Нет результатов по «{search}»</div>
                )}
              </div>
            </>
          ) : (
            <div style={styles.placeholderBody}>Ожидание загрузки…</div>
          )}
        </aside>

        {/* Center: Assignment canvas */}
        <ProductWorkspace
          selectedHandle={selectedHandle}
          products={products}
          colorVariants={colorVariants}
          activeVariantKey={activeVariantKey}
          productState={currentProductState}
          invById={invById}
          onSetVariant={handleSetVariant}
          onRemoveMain={handleRemoveMain}
          onRemoveFromGallery={handleRemoveFromGallery}
          onFocusRole={handleFocusRole}
        />

        {/* Right: Media pool */}
        <MediaPoolPanel
          selectedHandle={selectedHandle}
          invById={invById}
          candidatesByHandle={candidatesByHandle}
          entryByInventoryId={entryByInventoryId}
          activeFilter={poolFilter}
          onSetFilter={setPoolFilter}
          onSetMain={handleSetMain}
          onAddToGallery={handleAddToGallery}
          currentMainId={currentMainId}
          currentGalleryIds={currentGalleryIds}
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
    gridTemplateColumns: "240px 1fr 420px",
    flex: 1,
    overflow: "hidden",
  },
  colLeft: {
    borderRight: "1px solid #ddd",
    overflow: "hidden" as const,
    background: "#fff",
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
    minHeight: 0,
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
    boxShadow: "inset 3px 0 0 #1a3a6e",
    padding: "7px 12px 7px 9px",
  },
  productHandle: {
    fontWeight: 600,
    flex: "0 0 auto",
    maxWidth: "150px",
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
  readyBadge: {
    fontSize: "11px",
    color: "#2d7a2d",
    flexShrink: 0,
    lineHeight: 1,
  },
  partialBadge: {
    fontSize: "11px",
    color: "#b88a00",
    flexShrink: 0,
    lineHeight: 1,
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
