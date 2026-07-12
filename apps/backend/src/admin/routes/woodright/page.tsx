import { useEffect, useMemo, useRef, useState } from "react"
import { Link, Navigate, useSearchParams } from "react-router-dom"
import { Badge, Button, Container, Heading, Input, Text } from "@medusajs/ui"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { readWoodrightAdminUxFlagFromBrowser } from "../../lib/woodright/browser-flag"
import {
  stockAdminHomePath,
  stockAdminProductCreatePath,
  stockAdminProductsPath,
  stockAdminPromotionsPath,
} from "../../lib/woodright/stock-admin"
import {
  fetchDraftProductCount,
  fetchPublishedProductsPage,
  fetchRecentProducts,
  fetchRecentPromotions,
  searchAdminProducts,
  type DashboardProductHit,
  type DashboardPromotionHit,
} from "../../lib/woodright/dashboard-api"
import {
  buildDraftCounterVM,
  buildPaginationVM,
  buildThumbnailSampleVM,
  countMissingThumbnails,
  listMissingThumbnailHits,
  pickFirstSku,
  planSamplePages,
  productStatusLabel,
  type DraftCounterVM,
  type MissingThumbnailHit,
  type ThumbnailSampleVM,
} from "../../lib/woodright/dashboard-model"
import { UI_COPY } from "../../lib/woodright/ui-copy"
import { woodrightWorkspacePath } from "../../lib/product-workspace/admin-api"
import {
  woodrightPromotionNewPath,
  woodrightPromotionPath,
} from "../../lib/promotions/api"

const SEARCH_PAGE_SIZE = 20
const SAMPLE_PAGE_SIZE = 50
const SAMPLE_MAX_PAGES = 3
const SEARCH_DEBOUNCE_MS = 400

type TechIssue = { source: string; detail: string }

