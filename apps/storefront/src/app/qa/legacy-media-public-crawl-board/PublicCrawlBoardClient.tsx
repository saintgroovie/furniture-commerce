"use client"

import { useEffect, useMemo, useState } from "react"
import type {
  BoardFilters,
  ImageGroup,
  ProductGroup,
  PublicCrawlBoardApiResponse,
} from "./public-crawl-board-types"
import { DEFAULT_BOARD_FILTERS, LOW_CONFIDENCE_THRESHOLD, isSafeHttpUrl } from "./public-crawl-board-types"
import { buildSummaryIndex, groupCandidateRows } from "./public-crawl-board-grouping"

type LoadStatus = "idle" | "loading" | "loaded" | "error"

const PAGE_SIZE = 60

function imageSrc(legacySite: string, localImagePath: string): string {
  const params = new URLSearchParams({ site: legacySite, rel: localImagePath })
  return `/qa/legacy-media-public-crawl-board/api/image?${params.toString()}`
}

function toNumberOrNull(value: string): number | null {
  const n = Number(value)
  return Number.isFinite(n) && value.trim() !== "" ? n : null
}

function matchesSearch(group: ProductGroup, search: string): boolean {
  if (!search.trim()) return true
  const q = search.trim().toLowerCase()
  return (
    group.product_name.toLowerCase().includes(q) ||
    group.product_url.toLowerCase().includes(q) ||
    group.article_hint.toLowerCase().includes(q)
  )
}

function filterImages(images: ImageGroup[], filters: BoardFilters): ImageGroup[] {
  return images.filter((img) => {
    if (filters.role !== "all" && filters.role !== "no_image_found" && img.candidate_role_guess !== filters.role) {
      return false
    }
    if (filters.confidence === "low") {
      const conf = toNumberOrNull(img.confidence)
      if (conf === null || conf >= LOW_CONFIDENCE_THRESHOLD) return false
    }
    if (filters.duplicate === "duplicates_only" && img.duplicate_row_count <= 1) return false
    if (filters.suspicious === "suspicious_only" && !img.is_suspicious) return false
    return true
  })
}

function applyFilters(groups: ProductGroup[], filters: BoardFilters): { group: ProductGroup; visibleImages: ImageGroup[] }[] {
  const out: { group: ProductGroup; visibleImages: ImageGroup[] }[] = []
  for (const group of groups) {
    if (filters.site !== "all" && group.legacy_site !== filters.site) continue
    if (!matchesSearch(group, filters.search)) continue

    if (filters.role === "no_image_found") {
      if (group.has_no_image_found) out.push({ group, visibleImages: [] })
      continue
    }

    const visibleImages = filterImages(group.images, filters)
    const hasActiveImageFilter =
      filters.role !== "all" || filters.confidence !== "all" || filters.duplicate !== "all" || filters.suspicious !== "all"

    if (hasActiveImageFilter && visibleImages.length === 0) continue
    out.push({ group, visibleImages: hasActiveImageFilter ? visibleImages : group.images })
  }
  return out
}

function RoleBadge({ role }: { role: string }) {
  const label =
    role === "main_candidate"
      ? "main"
      : role === "gallery_candidate"
        ? "gallery"
        : role === "detail_candidate"
          ? "detail"
          : role === "no_image_found"
            ? "нет изображения"
            : role === "reject_candidate"
              ? "reject"
              : role
  return <span className={`pcb-badge pcb-badge-role pcb-role-${role}`}>{label}</span>
}

