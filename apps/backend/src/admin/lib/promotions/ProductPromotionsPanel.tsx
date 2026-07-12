import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Badge, Button, Container, Text } from "@medusajs/ui"
import { normalizeAdminError } from "../errors/normalize-admin-error"
import { buildAdminErrorViewModel } from "../../components/woodright/admin-error-view-model"
import {
  fetchAdminPromotions,
  stockAdminPromotionsPath,
  woodrightPromotionNewPath,
  woodrightPromotionPath,
} from "./api"
import { buildPromotionStatusVM } from "./status"
import { buildPromotionSummary } from "./summary"
import { matchPromotionsForProduct } from "./product-match"
import type { AdminPromotionDto } from "./types"

/**
 * Package E — «Акции товара» tab of the Product Workspace.
 * MVP: loads the promotions list (page by page, bounded) and filters
 * client-side for rules that mention this product id (direct) or its
 * collection id (indirect). Never enumerates the whole catalog; when the
 * promotions list is truncated, says so honestly.
 */

const PAGE_SIZE = 100
const MAX_PAGES = 3

type Props = {
  productId: string
  collectionId: string | null
}

export const ProductPromotionsPanel = ({ productId, collectionId }: Props) => {
  const [loading, setLoading] = useState(true)
  const [promotions, setPromotions] = useState<AdminPromotionDto[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loadError, setLoadError] = useState<ReturnType<typeof normalizeAdminError> | null>(
    null
  )

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setLoadError(null)
    ;(async () => {
      const all: AdminPromotionDto[] = []
      let total = 0
      try {
        for (let page = 0; page < MAX_PAGES; page++) {
          const res = await fetchAdminPromotions(
            { limit: PAGE_SIZE, offset: page * PAGE_SIZE },
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
            return
          }
          all.push(...res.promotions)
          total = res.count
          if (all.length >= total || !res.promotions.length) break
        }
        setPromotions(all)
        setTruncated(all.length < total)
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
  }, [productId])

  const matches = useMemo(
    () => matchPromotionsForProduct(promotions, productId, collectionId),
    [promotions, productId, collectionId]
  )

  if (loading) {
    return (
      <Container className="p-4">
        <Text>Ищем акции для этого товара…</Text>
      </Container>
    )
  }

  if (loadError) {
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
        <Button className="mt-3" size="small" variant="secondary" asChild>
          <Link to={stockAdminPromotionsPath()}>Все акции</Link>
        </Button>
      </Container>
    )
  }

  return (
    <Container className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text weight="plus">Акции с условиями на этот товар</Text>
        <div className="flex gap-2">
          <Button size="small" variant="secondary" asChild>
            <Link to={stockAdminPromotionsPath()}>Все акции</Link>
          </Button>
          <Button size="small" asChild>
            <Link to={woodrightPromotionNewPath({ product_id: productId })}>
              Создать акцию для этого товара
            </Link>
          </Button>
        </div>
      </div>

      {truncated ? (
        <Text size="xsmall" className="text-ui-fg-subtle">
          Акций больше, чем удалось загрузить ({promotions.length}) - список может быть
          неполным. Смотрите полный список в разделе «Акции» (кнопка выше).
        </Text>
      ) : null}

      {!matches.length ? (
        <div>
          <Text size="small" className="text-ui-fg-subtle">
            Нет акций, где этот товар или его коллекция выбраны явно. Общие акции магазина
            (на весь заказ / весь каталог) здесь не учитываются.
          </Text>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {matches.map(({ promotion, match, reason }) => {
            const status = buildPromotionStatusVM({ promotion })
            const summary = buildPromotionSummary(promotion)
            const matchLabel =
              match === "direct"
                ? "Товар указан явно"
                : match === "indirect"
                  ? "Через коллекцию"
                  : "Требуется проверка расчёта"
            return (
              <div
                key={promotion.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ui-border-base p-3"
              >
                <div className="min-w-0">
                  <Link to={woodrightPromotionPath(promotion.id)} className="hover:underline">
                    <Text size="small" weight="plus">
                      {summary.text}
                    </Text>
                  </Link>
                  <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                    {reason}
                  </Text>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge
                      color={
                        status.tone === "green"
                          ? "green"
                          : status.tone === "red"
                            ? "red"
                            : status.tone === "orange"
                              ? "orange"
                              : status.tone === "blue"
                                ? "blue"
                                : "grey"
                      }
                    >
                      {status.label}
                    </Badge>
                    <Badge
                      color={
                        match === "direct"
                          ? "purple"
                          : match === "needs_cart_check"
                            ? "orange"
                            : "grey"
                      }
                    >
                      {matchLabel}
                    </Badge>
                  </div>
                </div>
                <Button size="small" variant="secondary" asChild>
                  <Link to={woodrightPromotionPath(promotion.id)}>Проверить расчёт</Link>
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </Container>
  )
}
