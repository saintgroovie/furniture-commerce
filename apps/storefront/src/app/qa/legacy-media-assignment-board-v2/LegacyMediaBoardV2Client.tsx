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
import type { LegacyMediaPreviewRecoveryEntry } from "@/lib/qa/legacy-media-preview-recovery-types"
import { MediaPoolPanel } from "./MediaPoolPanel"
import {
  buildMergedColorVariants,
  displayLabelForVariant,
  findMilkVariantKey,
  isPseudoColorVariantKey,
  listRealColorVariantKeys,
  LEGACY_ALL_VARIANT_KEY,
  NEEDS_COLOR_VARIANT_KEY,
  pickDefaultVariantKey,
  planAddVariant,
  applyAddVariantToState,
  applyRemoveVariantToState,
  applyRestoreVariantToState,
  productReadinessForVariants,
} from "./legacy-board-v2-color-variants"
import { ProductWorkspace } from "./ProductWorkspace"
import { ExportToolbar } from "./ExportToolbar"
import {
  loadV2PersistedState,
  mergeV2ProductStates,
  saveV2PersistedState,
} from "./legacy-board-v2-persistence"
import {
  addToGallery as syncAddToGallery,
  addToGalleryAllRealVariants as syncAddToGalleryAllRealVariants,
  assignMain as syncAssignMain,
  assignRole as syncAssignRole,
  assignRoleAllRealVariants as syncAssignRoleAllRealVariants,
  canonicalizeProductAssignmentIds,
  clearMain as syncClearMain,
  clearRole as syncClearRole,
  healVariantState,
  insertIntoGallery as syncInsertIntoGallery,
  removeFromGallery as syncRemoveFromGallery,
  reorderGallery as syncReorderGallery,
} from "./legacy-board-v2-state-sync"
import { V2_BOARD_BUILD, V2_BOARD_BUILD_LABEL } from "./legacy-board-v2-build"

const V1_API_BASE = "/qa/legacy-media-assignment-board/api"

