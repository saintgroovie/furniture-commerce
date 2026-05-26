"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import type { InvItem, CandidateEntry, V2RoleFilter, V2RoleSlot } from "./legacy-board-v2-types"
import type { VisualRole } from "@/app/qa/legacy-media-assignment-board/legacy-media-visual-role-ranking"
import {
  effectiveV2Filter,
  inferV2VisualRole,
} from "./legacy-board-v2-role-inference"
import { RoleFilterTabs } from "./RoleFilterTabs"
import { MediaCardV2 } from "./MediaCardV2"
import type { LegacyMediaPreviewRecoveryEntry } from "@/lib/qa/legacy-media-preview-recovery-types"
import {
  isEffectivePreviewable,
  isStaticEffectivePreviewable,
} from "./legacy-board-v2-pool-preview"
import {
  classifyMediaVariantScope,
  isMediaInAllRealVariantGalleries,
  mediaMatchesVariantKey,
  NEEDS_COLOR_VARIANT_KEY,
  SHARED_COLORLESS_POOL_HINT_RU,
  type MediaVariantScope,
} from "./legacy-board-v2-color-variants"
import { resolvePoolUsageStatus } from "./legacy-board-v2-gallery-source"
import type { V2VariantRoleAssignment } from "./legacy-board-v2-types"

const POOL_LIMIT = 120

const SCOPE_SORT_ORDER: Record<MediaVariantScope, number> = {
  active: 0,
  neutral: 1,
  other_color: 2,
}

function itemShowsAsPreview(
  item: PoolItem,
  runtimeFailedIds: ReadonlySet<string>,
  recoveryById?: ReadonlyMap<string, LegacyMediaPreviewRecoveryEntry>
): boolean {
  return isEffectivePreviewable(item.inv, runtimeFailedIds, recoveryById)
}

/** Preview-first: previewable cards, then no-preview; scope only within each tier (not assignment). */
export function sortPoolPreviewFirst(
  items: PoolItem[],
  productHandle: string | null,
  variantKey: string,
  _currentMainId?: string | null,
  _gallerySet?: Set<string>,
  runtimeFailedIds?: ReadonlySet<string>,
  recoveryById?: ReadonlyMap<string, LegacyMediaPreviewRecoveryEntry>
): PoolItem[] {
  const failed = runtimeFailedIds ?? new Set<string>()
  return [...items].sort((a, b) => {
    const aPreview = itemShowsAsPreview(a, failed, recoveryById)
    const bPreview = itemShowsAsPreview(b, failed, recoveryById)
    if (aPreview !== bPreview) return aPreview ? -1 : 1
    if (productHandle && variantKey !== "__all__") {
      const sa = classifyMediaVariantScope(a.inv, productHandle, variantKey)
      const sb = classifyMediaVariantScope(b.inv, productHandle, variantKey)
      const scopeDiff = SCOPE_SORT_ORDER[sa] - SCOPE_SORT_ORDER[sb]
      if (scopeDiff !== 0) return scopeDiff
    }
    return a.inv.filename.localeCompare(b.inv.filename, "ru")
  })
}

type PoolItem = {
  inv: InvItem
  role: VisualRole
  roleConfidence: "high" | "low" | "ambiguous"
  confidence: string | undefined
  identityConfidence: string | undefined
  /** Static effective preview (see legacy-board-v2-pool-preview.ts) */
  staticEffectivePreview: boolean
  /** Effective pool filter: override → v2 inference */
  effectiveFilter: V2RoleFilter
}