const WoodrightDashboardPage = () => {
  const flagOn = readWoodrightAdminUxFlagFromBrowser()
  const [searchParams, setSearchParams] = useSearchParams()

  // «Требуют внимания»
  const [draftVM, setDraftVM] = useState<DraftCounterVM | null>(null)
  const [thumbVM, setThumbVM] = useState<ThumbnailSampleVM | null>(null)
  const [missingThumbs, setMissingThumbs] = useState<MissingThumbnailHit[]>([])
  const [attentionLoading, setAttentionLoading] = useState(true)

  // «Недавние» — hidden entirely when the API rejects order=-updated_at
  const [recentProducts, setRecentProducts] = useState<DashboardProductHit[] | null>(null)
  const [recentPromotions, setRecentPromotions] = useState<DashboardPromotionHit[] | null>(
    null
  )

  // Support-only diagnostics (collapsed)
  const [lastFetchAt, setLastFetchAt] = useState<string | null>(null)
  const [techIssues, setTechIssues] = useState<TechIssue[]>([])

  // «Поиск» — q is mirrored into the URL so a dashboard link can be shared
  const initialQuery = searchParams.get("q") ?? ""
  const [query, setQuery] = useState(initialQuery)
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery)
  const [searchOffset, setSearchOffset] = useState(0)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<DashboardProductHit[]>([])
  const [searchCount, setSearchCount] = useState(0)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const pushTechIssue = (source: string, status: number) => {
    setTechIssues((prev) => [...prev, { source, detail: `HTTP ${status}` }])
  }

  // Counters + recents: one bounded load on mount.
  useEffect(() => {
    if (!flagOn) return
    const ac = new AbortController()
    setAttentionLoading(true)

    ;(async () => {
      const draftRes = await fetchDraftProductCount({ signal: ac.signal }).catch(
        () => ({ status: 0, body: null }) as const
      )
      if (ac.signal.aborted) return
      if ("count" in draftRes) {
        setDraftVM(buildDraftCounterVM(draftRes.count))
      } else {
        pushTechIssue("/admin/products?status=draft", draftRes.status)
      }

      // Published-without-thumbnail: bounded sample, never the whole catalog.
      try {
        const first = await fetchPublishedProductsPage(
          { limit: SAMPLE_PAGE_SIZE, offset: 0 },
          { signal: ac.signal }
        )
        if (ac.signal.aborted) return
        if ("status" in first) {
          pushTechIssue("/admin/products?status=published", first.status)
        } else {
          const pages = planSamplePages({
            total: first.count,
            pageSize: SAMPLE_PAGE_SIZE,
            maxPages: SAMPLE_MAX_PAGES,
          })
          const sampled = [...first.products]
          for (let page = 1; page < pages; page++) {
            const next = await fetchPublishedProductsPage(
              { limit: SAMPLE_PAGE_SIZE, offset: page * SAMPLE_PAGE_SIZE },
              { signal: ac.signal }
            )
            if (ac.signal.aborted) return
            if ("status" in next) break
            sampled.push(...next.products)
          }
          setThumbVM(
            buildThumbnailSampleVM({
              checked: sampled.length,
              missing: countMissingThumbnails(sampled),
              total: first.count,
            })
          )
          setMissingThumbs(listMissingThumbnailHits(sampled, 5))
        }
      } catch {
        /* network failure — the block shows a dash */
      }

      const [prodRes, promoRes] = await Promise.all([
        fetchRecentProducts(5, { signal: ac.signal }).catch(
          () => ({ status: 0, body: null }) as const
        ),
        fetchRecentPromotions(5, { signal: ac.signal }).catch(
          () => ({ status: 0, body: null }) as const
        ),
      ])
      if (ac.signal.aborted) return
      setRecentProducts("products" in prodRes ? prodRes.products : null)
      setRecentPromotions("promotions" in promoRes ? promoRes.promotions : null)

      setLastFetchAt(new Date().toISOString())
      setAttentionLoading(false)
    })()

    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flagOn])

  // Debounce the query and mirror it into ?q= (preserving other params).
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query)
      setSearchOffset(0)
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (query.trim()) next.set("q", query)
          else next.delete("q")
          return next
        },
        { replace: true }
      )
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => {
    if (!flagOn || !debouncedQuery.trim()) {
      setSearchResults([])
      setSearchCount(0)
      setSearchError(null)
      return
    }
    const ac = new AbortController()
    setSearchLoading(true)
    setSearchError(null)
    ;(async () => {
      try {
        const res = await searchAdminProducts(
          { q: debouncedQuery, limit: SEARCH_PAGE_SIZE, offset: searchOffset },
          { signal: ac.signal }
        )
        if (ac.signal.aborted) return
        if ("status" in res) {
          setSearchError("Поиск временно недоступен - повторите позже")
          pushTechIssue("/admin/products?q=", res.status)
          setSearchResults([])
          return
        }
        setSearchResults(res.products)
        setSearchCount(res.count)
      } catch {
        if (ac.signal.aborted) return
        setSearchError("Нет связи с сервером - проверьте сеть и повторите")
      } finally {
        if (!ac.signal.aborted) setSearchLoading(false)
      }
    })()
    return () => ac.abort()
  }, [flagOn, debouncedQuery, searchOffset])

  const pagination = useMemo(
    () =>
      buildPaginationVM({
        count: searchCount,
        offset: searchOffset,
        limit: SEARCH_PAGE_SIZE,
      }),
    [searchCount, searchOffset]
  )

  if (!flagOn) {
    // Flag-off: send operators to stock Admin — no developer stub as primary UI.
    return <Navigate to={stockAdminHomePath()} replace />
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <Heading level="h1">{UI_COPY.dashboardTitle}</Heading>
        <Text size="small" className="mt-1 text-ui-fg-subtle">
          Очередь задач: найти товар, довести карточку, создать простую акцию. Полные списки
          товаров и акций — в разделах слева.
        </Text>
      </div>

      <Container className="p-4">
        <Text weight="plus">Очередь</Text>
        {attentionLoading ? (
          <Text size="small" className="mt-2 text-ui-fg-subtle">
            Считаем…
          </Text>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Text size="small" weight="plus">
                  Черновики товаров
                </Text>
                <Text size="small" className="text-ui-fg-subtle">
                  {draftVM ? draftVM.label : "не удалось посчитать"}
                </Text>
              </div>
              <Button size="small" variant="secondary" asChild>
                <Link to={stockAdminProductsPath({ status: "draft" })}>
                  Открыть черновики
                </Link>
              </Button>
            </div>

            <div>
              <Text size="small" weight="plus">
                Без главного фото
              </Text>
              <Text size="small" className="text-ui-fg-subtle">
                {thumbVM ? thumbVM.label : "не удалось проверить"}
              </Text>
              {thumbVM?.note ? (
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {thumbVM.note}
                </Text>
              ) : null}
              {missingThumbs.length ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {missingThumbs.map((p) => (
                    <li key={p.id}>
                      <Link
                        to={`${woodrightWorkspacePath(p.id)}?tab=gallery`}
                        className="text-sm underline"
                      >
                        Добавить фото: {p.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Text size="small" weight="plus">
                  Акции
                </Text>
                <Text size="small" className="text-ui-fg-subtle">
                  Полный список — в разделе «Акции». Здесь — мастер простой скидки.
                </Text>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="small" variant="secondary" asChild>
                  <Link to={stockAdminPromotionsPath()}>Все акции</Link>
                </Button>
                <Button size="small" asChild>
                  <Link to={woodrightPromotionNewPath()}>Создать простую акцию</Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </Container>

      <Container className="p-4">
        <Text weight="plus">Быстрые действия</Text>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="small"
            variant="secondary"
            onClick={() => searchInputRef.current?.focus()}
          >
            Найти товар
          </Button>
          <Button size="small" variant="secondary" asChild>
            <Link to={stockAdminProductCreatePath()}>Создать товар</Link>
          </Button>
          <Button size="small" asChild>
            <Link to={woodrightPromotionNewPath()}>Создать простую акцию</Link>
          </Button>
        </div>
      </Container>

      <Container className="p-4">
        <Text weight="plus">Найти товар и довести карточку</Text>
        <Input
          ref={searchInputRef}
          className="mt-2 max-w-md"
          placeholder="Название или артикул"
          aria-label="Поиск товара"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {searchError ? (
          <Text size="small" className="mt-2 text-ui-fg-error">
            {searchError}
          </Text>
        ) : null}
        {searchLoading ? (
          <Text size="small" className="mt-2 text-ui-fg-subtle">
            Ищем…
          </Text>
        ) : null}
        {debouncedQuery.trim() && !searchLoading && !searchError ? (
          !searchResults.length ? (
            <Text size="small" className="mt-2 text-ui-fg-subtle">
              Ничего не нашлось - попробуйте другое слово или артикул
            </Text>
          ) : (
            <div className="mt-2 flex flex-col">
              {searchResults.map((p) => (
                <Link
                  key={p.id}
                  to={woodrightWorkspacePath(p.id)}
                  className="flex items-center gap-3 border-b border-ui-border-base py-2 hover:bg-ui-bg-subtle"
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-ui-bg-subtle">
                    {p.thumbnail ? (
                      <img
                        src={p.thumbnail}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Text size="small" weight="plus" className="truncate">
                      {p.title || "Без названия"}
                    </Text>
                    <Text size="xsmall" className="truncate text-ui-fg-subtle">
                      {pickFirstSku(p.variants)
                        ? `Артикул: ${pickFirstSku(p.variants)}`
                        : "Артикул не указан"}
                    </Text>
                  </div>
                  <Badge size="small">{productStatusLabel(p.status)}</Badge>
                </Link>
              ))}
              {searchCount > SEARCH_PAGE_SIZE ? (
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={!pagination.has_prev}
                    onClick={() =>
                      setSearchOffset(Math.max(0, searchOffset - SEARCH_PAGE_SIZE))
                    }
                  >
                    Назад
                  </Button>
                  <Text size="small" className="text-ui-fg-subtle">
                    {pagination.label}
                  </Text>
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={!pagination.has_next}
                    onClick={() => setSearchOffset(searchOffset + SEARCH_PAGE_SIZE)}
                  >
                    Вперёд
                  </Button>
                </div>
              ) : null}
            </div>
          )
        ) : null}
      </Container>

      {recentProducts || recentPromotions ? (
        <Container className="p-4">
          <Text weight="plus">Недавние</Text>
          <div className="mt-2 grid gap-4 md:grid-cols-2">
            {recentProducts ? (
              <div>
                <Text size="small" className="text-ui-fg-subtle">
                  Товары - открыть доработку
                </Text>
                {!recentProducts.length ? (
                  <Text size="small" className="mt-1 text-ui-fg-subtle">
                    Пока пусто
                  </Text>
                ) : (
                  recentProducts.map((p) => (
                    <Link
                      key={p.id}
                      to={woodrightWorkspacePath(p.id)}
                      className="flex items-center justify-between gap-2 border-b border-ui-border-base py-1.5 hover:bg-ui-bg-subtle"
                    >
                      <Text size="small" className="truncate">
                        {p.title || "Без названия"}
                      </Text>
                      <Text size="xsmall" className="shrink-0 text-ui-fg-subtle">
                        {p.updated_at
                          ? new Date(p.updated_at).toLocaleDateString("ru-RU")
                          : ""}
                      </Text>
                    </Link>
                  ))
                )}
              </div>
            ) : null}
            {recentPromotions ? (
              <div>
                <Text size="small" className="text-ui-fg-subtle">
                  Акции - карточка акции
                </Text>
                {!recentPromotions.length ? (
                  <Text size="small" className="mt-1 text-ui-fg-subtle">
                    Пока пусто
                  </Text>
                ) : (
                  recentPromotions.map((p) => (
                    <Link
                      key={p.id}
                      to={woodrightPromotionPath(p.id)}
                      className="flex items-center justify-between gap-2 border-b border-ui-border-base py-1.5 hover:bg-ui-bg-subtle"
                    >
                      <Text size="small" className="truncate">
                        {p.code || (p.is_automatic ? "Автоматическая акция" : "Акция без кода")}
                      </Text>
                      <Text size="xsmall" className="shrink-0 text-ui-fg-subtle">
                        {p.updated_at
                          ? new Date(p.updated_at).toLocaleDateString("ru-RU")
                          : ""}
                      </Text>
                    </Link>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </Container>
      ) : null}

      <details className="rounded-md border border-ui-border-base p-3">
        <summary className="cursor-pointer text-sm text-ui-fg-subtle">
          {UI_COPY.technicalDetails}
        </summary>
        <Text size="xsmall" className="mt-2 text-ui-fg-subtle">
          Данные обновлены:{" "}
          {lastFetchAt ? new Date(lastFetchAt).toLocaleString("ru-RU") : "ещё загружаются"}
        </Text>
        <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
          Каталог и заказы:{" "}
          <Link to={stockAdminHomePath()} className="underline">
            на главную админки
          </Link>
        </Text>
        {techIssues.length ? (
          <ul className="mt-2 list-disc pl-5 text-ui-fg-subtle">
            {techIssues.map((issue, i) => (
              <li key={`${issue.source}-${i}`}>
                <Text size="xsmall">
                  {issue.source}: {issue.detail}
                </Text>
              </li>
            ))}
          </ul>
        ) : null}
      </details>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Рабочий стол Woodright",
})

export default WoodrightDashboardPage
