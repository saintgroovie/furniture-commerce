import {
  Heading,
  Input,
  Text,
  createDataTableColumnHelper,
  DataTable,
  useDataTable,
} from "@medusajs/ui"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { formatRubAmount } from "../../../lib/woodright-admin/price-sanity"
import type {
  AttentionFilter,
  SellerPriceDisplay,
  SellerProduct,
} from "../../../lib/woodright-admin/seller-product-types"
import {
  findExactSkuMatch,
  formatSellerVariantCount,
  matchesAttentionFilter,
  matchesSellerSearch,
} from "../../../lib/woodright-admin/workspace-query"
import { highestAttentionChip, sellerSiteState, SELLER_STATE_LABELS } from "../../../lib/woodright-admin/seller-site-state"
import { AttentionChipBadge } from "./AttentionChips"
import { HighlightText } from "./HighlightText"

const PAGE_SIZE = 20

function formatPrice(display: SellerPriceDisplay): string {
  if (display.kind === "single") return formatRubAmount(display.amount)
  if (display.kind === "range") return `от ${formatRubAmount(display.min)}`
  return ""
}

function skuCell(product: SellerProduct): string {
  if (product.skus.length === 1) return product.skus[0]
  if (product.variants.length > 1) return formatSellerVariantCount(product.variants.length)
  return ""
}

const FILTER_LABELS: Record<AttentionFilter, string> = {
  all: "Все",
  published_invisible: "Не показываются",
  drafts: "Черновики",
  missing_media: "Без фото",
  missing_price: "Без цены",
}

const FILTER_ORDER: AttentionFilter[] = [
  "all",
  "published_invisible",
  "drafts",
  "missing_media",
  "missing_price",
]

type Props = {
  products: SellerProduct[]
  loading: boolean
  search: string
  onSearchChange: (value: string) => void
  filter: AttentionFilter
  onFilterChange: (filter: AttentionFilter) => void
  showSuggestions?: boolean
}