function productReadiness(
  state: V2ProductState | undefined,
  handle: string | null,
  candidatesByHandle: Map<string, string[]>,
  invById: Map<string, InvItem>
): "ready" | "partial" | "empty" {
  if (!state || !handle) return "empty"
  const ids = candidatesByHandle.get(handle) ?? []
  const variants = buildMergedColorVariants(handle, ids, invById, state)
  const keys = variants.filter((v) => !isPseudoColorVariantKey(v.variantKey)).map((v) => v.variantKey)
  return productReadinessForVariants(state, keys)
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
    roleOverrides: {},
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
  const [recoveryById, setRecoveryById] = useState<Map<string, LegacyMediaPreviewRecoveryEntry>>(new Map())

  // --- UI selection state ---
  const [selectedHandle, setSelectedHandle] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  // --- Assignment state (persisted via localStorage Commit 4) ---
  const [productStates, setProductStates] = useState<Record<string, V2ProductState>>({})

  // --- Persistence state ---
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const hasSavedOnceRef = useRef(false)
  const hasHydratedRef = useRef(false)

  // --- Lifted pool filter state (Commit 3) ---
  const [poolFilter, setPoolFilter] = useState<V2RoleFilter>("all")

  // Reset filter when selected handle changes
  useEffect(() => {
    setPoolFilter("all")
  }, [selectedHandle])

  // --- Late hydrate: merge disk state without clobbering in-memory operator edits ---
  useEffect(() => {
    if (hasHydratedRef.current) return
    hasHydratedRef.current = true
    const persisted = loadV2PersistedState()
    if (!persisted) return
    setProductStates((prev) => mergeV2ProductStates(persisted.productStates, prev))
    setSelectedHandle((prev) => prev ?? persisted.selectedHandle)
    setSavedAt((prev) => prev ?? persisted.savedAt)
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
        const [invRes, candidatesRes, productsRes, recoveryRes] = await Promise.all([
          fetch(`${V1_API_BASE}/inventory`),
          fetch(`${V1_API_BASE}/candidates`),
          fetch(`${V1_API_BASE}/products`),
          fetch(`${V1_API_BASE}/preview-recovery`),
        ])

        if (!invRes.ok) throw new Error(`inventory: ${invRes.status} ${invRes.statusText}`)
        if (!candidatesRes.ok) throw new Error(`candidates: ${candidatesRes.status} ${candidatesRes.statusText}`)
        if (!productsRes.ok) throw new Error(`products: ${productsRes.status} ${productsRes.statusText}`)
        if (!recoveryRes.ok) throw new Error(`preview-recovery: ${recoveryRes.status} ${recoveryRes.statusText}`)

        const invJson = (await invRes.json()) as { items?: InvItem[] }
        const candidatesJson = (await candidatesRes.json()) as { entries?: CandidateEntry[] }
        const productsJson = (await productsRes.json()) as { products?: ProductRow[] }
        const recoveryJson = (await recoveryRes.json()) as { entries?: Record<string, LegacyMediaPreviewRecoveryEntry> }

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

        const recMap = new Map<string, LegacyMediaPreviewRecoveryEntry>()
        for (const [id, entry] of Object.entries(recoveryJson.entries ?? {})) {
          if (entry?.found_path) recMap.set(id, entry)
        }

        setProducts(prods)
        setInvById(byId)
        setCandidatesByHandle(byHandle)
        setEntryByInventoryId(entryById)
        setRecoveryById(recMap)
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

  // --- Derived: color variants (detected + operator − hidden, milk first) ---
  const colorVariants = useMemo<V2ColorVariant[]>(() => {
    if (!selectedHandle) return []
    const ids = candidatesByHandle.get(selectedHandle) ?? []
    return buildMergedColorVariants(
      selectedHandle,
      ids,
      invById,
      productStates[selectedHandle] ?? null
    )
  }, [selectedHandle, candidatesByHandle, invById, productStates])

  const removedVariants = useMemo(
    () => productStates[selectedHandle ?? ""]?.operatorVariantEdits?.removed ?? [],
    [selectedHandle, productStates]
  )

  const primaryVariantKey = useMemo(
    () => findMilkVariantKey(colorVariants),
    [colorVariants]
  )

  const realColorVariantKeys = useMemo(
    () => listRealColorVariantKeys(colorVariants),
    [colorVariants]
  )

  const realColorVariantLabels = useMemo(
    () => {
      const state = selectedHandle ? productStates[selectedHandle] ?? null : null
      return colorVariants
        .filter((v) => !isPseudoColorVariantKey(v.variantKey))
        .map((v) => displayLabelForVariant(v.variantKey, v.label, state))
    },
    [colorVariants, selectedHandle, productStates]
  )

  const activeVariantKey = useMemo<string>(() => {
    if (!selectedHandle || colorVariants.length === 0) return NEEDS_COLOR_VARIANT_KEY
    const state = productStates[selectedHandle]
    const saved = state?.activeVariantKey
    if (
      saved &&
      saved !== LEGACY_ALL_VARIANT_KEY &&
      colorVariants.some((v) => v.variantKey === saved)
    ) {
      return saved
    }
    return pickDefaultVariantKey(colorVariants, state ?? null)
  }, [selectedHandle, colorVariants, productStates])

  const isSharedColorlessTab = activeVariantKey === NEEDS_COLOR_VARIANT_KEY

  // When product or visible tabs change, ensure active tab is visible (milk default)
  useEffect(() => {
    if (!selectedHandle || colorVariants.length === 0) return
    const state = productStates[selectedHandle]
    const saved = state?.activeVariantKey
    const visible =
      saved &&
      saved !== LEGACY_ALL_VARIANT_KEY &&
      colorVariants.some((v) => v.variantKey === saved)
    if (visible) return
    const next = pickDefaultVariantKey(colorVariants, state ?? null)
    if (saved === next) return
    setProductStates((prev) => {
      const existing = prev[selectedHandle] ?? makeEmptyProductState(selectedHandle, next)
      if (existing.activeVariantKey === next) return prev
      return {
        ...prev,
        [selectedHandle]: { ...existing, activeVariantKey: next },
      }
    })
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

  const currentRoleOverrides = useMemo<Record<string, V2RoleSlot>>(
    () => currentProductState?.roleOverrides ?? {},
    [currentProductState]
  )

  const currentVariantRoles = useMemo(
    () => currentProductState?.rolesByVariant[activeVariantKey] ?? {},
    [currentProductState, activeVariantKey]
  )

  // --- Assignment state helpers ---
  const updateProductState = useCallback(
    (handle: string, variantKey: string, updater: (s: V2ProductState) => V2ProductState) => {
      setProductStates((prev) => {
        const existing = prev[handle] ?? makeEmptyProductState(handle, variantKey)
        const candidateIds = candidatesByHandle.get(handle) ?? []
        const updated = canonicalizeProductAssignmentIds(
          updater(existing),
          candidateIds,
          invById
        )
        return { ...prev, [handle]: updated }
      })
    },
    [candidatesByHandle, invById]
  )

  const handleSetVariant = useCallback(
    (variantKey: string) => {
      if (!selectedHandle) return
      updateProductState(selectedHandle, variantKey, (s) => {
        const healed = healVariantState(s, variantKey)
        return { ...healed, activeVariantKey: variantKey }
      })
    },
    [selectedHandle, updateProductState]
  )

  const handleSetMain = useCallback(
    (mediaId: string) => {
      if (!selectedHandle || isSharedColorlessTab) return
      updateProductState(selectedHandle, activeVariantKey, (s) =>
        syncAssignMain(s, activeVariantKey, mediaId)
      )
    },
    [selectedHandle, activeVariantKey, isSharedColorlessTab, updateProductState]
  )

  const handleRemoveMain = useCallback(() => {
    if (!selectedHandle) return
    updateProductState(selectedHandle, activeVariantKey, (s) =>
      syncClearMain(s, activeVariantKey)
    )
  }, [selectedHandle, activeVariantKey, updateProductState])

  const handleAddToGallery = useCallback(
    (mediaId: string) => {
      if (!selectedHandle) return
      updateProductState(selectedHandle, activeVariantKey, (s) =>
        isSharedColorlessTab && realColorVariantKeys.length > 0
          ? syncAddToGalleryAllRealVariants(s, realColorVariantKeys, mediaId)
          : syncAddToGallery(s, activeVariantKey, mediaId)
      )
    },
    [selectedHandle, activeVariantKey, isSharedColorlessTab, realColorVariantKeys, updateProductState]
  )

  const handleRemoveFromGallery = useCallback(
    (mediaId: string) => {
      if (!selectedHandle) return
      updateProductState(selectedHandle, activeVariantKey, (s) =>
        syncRemoveFromGallery(s, activeVariantKey, mediaId)
      )
    },
    [selectedHandle, activeVariantKey, updateProductState]
  )

  const handleFocusRole = useCallback(
    (slot: V2RoleSlot) => {
      setPoolFilter(SLOT_TO_FILTER[slot])
    },
    []
  )

  // Explicit role-slot assignment (drag & drop or picker)
  const handleSetRole = useCallback(
    (mediaId: string, slot: V2RoleSlot) => {
      if (!selectedHandle) return
      updateProductState(selectedHandle, activeVariantKey, (s) =>
        isSharedColorlessTab && realColorVariantKeys.length > 0 && slot !== "main"
          ? syncAssignRoleAllRealVariants(s, realColorVariantKeys, slot, mediaId)
          : syncAssignRole(s, activeVariantKey, slot, mediaId)
      )
    },
    [selectedHandle, activeVariantKey, isSharedColorlessTab, realColorVariantKeys, updateProductState]
  )

  const handleClearRole = useCallback(
    (slot: V2RoleSlot) => {
      if (!selectedHandle) return
      updateProductState(selectedHandle, activeVariantKey, (s) =>
        syncClearRole(s, activeVariantKey, slot)
      )
    },
    [selectedHandle, activeVariantKey, updateProductState]
  )

  // Operator visual-role override for a specific media item
  const handleSetVariantLabel = useCallback(
    (variantKey: string, label: string | null) => {
      if (!selectedHandle) return
      setProductStates((prev) => {
        const existing = prev[selectedHandle] ?? makeEmptyProductState(selectedHandle, variantKey)
        const overrides = { ...(existing.variantLabelOverrides ?? {}) }
        if (label === null) delete overrides[variantKey]
        else overrides[variantKey] = label
        const next = {
          ...prev,
          [selectedHandle]: { ...existing, variantLabelOverrides: overrides },
        }
        saveV2PersistedState(next, selectedHandle)
        setSavedAt(new Date().toISOString())
        return next
      })
    },
    [selectedHandle]
  )

  const handleAddVariant = useCallback(
    (label: string): { ok: boolean; key?: string; message?: string } => {
      if (!selectedHandle) return { ok: false, message: "Продукт не выбран." }
      const ids = candidatesByHandle.get(selectedHandle) ?? []
      const state = productStates[selectedHandle] ?? null
      const plan = planAddVariant(label, selectedHandle, ids, invById, state)
      if (!plan.ok) {
        if (plan.reason === "duplicate") {
          return {
            ok: false,
            key: plan.key,
            message: `Цвет «${plan.label}» уже есть (ключ ${plan.key}).`,
          }
        }
        return { ok: false, message: "Введите название цвета." }
      }
      updateProductState(selectedHandle, plan.key, (s) =>
        applyAddVariantToState(s, plan.key, label.trim())
      )
      return { ok: true, key: plan.key }
    },
    [selectedHandle, candidatesByHandle, invById, productStates, updateProductState]
  )

  const handleRemoveVariant = useCallback(
    (variantKey: string, label: string) => {
      if (!selectedHandle) return
      const ids = candidatesByHandle.get(selectedHandle) ?? []
      const variants = buildMergedColorVariants(
        selectedHandle,
        ids,
        invById,
        productStates[selectedHandle] ?? null
      )
      updateProductState(selectedHandle, activeVariantKey, (s) =>
        applyRemoveVariantToState(s, variantKey, label, variants)
      )
    },
    [selectedHandle, activeVariantKey, candidatesByHandle, invById, productStates, updateProductState]
  )

  const handleRestoreVariant = useCallback(
    (variantKey: string) => {
      if (!selectedHandle) return
      updateProductState(selectedHandle, variantKey, (s) => applyRestoreVariantToState(s, variantKey))
    },
    [selectedHandle, updateProductState]
  )

  const handleSetRoleOverride = useCallback(    (mediaId: string, role: V2RoleSlot | null) => {
      if (!selectedHandle) return
      updateProductState(selectedHandle, activeVariantKey, (s) => {
        const overrides = { ...(s.roleOverrides ?? {}) }
        if (role === null) {
          delete overrides[mediaId]
        } else {
          overrides[mediaId] = role
        }
        return { ...s, roleOverrides: overrides }
      })
    },
    [selectedHandle, activeVariantKey, updateProductState]
  )

  // Reorder the gallery array for the active variant
  const handleReorderGallery = useCallback(
    (fromIdx: number, toIdx: number) => {
      if (!selectedHandle) return
      updateProductState(selectedHandle, activeVariantKey, (s) =>
        syncReorderGallery(s, activeVariantKey, fromIdx, toIdx)
      )
    },
    [selectedHandle, activeVariantKey, updateProductState]
  )

  const handleInsertIntoGallery = useCallback(
    (mediaId: string, atIdx: number) => {
      if (!selectedHandle) return
      updateProductState(selectedHandle, activeVariantKey, (s) =>
        syncInsertIntoGallery(s, activeVariantKey, mediaId, atIdx)
      )
    },
    [selectedHandle, activeVariantKey, updateProductState]
  )

  // --- Reset: clear v2board LS + reset in-memory state ---
  const handleReset = useCallback(() => {
    setProductStates({})
    setSelectedHandle(null)
    setSavedAt(null)
    hasSavedOnceRef.current = false
    hasHydratedRef.current = false
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
        <span style={styles.buildBadge} data-v2-board-build-visible title={V2_BOARD_BUILD}>
          {V2_BOARD_BUILD_LABEL}
        </span>
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
        selectedHandle={selectedHandle}
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
                  const readiness = productReadiness(
                    productStates[p.handle],
                    p.handle,
                    candidatesByHandle,
                    invById
                  )
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
          primaryVariantKey={primaryVariantKey}
          productState={currentProductState}
          invById={invById}
          onSetVariant={handleSetVariant}
          onRemoveMain={handleRemoveMain}
          onRemoveFromGallery={handleRemoveFromGallery}
          onFocusRole={handleFocusRole}
          onSetRole={handleSetRole}
          onClearRole={handleClearRole}
          roleOverrides={currentRoleOverrides}
          onReorderGallery={handleReorderGallery}
          onAddToGallery={handleAddToGallery}
          onInsertIntoGallery={handleInsertIntoGallery}
          onSetVariantLabel={handleSetVariantLabel}
          onAddVariant={handleAddVariant}
          onRemoveVariant={handleRemoveVariant}
          onRestoreVariant={handleRestoreVariant}
          removedVariants={removedVariants}
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
          roleOverrides={currentRoleOverrides}
          onSetRoleOverride={handleSetRoleOverride}
          activeVariantKey={activeVariantKey}
          variantRoles={currentVariantRoles}
          recoveryById={recoveryById}
          realColorVariantKeys={realColorVariantKeys}
          realColorVariantLabels={realColorVariantLabels}
          galleriesByVariant={currentProductState?.galleriesByVariant ?? {}}
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
  buildBadge: {
    fontSize: "11px",
    fontWeight: 700,
    background: "#1a3a6e",
    border: "1px solid #0f2847",
    borderRadius: "4px",
    padding: "3px 8px",
    color: "#fff",
    letterSpacing: "0.02em",
    flexShrink: 0,
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