function ImageCard({ site, image }: { site: string; image: ImageGroup }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="pcb-image-card" data-suspicious={image.is_suspicious || undefined}>
      <div className="pcb-image-thumb">
        {!broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc(site, image.local_image_path)}
            alt={image.alt_text || image.title_text || ""}
            loading="lazy"
            onError={() => setBroken(true)}
          />
        ) : (
          <div className="pcb-image-broken">не найдено на диске</div>
        )}
      </div>
      <div className="pcb-image-meta">
        <RoleBadge role={image.candidate_role_guess} />
        <span className="pcb-confidence">conf {image.confidence}</span>
        {image.duplicate_row_count > 1 && (
          <span className="pcb-badge pcb-badge-dup" title={`Категории: ${image.category_hints.join(", ") || "—"}`}>
            ×{image.duplicate_row_count} дублей
          </span>
        )}
        {image.is_suspicious && (
          <span className="pcb-badge pcb-badge-suspicious" title={image.suspicious_reason ?? ""}>
            suspicious
          </span>
        )}
      </div>
      <div className="pcb-image-evidence">
        {image.evidence} · gallery_order={image.gallery_order || "—"}
      </div>
      {image.category_hints.length > 1 && (
        <div className="pcb-image-categories">категории: {image.category_hints.join(", ")}</div>
      )}
      {isSafeHttpUrl(image.image_url) ? (
        <a className="pcb-image-source-link" href={image.image_url} target="_blank" rel="noreferrer">
          исходный image_url ↗
        </a>
      ) : (
        <span className="pcb-image-source-link pcb-image-source-unsafe">image_url: {image.image_url || "—"}</span>
      )}
    </div>
  )
}