type Props = {
  selectedHandle: string | null
  invById: Map<string, InvItem>
  candidatesByHandle: Map<string, string[]>
  entryByInventoryId: Map<string, CandidateEntry>
  activeFilter: V2RoleFilter
  onSetFilter: (f: V2RoleFilter) => void
  onSetMain: (mediaId: string) => void
  onAddToGallery: (mediaId: string) => void
  /** ID of the current main/thumbnail for the active variant */
  currentMainId?: string | null
  /** IDs already in the gallery for the active variant */
  currentGalleryIds?: string[]
  /** Operator role overrides keyed by media ID */
  roleOverrides?: Record<string, V2RoleSlot>
  /** Called when operator changes a media item's role override */
  onSetRoleOverride?: (mediaId: string, role: V2RoleSlot | null) => void
  /** Active color tab — pool badges use only this variant's assignments */
  activeVariantKey?: string
  /** Real color variant keys (for shared colorless gallery replication UI) */
  realColorVariantKeys?: string[]
  /** Human labels for real color variants (for visible confirmation) */
  realColorVariantLabels?: string[]
  /** Full product galleries map — needed for shared colorless usage state */
  galleriesByVariant?: Record<string, string[]>
  /** Role slots for active variant (for transparent pool status) */
  variantRoles?: V2VariantRoleAssignment
  /** QA preview-recovery entries (v1 API) keyed by inventory id */
  recoveryById?: ReadonlyMap<string, LegacyMediaPreviewRecoveryEntry>
}

/** Role label used in empty-filter message */
const FILTER_LABEL_RU: Partial<Record<V2RoleFilter, string>> = {
  front: "Фронт",
  "3_4": "3/4",
  interior: "Внутри",
  detail: "Деталь",
  lifestyle: "Lifestyle",
  scheme: "Схема",
  no_preview: "Без превью",
  unused: "Свободные",
  selected: "Выбранные",
}

