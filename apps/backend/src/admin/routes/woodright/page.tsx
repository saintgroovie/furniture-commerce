import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Buildings } from "@medusajs/icons"
import { Container, Heading, Input, Text } from "@medusajs/ui"
import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { formatRubAmount } from "../../../lib/woodright-admin/price-sanity"
import type { AttentionFilter } from "../../../lib/woodright-admin/seller-product-types"
import { matchesSellerSearch } from "../../../lib/woodright-admin/workspace-query"
import { useWoodrightProducts } from "../../lib/use-woodright-products"

const WoodrightOverviewPage = () => {
  const navigate = useNavigate()
  const { data, loading, error } = useWoodrightProducts()
  const [search, setSearch] = useState("")

  const matches = useMemo(() => {
    const products = data?.products ?? []
    if (!search.trim()) return []
    return products.filter((product) => matchesSellerSearch(product, search)).slice(0, 8)
  }, [data?.products, search])

  const recent = (data?.products ?? []).slice(0, 8)
  const attention = data?.attention

  const openFilter = (filter: AttentionFilter) => {
    navigate(`/woodright/products?filter=${filter}`)
  }

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading>Woodright</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Найдите товар, проверьте готовность и измените цену, размеры или видимость
        </Text>
      </div>
      {error && (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-error">
            {error}
          </Text>
        </div>
      )}
      <div className="px-6 py-4">
        <Input
          id="woodright-search"
          aria-label="Найти товар по артикулу или названию"
          placeholder="Найти товар по артикулу или названию"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {search.trim() && (
          <ul className="mt-3 flex flex-col gap-2">
            {loading && (
              <Text size="small" className="text-ui-fg-subtle">
                Загружаем товары…
              </Text>
            )}
            {!loading && matches.length === 0 && (
              <Text size="small" className="text-ui-fg-subtle">
                Ничего не найдено
              </Text>
            )}
            {matches.map((product) => (
              <li key={product.id}>
                <Link
                  to={`/woodright/products/${product.id}`}
                  className="flex items-center justify-between rounded-md border border-ui-border-base px-3 py-2"
                >
                  <span>
                    <Text weight="plus">{product.title}</Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      {product.skus.join(", ") || "Без артикула"}
                    </Text>
                  </span>
                  {product.price_display.kind === "single" && (
                    <Text size="small">{formatRubAmount(product.price_display.amount)}</Text>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="px-6 py-4">
        <Heading level="h2" className="mb-3">
          Быстрые действия
        </Heading>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/woodright/products"
            className="inline-flex rounded-md border border-ui-border-base px-3 py-2 text-sm"
          >
            Товары
          </Link>
          <Link
            to="/woodright/products/new"
            className="inline-flex rounded-md border border-ui-border-base px-3 py-2 text-sm"
          >
            Добавить товар
          </Link>
          <Link
            to="/woodright/contacts"
            className="inline-flex rounded-md border border-ui-border-base px-3 py-2 text-sm"
          >
            Контакты - подготовка
          </Link>
        </div>
      </div>
      <div className="px-6 py-4">
        <Heading level="h2" className="mb-3">
          Требуют внимания
        </Heading>
        {loading && (
          <Text size="small" className="text-ui-fg-subtle">
            Загружаем товары…
          </Text>
        )}
        {attention && (
          <ul className="flex flex-col gap-2">
            <li>
              <button type="button" className="text-left" onClick={() => openFilter("not_ready")}>
                <Text>Не готовы к публикации - {attention.not_ready}</Text>
              </button>
            </li>
            <li>
              <button type="button" className="text-left" onClick={() => openFilter("missing_media")}>
                <Text>Без фотографий - {attention.missing_media}</Text>
              </button>
            </li>
            <li>
              <button type="button" className="text-left" onClick={() => openFilter("missing_price")}>
                <Text>Без цены - {attention.missing_price}</Text>
              </button>
            </li>
            <li>
              <button type="button" className="text-left" onClick={() => openFilter("drafts")}>
                <Text>Черновики - {attention.drafts}</Text>
              </button>
            </li>
            <li>
              <button type="button" className="text-left" onClick={() => openFilter("published_invisible")}>
                <Text>Опубликованы, но не видны - {attention.published_invisible}</Text>
              </button>
            </li>
          </ul>
        )}
      </div>
      <div className="px-6 py-4">
        <Heading level="h2" className="mb-3">
          Недавно изменённые
        </Heading>
        {recent.length === 0 && !loading && (
          <Text size="small" className="text-ui-fg-subtle">
            Пока нет товаров
          </Text>
        )}
        <ul className="flex flex-col gap-2">
          {recent.map((product) => (
            <li key={product.id}>
              <Link to={`/woodright/products/${product.id}`} className="text-sm">
                {product.title}
                {product.skus[0] ? ` · ${product.skus[0]}` : ""}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Woodright",
  icon: Buildings,
})

export default WoodrightOverviewPage