function ProductCard({
  group,
  visibleImages,
  expanded,
  onToggle,
}: {
  group: ProductGroup
  visibleImages: ImageGroup[]
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="pcb-product-card">
      <button type="button" className="pcb-product-header" onClick={onToggle}>
        <div className="pcb-product-header-main">
          <span className={`pcb-badge pcb-site-${group.legacy_site === "woodright-kids.ru" ? "kids" : "main"}`}>
            {group.legacy_site}
          </span>
          <span className="pcb-product-name">{group.product_name || "(без названия)"}</span>
        </div>
        <div className="pcb-product-header-meta">
          {group.has_no_image_found && <span className="pcb-badge pcb-badge-no-image">нет изображений</span>}
          {group.has_duplicates && <span className="pcb-badge pcb-badge-dup">дубли</span>}
          {group.has_suspicious && <span className="pcb-badge pcb-badge-suspicious">suspicious</span>}
          <span className="pcb-product-counts">
            {group.unique_image_count} img · {group.raw_row_count} rows · max conf {group.max_confidence ?? "—"}
          </span>
          <span className="pcb-expand-arrow">{expanded ? "▾" : "▸"}</span>
        </div>
      </button>
      {expanded && (
        <div className="pcb-product-body">
          <div className="pcb-product-fields">
            <span>category_hint: {group.category_hint || "—"}</span>
            <span>article_hint: {group.article_hint || "—"}</span>
            <span>
              product_url:{" "}
              {isSafeHttpUrl(group.product_url) ? (
                <a href={group.product_url} target="_blank" rel="noreferrer">
                  {group.product_url}
                </a>
              ) : (
                <span className="pcb-image-source-unsafe">{group.product_url || "—"}</span>
              )}
            </span>
          </div>
          {group.has_no_image_found && (
            <div className="pcb-no-image-notice">
              Краулер не нашёл изображений на странице товара (public-crawl, evidence=no_relation_found).
              Возможные причины: JS-рендеринг галереи, редирект, изменившийся URL. Требуется ручная проверка
              оператором по ссылке выше — это не «сломанная картинка», а зафиксированный факт краулера.
            </div>
          )}
          {visibleImages.length === 0 && !group.has_no_image_found && (
            <div className="pcb-no-image-notice">Нет изображений, соответствующих текущим фильтрам.</div>
          )}
          <div className="pcb-image-grid">
            {visibleImages.map((img) => (
              <ImageCard key={img.key} site={group.legacy_site} image={img} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PublicCrawlBoardClient() {
  const [status, setStatus] = useState<LoadStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<PublicCrawlBoardApiResponse | null>(null)
  const [filters, setFilters] = useState<BoardFilters>(DEFAULT_BOARD_FILTERS)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    setError(null)
    fetch("/qa/legacy-media-public-crawl-board/api/candidates")
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
        return json as PublicCrawlBoardApiResponse
      })
      .then((json) => {
        if (cancelled) return
        setData(json)
        setStatus("loaded")
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const groups = useMemo(() => {
    if (!data) return []
    const summaryIndex = buildSummaryIndex(data.products_summary)
    return groupCandidateRows(data.rows, summaryIndex)
  }, [data])

  const filtered = useMemo(() => applyFilters(groups, filters), [groups, filters])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [filters])

  const visible = filtered.slice(0, visibleCount)

  function updateFilter<K extends keyof BoardFilters>(key: K, value: BoardFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function toggleExpanded(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="pcb-root">
      <header className="pcb-header">
        <h1>Legacy Media — Public Crawl Board (preview, read-only)</h1>
        <p className="pcb-subtitle">
          Read-only preview прототип public-crawl candidate pack. Ничего не сохраняется, decisions не пишутся,
          apply не выполняется. Codex verdict плана: <code>safe_to_implement_lightweight_public_crawl_board</code>.
        </p>
        {status === "loaded" && data && (
          <p className="pcb-source-info">
            Источник: <code>{data.candidate_pack_dir}</code> · kids rows: {data.meta.kids_rows} · woodright rows:{" "}
            {data.meta.woodright_rows} · suspicious loaded: {data.meta.suspicious_rows_loaded} · товаров: {groups.length}
          </p>
        )}
      </header>

      {status === "loading" && <div className="pcb-status">Загрузка candidate pack…</div>}
      {status === "error" && (
        <div className="pcb-status pcb-status-error">
          Ошибка загрузки: {error}. Проверьте, что private export root доступен и переменная
          <code> WOODRIGHT_PUBLIC_CRAWL_EXPORT_ROOT</code> (если задана) указывает на корректный путь.
        </div>
      )}

      {status === "loaded" && (
        <>
          <div className="pcb-filters">
            <label>
              Сайт:
              <select value={filters.site} onChange={(e) => updateFilter("site", e.target.value as BoardFilters["site"])}>
                <option value="all">все</option>
                <option value="woodright-kids.ru">woodright-kids.ru</option>
                <option value="woodright.ru">woodright.ru</option>
              </select>
            </label>
            <label>
              Роль:
              <select value={filters.role} onChange={(e) => updateFilter("role", e.target.value as BoardFilters["role"])}>
                <option value="all">все</option>
                <option value="main_candidate">main_candidate</option>
                <option value="gallery_candidate">gallery_candidate</option>
                <option value="detail_candidate">detail_candidate</option>
                <option value="no_image_found">no_image_found</option>
              </select>
            </label>
            <label>
              Confidence:
              <select
                value={filters.confidence}
                onChange={(e) => updateFilter("confidence", e.target.value as BoardFilters["confidence"])}
              >
                <option value="all">все</option>
                <option value="low">низкая (&lt; {LOW_CONFIDENCE_THRESHOLD})</option>
              </select>
            </label>
            <label>
              Дубли:
              <select
                value={filters.duplicate}
                onChange={(e) => updateFilter("duplicate", e.target.value as BoardFilters["duplicate"])}
              >
                <option value="all">все</option>
                <option value="duplicates_only">только дубли</option>
              </select>
            </label>
            <label>
              Suspicious/tiny:
              <select
                value={filters.suspicious}
                onChange={(e) => updateFilter("suspicious", e.target.value as BoardFilters["suspicious"])}
              >
                <option value="all">все</option>
                <option value="suspicious_only">только suspicious</option>
              </select>
            </label>
            <label className="pcb-search">
              Поиск:
              <input
                type="text"
                placeholder="название / URL / article_hint"
                value={filters.search}
                onChange={(e) => updateFilter("search", e.target.value)}
              />
            </label>
          </div>

          <div className="pcb-result-count">
            Показано {visible.length} из {filtered.length} товаров (после фильтров), всего в pack: {groups.length}
          </div>

          <div className="pcb-product-list">
            {visible.map(({ group, visibleImages }) => (
              <ProductCard
                key={group.key}
                group={group}
                visibleImages={visibleImages}
                expanded={expandedKeys.has(group.key)}
                onToggle={() => toggleExpanded(group.key)}
              />
            ))}
          </div>

          {visibleCount < filtered.length && (
            <button type="button" className="pcb-load-more" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
              Показать ещё ({filtered.length - visibleCount} осталось)
            </button>
          )}
        </>
      )}
    </div>
  )
}
