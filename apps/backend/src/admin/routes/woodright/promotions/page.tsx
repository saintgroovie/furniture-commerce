import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Badge, Button, Container, Heading, Input, Text } from "@medusajs/ui"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { isWoodrightAdminUxV1Enabled } from "../../../lib/feature-flags/woodright-admin-flags"
import { normalizeAdminError } from "../../../lib/errors/normalize-admin-error"
import { buildAdminErrorViewModel } from "../../../components/woodright/admin-error-view-model"
import {
  fetchAdminPromotions,
  stockAdminPromotionsPath,
  woodrightPromotionNewPath,
  woodrightPromotionPath,
} from "../../../lib/promotions/api"
import { buildPromotionStatusVM } from "../../../lib/promotions/status"
import { buildPromotionSummary } from "../../../lib/promotions/summary"
import { describeCampaign } from "../../../lib/promotions/campaign"
import type { AdminPromotionDto } from "../../../lib/promotions/types"

type ListFilter = "all" | "active" | "scheduled" | "expired" | "attention" | "campaigns"

const FILTERS: Array<{ id: ListFilter; label: string }> = [
  { id: "all", label: "Все" },
  { id: "active", label: "Действуют" },
  { id: "scheduled", label: "Запланированы" },
  { id: "expired", label: "Завершены" },
  { id: "attention", label: "Требуют внимания" },
  { id: "campaigns", label: "По кампаниям" },
]

const PAGE_SIZE = 50

function readFlagFromBrowser(): boolean {
  try {
    const w = window as unknown as { __WOODRIGHT_ADMIN_UX_V1__?: string }
    if (w.__WOODRIGHT_ADMIN_UX_V1__ != null) {
      return isWoodrightAdminUxV1Enabled({
        WOODRIGHT_ADMIN_UX_V1: String(w.__WOODRIGHT_ADMIN_UX_V1__),
      })
    }
  } catch {
    /* ignore */
  }
  try {
    const ls = window.localStorage.getItem("WOODRIGHT_ADMIN_UX_V1")
    if (ls != null) {
      return isWoodrightAdminUxV1Enabled({ WOODRIGHT_ADMIN_UX_V1: ls })
    }
  } catch {
    /* ignore */
  }
  try {
    const meta = import.meta as unknown as { env?: Record<string, string> }
    if (meta.env?.WOODRIGHT_ADMIN_UX_V1) {
      return isWoodrightAdminUxV1Enabled(meta.env)
    }
  } catch {
    /* ignore */
  }
  return false
}