export function MediaPoolPanel({
  selectedHandle,
  invById,
  candidatesByHandle,
  entryByInventoryId,
  activeFilter,
  onSetFilter,
  onSetMain,
  onAddToGallery,
  currentMainId,
  currentGalleryIds,
  roleOverrides,
  onSetRoleOverride,
  activeVariantKey = "__all__",
  realColorVariantKeys = [],
  realColorVariantLabels = [],
  galleriesByVariant = {},
  variantRoles = {},
  recoveryById,
}: Props) {
  const [hideNoPreview, setHideNoPreview] = useState(false)
  const [runtimeFailedIds, setRuntimeFailedIds] = useState<Set<string>>(() => new Set())
  const [sharedAddNotice, setSharedAddNotice] = useState<string | null>(null)

  useEffect(() => {
    setSharedAddNotice(null)
  }, [selectedHandle, activeVariantKey])

  useEffect(() => {
    setRuntimeFailedIds(new Set())
  }, [selectedHandle, activeVariantKey])

  const handlePreviewLoadFailed = useCallback((mediaId: string) => {
    setRuntimeFailedIds((prev) => {
      if (prev.has(mediaId)) return prev
      const next = new Set(prev)
      next.add(mediaId)
      return next
    })
  }, [])

  const sharedColorlessMode = activeVariantKey === NEEDS_COLOR_VARIANT_KEY
  const mainActionDisabledTitle = "Главное назначается на конкретном цвете"
  const hideNoPreviewContradiction = hideNoPreview && activeFilter === "no_preview"

  function resolveCardUsage(item: PoolItem, scope: MediaVariantScope) {
    const mediaId = item.inv.id
    if (sharedColorlessMode && realColorVariantKeys.length > 0) {
      const inAllGalleries = isMediaInAllRealVariantGalleries(
        galleriesByVariant,
        mediaId,
        realColorVariantKeys
      )
      const usage = resolvePoolUsageStatus(mediaId, variantRoles, [], scope)
      let statusLine = usage.statusLine
      if (inAllGalleries) {
        statusLine = "✓ Во всех галереях"
      } else if (scope === "neutral" || scope === "active") {
        statusLine = statusLine || "общий кадр"
      }
      return {
        ...usage,
        isMain: false,
        isInGallery: inAllGalleries,
        poolMuted: false,
        statusLine,
      }
    }
    return resolvePoolUsageStatus(
      mediaId,
      variantRoles,
      currentGalleryIds ?? [],
      scope
    )
  }

  const handleGalleryAdd = useCallback(
    (mediaId: string) => {
      onAddToGallery(mediaId)
      if (sharedColorlessMode && realColorVariantLabels.length > 0) {
        setSharedAddNotice(`Добавлено в конец галерей: ${realColorVariantLabels.join(", ")}`)
      }
    },
    [onAddToGallery, sharedColorlessMode, realColorVariantLabels]
  )

  const sharedGalleryButtonLabel = sharedColorlessMode ? "+ Во все галереи" : undefined
  const poolItems = useMemo<PoolItem[]>(() => {
    if (!selectedHandle) return []
    const ids = candidatesByHandle.get(selectedHandle) ?? []
    const overrides = roleOverrides ?? {}
    const withPreview: PoolItem[] = []
    const noPreview: PoolItem[] = []
    for (const id of ids) {
      const inv = invById.get(id)
      if (!inv) continue
      const entry = entryByInventoryId.get(id)
      const inferred = inferV2VisualRole(inv, { productHandle: selectedHandle })
      const effectiveFilter = effectiveV2Filter(inv, overrides, { productHandle: selectedHandle })
      const staticEffectivePreview = isStaticEffectivePreviewable(inv, recoveryById)
      const item: PoolItem = {
        inv,
        role: inferred.role,
        roleConfidence: inferred.confidence,
        confidence: entry?.confidence,
        identityConfidence: entry?.identity_confidence,
        staticEffectivePreview,
        effectiveFilter,
      }
      if (staticEffectivePreview) withPreview.push(item)
      else noPreview.push(item)
    }
    return [...withPreview, ...noPreview]
  }, [selectedHandle, invById, candidatesByHandle, entryByInventoryId, roleOverrides, recoveryById])

  const effectivePreviewableCount = useMemo(
    () => poolItems.filter((i) => itemShowsAsPreview(i, runtimeFailedIds, recoveryById)).length,
    [poolItems, runtimeFailedIds, recoveryById]
  )
  const effectiveNoPreviewCount = useMemo(
    () => poolItems.length - effectivePreviewableCount,
    [poolItems, effectivePreviewableCount]
  )

  // Sets for fast membership checks
  const gallerySet = useMemo(() => new Set(currentGalleryIds ?? []), [currentGalleryIds])

  // Count per filter (for tab badges)
  const filterCounts = useMemo<Partial<Record<V2RoleFilter, number>>>(() => {
    const counts: Partial<Record<V2RoleFilter, number>> = { all: poolItems.length }
    for (const item of poolItems) {
      const f = item.effectiveFilter
      if (f !== "all") counts[f] = (counts[f] ?? 0) + 1
    }
    if (effectiveNoPreviewCount > 0) counts["no_preview"] = effectiveNoPreviewCount

    // Usage-state counts
    const selectedCount = poolItems.filter((i) => {
      if (!selectedHandle || !mediaMatchesVariantKey(i.inv, selectedHandle, activeVariantKey)) {
        return false
      }
      return i.inv.id === (currentMainId ?? null) || gallerySet.has(i.inv.id)
    }).length
    counts["selected"] = selectedCount
    counts["unused"] = poolItems.length - selectedCount

    return counts
  }, [poolItems, effectiveNoPreviewCount, currentMainId, gallerySet, selectedHandle, activeVariantKey])

  // Apply filter, then preview-first sort (scope is secondary inside preview tier only)
  const filteredItems = useMemo<PoolItem[]>(() => {
    if (hideNoPreviewContradiction) return []

    let items = poolItems

    if (hideNoPreview) {
      items = items.filter((i) => itemShowsAsPreview(i, runtimeFailedIds, recoveryById))
    }

    if (activeFilter === "no_preview") {
      items = items.filter((i) => !itemShowsAsPreview(i, runtimeFailedIds, recoveryById))
    } else if (activeFilter === "unused") {
      items = items.filter(
        (i) => i.inv.id !== (currentMainId ?? null) && !gallerySet.has(i.inv.id)
      )
    } else if (activeFilter === "selected") {
      items = items.filter(
        (i) => i.inv.id === (currentMainId ?? null) || gallerySet.has(i.inv.id)
      )
    } else if (activeFilter !== "all") {
      items = items.filter((i) => i.effectiveFilter === activeFilter)
    }

    return sortPoolPreviewFirst(
      items,
      selectedHandle,
      activeVariantKey,
      currentMainId,
      gallerySet,
      runtimeFailedIds,
      recoveryById
    )
  }, [
    poolItems,
    activeFilter,
    hideNoPreview,
    hideNoPreviewContradiction,
    currentMainId,
    gallerySet,
    selectedHandle,
    activeVariantKey,
    runtimeFailedIds,
    recoveryById,
  ])

  const noPreviewSeparatorIdx = useMemo(() => {
    if (hideNoPreview || activeFilter === "no_preview") return -1
    const idx = filteredItems.findIndex((i) => !itemShowsAsPreview(i, runtimeFailedIds, recoveryById))
    return idx >= 0 ? idx : -1
  }, [filteredItems, hideNoPreview, activeFilter, runtimeFailedIds, recoveryById])

  const filteredNoPreviewCount = useMemo(
    () => filteredItems.filter((i) => !itemShowsAsPreview(i, runtimeFailedIds, recoveryById)).length,
    [filteredItems, runtimeFailedIds, recoveryById]
  )

  const renderedItems = useMemo(() => {
    let items = filteredItems
    if (hideNoPreview) {
      items = items.filter((i) => itemShowsAsPreview(i, runtimeFailedIds, recoveryById))
    }
    return items.slice(0, POOL_LIMIT)
  }, [filteredItems, hideNoPreview, runtimeFailedIds, recoveryById])

  const total = filteredItems.length
  const totalAll = poolItems.length

  if (!selectedHandle) {
    return (
      <aside style={styles.panel}>
        <div style={styles.panelHeader}>Media pool</div>
        <div style={styles.empty}>Выберите продукт в левой панели.</div>
      </aside>
    )
  }

  // Rich count bar text
  const countBarText = (() => {
    if (totalAll === 0) return "Нет кандидатов для этого продукта."
    if (hideNoPreviewContradiction) {
      return "«Скрыть без превью» включено — фильтр «Без превью» недоступен."
    }
    if (activeFilter === "all") {
      if (hideNoPreview) {
        return `${totalAll} фото · ${effectivePreviewableCount} с превью · 0 без превью (скрыто ${effectiveNoPreviewCount})`
      }
      return `${totalAll} фото · ${effectivePreviewableCount} с превью · ${effectiveNoPreviewCount} без превью`
    }
    if (hideNoPreview) {
      return `Показано ${renderedItems.length} из ${total} · только с превью (скрыто ${effectiveNoPreviewCount})`
    }
    return `Показано ${renderedItems.length} из ${total} (всего ${totalAll})`
  })()

  return (
    <aside style={styles.panel}>
      {/* ── Sticky top: header + filters + toggles ── */}
      <div style={styles.poolStickyTop}>
        <div style={styles.panelHeader}>
          <span>Media pool</span>
          <span style={styles.handleChip}>{selectedHandle}</span>
        </div>

        <RoleFilterTabs
          activeFilter={activeFilter}
          counts={filterCounts}
          onFilter={onSetFilter}
        />

        {sharedColorlessMode && (
          <div style={styles.sharedPoolHint} data-v2-pool-shared-hint>
            {SHARED_COLORLESS_POOL_HINT_RU}
          </div>
        )}

        {sharedAddNotice && (
          <div style={styles.sharedAddNotice} data-v2-pool-shared-notice role="status">
            {sharedAddNotice}
          </div>
        )}

        {/* Hide-no-preview toggle */}
        <label
          style={styles.toggleRow}
          data-v2-pool-hide-no-preview={hideNoPreview ? "true" : "false"}
        >
          <input
            type="checkbox"
            checked={hideNoPreview}
            onChange={(e) => setHideNoPreview(e.target.checked)}
            style={styles.toggleCheck}
            data-v2-pool-hide-no-preview-input
          />
          <span style={styles.toggleLabel}>Скрыть без превью</span>
          {effectiveNoPreviewCount > 0 && (
            <span style={styles.toggleCount}>{effectiveNoPreviewCount}</span>
          )}
        </label>

        <div style={styles.countBar}>{countBarText}</div>
      </div>

      {/* ── Scrollable pool body ── */}
      <div style={styles.poolScroll}>
        {/* Empty filter — helpful message + reset */}
        {renderedItems.length === 0 && totalAll > 0 && (
          <div style={styles.emptyFilter}>
            <div style={styles.emptyFilterTitle}>
              {hideNoPreviewContradiction
                ? "Скрыть без превью включён — карточки без превью скрыты. Снимите галочку или переключитесь на «Все»."
                : hideNoPreview && activeFilter === "no_preview"
                ? "Скрыть без превью включён — карточки без превью скрыты."
                : activeFilter === "selected"
                ? "Ни одного элемента не назначено — сначала выберите главное или добавьте в галерею."
                : activeFilter === "unused"
                ? "Все элементы уже назначены."
                : `Для роли «${FILTER_LABEL_RU[activeFilter] ?? activeFilter}» кандидатов не найдено.`}
            </div>
            <div style={styles.emptyFilterHint}>
              Попробуйте «Все» или назначьте роль вручную позже.
            </div>
            <button style={styles.resetBtn} onClick={() => onSetFilter("all")}>
              ← Сбросить фильтр
            </button>
          </div>
        )}

        <div style={styles.grid} data-v2-pool-grid>
          {renderedItems.map((item, idx) => {
            const showsAsPreview = itemShowsAsPreview(item, runtimeFailedIds, recoveryById)
            if (hideNoPreview && !showsAsPreview) return null
            const showNoPreviewSeparator =
              !hideNoPreview &&
              idx === noPreviewSeparatorIdx &&
              filteredNoPreviewCount > 0
            const scope =
              selectedHandle
                ? classifyMediaVariantScope(item.inv, selectedHandle, activeVariantKey)
                : "active"
            const usage = resolveCardUsage(item, scope)
            const usageLine =
              !showsAsPreview && usage.statusLine
                ? usage.statusLine
                : usage.statusLine || (!showsAsPreview ? "без превью" : undefined)
            return (
              <React.Fragment key={item.inv.id}>
                {showNoPreviewSeparator && (
                  <div
                    style={styles.separator}
                    data-v2-pool-no-preview-separator
                  >
                    <span style={styles.separatorLabel}>
                      Без превью · {filteredNoPreviewCount}
                    </span>
                  </div>
                )}
                <MediaCardV2
                  inv={item.inv}
                  role={item.role}
                  roleConfidence={item.roleConfidence}
                  confidence={item.confidence}
                  identityConfidence={item.identityConfidence}
                  selectedHandle={selectedHandle}
                  onSetMain={onSetMain}
                  onAddToGallery={handleGalleryAdd}
                  showsAsPreview={showsAsPreview}
                  onPreviewLoadFailed={handlePreviewLoadFailed}
                  onPreviewLoadFailure={handlePreviewLoadFailed}
                  isMain={usage.isMain}
                  isInGallery={usage.isInGallery}
                  poolUsageLine={usageLine}
                  poolMuted={usage.poolMuted}
                  isDimmed={false}
                  roleOverride={(roleOverrides ?? {})[item.inv.id] ?? null}
                  onSetRoleOverride={onSetRoleOverride}
                  previewRecovery={recoveryById?.get(item.inv.id) ?? null}
                  mainActionDisabled={sharedColorlessMode}
                  mainActionDisabledTitle={mainActionDisabledTitle}
                  galleryButtonLabel={sharedGalleryButtonLabel}
                />
              </React.Fragment>
            )
          })}
        </div>

        {total > POOL_LIMIT && (
          <div style={styles.capNote}>
            Показаны первые {POOL_LIMIT} из {total}. Используйте фильтры для сужения выборки.
          </div>
        )}
      </div>
    </aside>
  )
}