export function SellerProductsList({
  products,
  loading,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  showSuggestions = false,
}: Props) {
  const navigate = useNavigate()
  const searchRef = useRef<HTMLInputElement>(null)
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZE })

  const filteredRows = useMemo(() => {
    return products
      .filter((product) => matchesAttentionFilter(product, filter))
      .filter((product) => matchesSellerSearch(product, search))
  }, [products, filter, search])

  const suggestionRows = useMemo(() => {
    if (!showSuggestions || !search.trim()) return []
    return products.filter((product) => matchesSellerSearch(product, search)).slice(0, 8)
  }, [products, search, showSuggestions])

  const suggestionTotal = useMemo(() => {
    if (!showSuggestions || !search.trim()) return 0
    return products.filter((product) => matchesSellerSearch(product, search)).length
  }, [products, search, showSuggestions])

  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }))
  }, [search, filter])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/") return
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (target.closest("input, textarea, select, [contenteditable='true']")) return
      event.preventDefault()
      event.stopImmediatePropagation()
      const host = document.getElementById("woodright-search")
      const field =
        host instanceof HTMLInputElement
          ? host
          : host instanceof HTMLElement
            ? host.querySelector("input")
            : document.querySelector<HTMLInputElement>(
                'input[aria-label="Найти товар по артикулу или названию"]'
              )
      if (field) field.focus()
      else searchRef.current?.focus()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [])

  const pagedRows = useMemo(() => {
    const start = pagination.pageIndex * pagination.pageSize
    return filteredRows.slice(start, start + pagination.pageSize)
  }, [filteredRows, pagination])

  const columns = useMemo(() => {
    const columnHelper = createDataTableColumnHelper<SellerProduct>()
    return [
      columnHelper.display({
        id: "thumbnail",
        header: "",
        cell: ({ row }) =>
          row.original.thumbnail ? (
            <img
              src={row.original.thumbnail}
              alt=""
              className="h-12 w-12 rounded-md object-cover"
              onError={(event) => {
                ;(event.target as HTMLImageElement).style.visibility = "hidden"
              }}
            />
          ) : (
            <div className="h-12 w-12 rounded-md bg-ui-bg-subtle" />
          ),
      }),
      columnHelper.accessor("title", {
        header: "Товар",
        enableSorting: true,
        cell: ({ row }) => {
          const sku = skuCell(row.original)
          return (
            <div className="flex flex-col">
              <Link
                to={`/woodright/products/${row.original.id}`}
                className="text-ui-fg-base font-medium"
                aria-label={row.original.title}
                onClick={(event) => event.stopPropagation()}
              >
                <HighlightText text={row.original.title} query={search} />
              </Link>
              <span className="text-ui-fg-subtle text-xs">
                {sku ? <HighlightText text={sku} query={search} /> : null}
                {row.original.collection_label ? ` · ${row.original.collection_label}` : ""}
              </span>
            </div>
          )
        },
      }),
      columnHelper.accessor((row) => formatPrice(row.price_display), {
        id: "price",
        header: "Цена",
        cell: ({ row }) => formatPrice(row.original.price_display),
      }),
      columnHelper.display({
        id: "state",
        header: "Состояние",
        cell: ({ row }) => {
          const state = sellerSiteState(row.original)
          const labels = SELLER_STATE_LABELS[state]
          const chip = highestAttentionChip(row.original.readiness.codes)
          return (
            <div className="flex flex-col gap-1">
              <span
                className={`inline-flex w-fit rounded-full px-2 py-0.5 text-xs ${
                  labels.color === "green"
                    ? "bg-ui-tag-green-bg text-ui-tag-green-text"
                    : labels.color === "orange"
                      ? "bg-ui-tag-orange-bg text-ui-tag-orange-text"
                      : "bg-ui-tag-neutral-bg text-ui-tag-neutral-text"
                }`}
              >
                {labels.badge}
              </span>
              {chip && <AttentionChipBadge code={chip.code} />}
            </div>
          )
        },
      }),
    ]
  }, [search])

  const table = useDataTable({
    columns,
    data: pagedRows,
    getRowId: (row) => row.id,
    rowCount: filteredRows.length,
    isLoading: loading,
    pagination: {
      state: pagination,
      onPaginationChange: setPagination,
    },
    onRowClick: (event, row) => {
      const target = event.target
      if (target instanceof Element && target.closest("a,button")) return
      navigate(`/woodright/products/${row.id}`)
    },
  })

  const submitExactSku = () => {
    const match = findExactSkuMatch(products, search)
    if (match) navigate(`/woodright/products/${match.id}`)
  }

  return (
    <DataTable instance={table}>
      <DataTable.Toolbar className="flex flex-col gap-3 px-6 py-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <Heading level="h2">Товары</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Поиск по артикулу и названию
            </Text>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/woodright/products/new"
              className="rounded-md border border-ui-border-base px-3 py-1 text-sm"
            >
              Добавить товар
            </Link>
            <Input
              ref={searchRef}
              id="woodright-search"
              aria-label="Найти товар по артикулу или названию"
              placeholder="Найти товар по артикулу или названию"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  submitExactSku()
                }
              }}
            />
          </div>
        </div>
        {showSuggestions && search.trim() && (
          <div>
            <ul className="flex flex-col gap-2">
              {suggestionRows.map((product) => {
                const state = sellerSiteState(product)
                const sku = product.skus[0] ?? ""
                return (
                  <li key={product.id}>
                    <Link
                      to={`/woodright/products/${product.id}`}
                      className="flex items-center gap-3 rounded-md border border-ui-border-base px-3 py-2"
                      aria-label={`${product.title}${sku ? ` · ${sku}` : ""}`}
                    >
                      {product.thumbnail ? (
                        <img src={product.thumbnail} alt="" className="h-8 w-8 rounded-md object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded-md bg-ui-bg-subtle" />
                      )}
                      <span className="flex flex-col">
                        <Text size="small">
                          <HighlightText text={product.title} query={search} />
                          {sku ? " · " : ""}
                          {sku ? <HighlightText text={sku} query={search} /> : null}
                          {product.collection_label ? ` · ${product.collection_label}` : ""}
                          {` · ${SELLER_STATE_LABELS[state].badge}`}
                        </Text>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
            {suggestionTotal > 0 && (
              <Link
                to={`/woodright/products?q=${encodeURIComponent(search.trim())}`}
                className="mt-2 inline-block text-sm"
              >
                Показать все {suggestionTotal} в списке
              </Link>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {FILTER_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              className={`rounded-full border px-3 py-1 text-sm ${
                filter === key
                  ? "border-ui-border-strong bg-ui-bg-base"
                  : "border-ui-border-base text-ui-fg-subtle"
              }`}
              onClick={() => onFilterChange(key)}
            >
              {FILTER_LABELS[key]}
            </button>
          ))}
        </div>
      </DataTable.Toolbar>
      <DataTable.Table />
      {!loading && filteredRows.length === 0 && (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            Ничего не найдено
          </Text>
        </div>
      )}
      <DataTable.Pagination
        translations={{ of: "из", results: "результатов", pages: "страниц", prev: "Назад", next: "Далее" }}
      />
    </DataTable>
  )
}