const PromotionsListPage = () => {
  const flagOn = readFlagFromBrowser()
  const [filter, setFilter] = useState<ListFilter>("all")
  const [query, setQuery] = useState("")
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [promotions, setPromotions] = useState<AdminPromotionDto[]>([])
  const [count, setCount] = useState(0)
  const [loadError, setLoadError] = useState<ReturnType<typeof normalizeAdminError> | null>(
    null
  )

  useEffect(() => {
    if (!flagOn) return
    const ac = new AbortController()
    setLoading(true)
    setLoadError(null)
    ;(async () => {
      try {
        const res = await fetchAdminPromotions(
          { q: query || undefined, limit: PAGE_SIZE, offset },
          { signal: ac.signal }
        )
        if (ac.signal.aborted) return
        if ("status" in res) {
          setLoadError(
            normalizeAdminError({
              httpStatus: res.status,
              endpoint: "/admin/promotions",
              body: res.body,
            })
          )
          setPromotions([])
          return
        }
        setPromotions(res.promotions)
        setCount(res.count)
      } catch (e) {
        if (ac.signal.aborted) return
        setLoadError(
          normalizeAdminError({
            error: e,
            endpoint: "/admin/promotions",
            codeHint: "network_error",
          })
        )
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    })()
    return () => ac.abort()
  }, [flagOn, query, offset])

  const rows = useMemo(() => {
    const now = new Date()
    return promotions.map((p) => ({
      promotion: p,
      status: buildPromotionStatusVM({ promotion: p, now }),
      summary: buildPromotionSummary(p),
    }))
  }, [promotions])

  const visibleRows = useMemo(() => {
    if (filter === "all" || filter === "campaigns") return rows
    if (filter === "active") return rows.filter((r) => r.status.kind === "active")
    if (filter === "scheduled") return rows.filter((r) => r.status.kind === "scheduled")
    if (filter === "expired") return rows.filter((r) => r.status.kind === "expired")
    return rows.filter((r) => r.status.needs_attention || !r.summary.supported)
  }, [rows, filter])

  const campaignGroups = useMemo(() => {
    if (filter !== "campaigns") return []
    const groups = new Map<string, { label: string; rows: typeof rows }>()
    for (const row of rows) {
      const campaign = row.promotion.campaign
      const key = campaign?.id ?? "__none__"
      const label = campaign ? describeCampaign(campaign) : "Без кампании"
      const g = groups.get(key) ?? { label, rows: [] as typeof rows }
      g.rows.push(row)
      groups.set(key, g)
    }
    return [...groups.entries()].map(([key, g]) => ({ key, ...g }))
  }, [rows, filter])

  if (!flagOn) {
    return (
      <Container className="p-6">
        <Heading level="h1">Акции Woodright</Heading>
        <Text className="mt-2 text-ui-fg-subtle">
          Функция выключена. Включите флаг WOODRIGHT_ADMIN_UX_V1 (localStorage или env) и
          обновите страницу. Штатный раздел акций Medusa остаётся доступным.
        </Text>
        <Button className="mt-4" variant="secondary" asChild>
          <Link to={stockAdminPromotionsPath()}>Открыть акции в стандартной админке</Link>
        </Button>
      </Container>
    )
  }

  const renderRow = (row: (typeof rows)[number]) => {
    const p = row.promotion
    return (
      <tr key={p.id} className="border-b border-ui-border-base align-top">
        <td className="max-w-md px-3 py-3">
          <Link to={woodrightPromotionPath(p.id)} className="hover:underline">
            <Text weight="plus">{row.summary.text}</Text>
          </Link>
          {row.summary.notes.map((n) => (
            <Text key={n} size="xsmall" className="mt-1 text-ui-fg-subtle">
              {n}
            </Text>
          ))}
        </td>
        <td className="px-3 py-3">
          <Text size="small" className="font-mono">
            {p.code || "—"}
          </Text>
          <Text size="xsmall" className="text-ui-fg-subtle">
            {p.is_automatic ? "автоматическая" : "по коду"}
          </Text>
        </td>
        <td className="px-3 py-3">
          <Badge
            color={
              row.status.tone === "green"
                ? "green"
                : row.status.tone === "red"
                  ? "red"
                  : row.status.tone === "orange"
                    ? "orange"
                    : row.status.tone === "blue"
                      ? "blue"
                      : "grey"
            }
          >
            {row.status.label}
          </Badge>
          {row.status.reason ? (
            <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
              {row.status.reason}
            </Text>
          ) : null}
        </td>
        <td className="px-3 py-3">
          <Text size="small">
            {p.campaign ? describeCampaign(p.campaign) : "Без кампании"}
          </Text>
        </td>
        <td className="px-3 py-3">
          <div className="flex flex-col gap-1">
            <Button size="small" variant="secondary" asChild>
              <Link to={woodrightPromotionPath(p.id)}>Открыть</Link>
            </Button>
            {!row.summary.supported ? (
              <Button size="small" variant="secondary" asChild>
                <Link to={stockAdminPromotionsPath()}>В стандартной админке</Link>
              </Button>
            ) : null}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading level="h1">Акции</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Скидки и промокоды магазина. Скидки не меняют базовые цены товаров - они
            применяются в корзине
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" asChild>
            <Link to={stockAdminPromotionsPath()}>Стандартная админка</Link>
          </Button>
          <Button asChild>
            <Link to={woodrightPromotionNewPath()}>Создать акцию</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Фильтр акций" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              size="small"
              variant={filter === f.id ? "primary" : "secondary"}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <Input
          className="max-w-xs"
          placeholder="Поиск по коду или названию"
          aria-label="Поиск акций"
          value={query}
          onChange={(e) => {
            setOffset(0)
            setQuery(e.target.value)
          }}
        />
      </div>

      {loadError ? (
        (() => {
          const vm = buildAdminErrorViewModel({
            title: loadError.title,
            explanation: loadError.explanation,
            action: loadError.action,
            technical: loadError.technical,
          })
          return (
            <Container className="p-4">
              <Text weight="plus">{vm.primary.title}</Text>
              <Text size="small" className="mt-1">
                {vm.primary.explanation} {vm.primary.action}
              </Text>
              <details className="mt-2">
                <summary>Технические сведения</summary>
                <ul className="mt-2 list-disc pl-5 text-ui-fg-subtle">
                  {vm.technicalRows.map((r) => (
                    <li key={r.label}>
                      {r.label}: {r.value}
                    </li>
                  ))}
                </ul>
              </details>
            </Container>
          )
        })()
      ) : loading ? (
        <Container className="p-4">
          <Text>Загружаем акции…</Text>
        </Container>
      ) : !rows.length ? (
        <Container className="p-6">
          <Text weight="plus">Акций пока нет</Text>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Создайте первую акцию - по коду или автоматическую
          </Text>
          <Button className="mt-3" asChild>
            <Link to={woodrightPromotionNewPath()}>Создать акцию</Link>
          </Button>
        </Container>
      ) : filter === "campaigns" ? (
        <div className="flex flex-col gap-4">
          {campaignGroups.map((g) => (
            <Container key={g.key} className="p-0">
              <div className="border-b border-ui-border-base px-3 py-2">
                <Text weight="plus">{g.label}</Text>
              </div>
              <table className="w-full text-left">
                <tbody>{g.rows.map(renderRow)}</tbody>
              </table>
            </Container>
          ))}
        </div>
      ) : (
        <Container className="p-0">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-ui-border-base text-ui-fg-subtle">
                <th className="px-3 py-2 font-normal">Акция</th>
                <th className="px-3 py-2 font-normal">Код</th>
                <th className="px-3 py-2 font-normal">Статус</th>
                <th className="px-3 py-2 font-normal">Кампания</th>
                <th className="px-3 py-2 font-normal">Действия</th>
              </tr>
            </thead>
            <tbody>{visibleRows.map(renderRow)}</tbody>
          </table>
          {!visibleRows.length ? (
            <div className="px-3 py-6">
              <Text size="small" className="text-ui-fg-subtle">
                Под этот фильтр не попала ни одна акция с текущей страницы списка
              </Text>
            </div>
          ) : null}
        </Container>
      )}

      {count > PAGE_SIZE ? (
        <div className="flex items-center gap-2">
          <Button
            size="small"
            variant="secondary"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Назад
          </Button>
          <Text size="small" className="text-ui-fg-subtle">
            {offset + 1} - {Math.min(offset + PAGE_SIZE, count)} из {count}
          </Text>
          <Button
            size="small"
            variant="secondary"
            disabled={offset + PAGE_SIZE >= count}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Вперёд
          </Button>
          <Text size="xsmall" className="text-ui-fg-subtle">
            Фильтры и статусы считаются по загруженной странице списка
          </Text>
        </div>
      ) : null}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Акции",
})

export default PromotionsListPage