const styles = {
  panel: {
    borderLeft: "1px solid #ddd",
    overflow: "hidden" as const,
    background: "#fff",
    display: "flex",
    flexDirection: "column" as const,
  },
  poolStickyTop: {
    flexShrink: 0,
  },
  poolScroll: {
    flex: 1,
    overflowY: "auto" as const,
    minHeight: 0,
  },
  panelHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "9px 14px",
    fontWeight: 700,
    fontSize: "11px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "#333",
    borderBottom: "1px solid #eee",
    background: "#f5f5f5",
    flexShrink: 0,
  },
  handleChip: {
    fontSize: "11px",
    background: "#e8f0ff",
    color: "#1a3a6e",
    borderRadius: "4px",
    padding: "1px 6px",
    fontWeight: 600,
    textTransform: "none" as const,
    letterSpacing: 0,
  },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "5px 12px",
    borderBottom: "1px solid #f0f0f0",
    cursor: "pointer",
    flexShrink: 0,
    userSelect: "none" as const,
  },
  toggleCheck: {
    cursor: "pointer",
    flexShrink: 0,
  },
  toggleLabel: {
    fontSize: "11px",
    color: "#555",
    flex: 1,
  },
  toggleCount: {
    fontSize: "10px",
    background: "#e8e8e8",
    color: "#666",
    borderRadius: "8px",
    padding: "0 5px",
    fontWeight: 600,
  },
  countBar: {
    padding: "5px 12px",
    fontSize: "11px",
    color: "#666",
    borderBottom: "1px solid #f0f0f0",
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums" as const,
  },
  sharedPoolHint: {
    margin: "0",
    padding: "8px 12px",
    fontSize: "11px",
    lineHeight: 1.45,
    color: "#2a4468",
    background: "#eef3fb",
    borderBottom: "1px solid #d4e0f4",
    fontWeight: 500,
  },
  sharedAddNotice: {
    margin: "0",
    padding: "8px 12px",
    fontSize: "11px",
    lineHeight: 1.4,
    color: "#1b5e20",
    background: "#e8f5e9",
    borderBottom: "1px solid #a5d6a7",
    fontWeight: 600,
  },
  empty: {
    padding: "20px 14px",
    color: "#aaa",
    fontSize: "13px",
  },
  emptyFilter: {
    padding: "16px 16px 18px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "6px",
    borderBottom: "1px solid #f0f0f0",
    background: "#fafafa",
  },
  emptyFilterTitle: {
    fontSize: "13px",
    color: "#555",
    fontWeight: 500,
  },
  emptyFilterHint: {
    fontSize: "12px",
    color: "#aaa",
  },
  resetBtn: {
    alignSelf: "flex-start" as const,
    marginTop: "4px",
    padding: "5px 12px",
    fontSize: "12px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    background: "#fff",
    color: "#1a3a6e",
    cursor: "pointer",
    fontWeight: 600,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "5px",
    padding: "6px",
    alignItems: "start",
    // No overflowY here — let the parent aside scroll (double scroll-container bug)
  },
  separator: {
    gridColumn: "1 / -1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "20px",
    maxHeight: "24px",
    padding: "2px 0",
    margin: "2px 0 0",
  },
  separatorLabel: {
    fontSize: "10px",
    lineHeight: "16px",
    color: "#999",
    fontWeight: 600,
    letterSpacing: "0.03em",
    padding: "0 8px",
    background: "#f5f5f5",
    borderRadius: "8px",
    border: "1px solid #e8e8e8",
  },
  capNote: {
    padding: "8px 12px",
    fontSize: "11px",
    color: "#aaa",
    borderTop: "1px solid #f0f0f0",
    flexShrink: 0,
  },
} as const
