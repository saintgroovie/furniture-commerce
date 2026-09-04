import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Tag } from "@medusajs/icons"
import {
  Container,
  Heading,
  StatusBadge,
  Text,
  createDataTableColumnHelper,
  DataTable,
  useDataTable,
} from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { formatRubAmount } from "../../../../lib/woodright-admin/price-sanity"
import type {
  AttentionFilter,
  SellerPriceDisplay,
  SellerProduct,
} from "../../../../lib/woodright-admin/seller-product-types"
import {
  formatSellerVariantCount,
  matchesAttentionFilter,
  matchesSellerSearch,
} from "../../../../lib/woodright-admin/workspace-query"
import { AttentionChips, sellerStatusLabel } from "../../../components/woodright/AttentionChips"
import { useWoodrightProducts } from "../../../lib/use-woodright-products"

const PAGE_SIZE = 20

function parseFilter(raw: string | null): AttentionFilter {
  if (
    raw === "missing_media" ||
    raw === "missing_price" ||
    raw === "drafts" ||
    raw === "published_invisible" ||
    raw === "not_ready"
  ) {
    return raw
  }
  return "all"
}

function formatPrice(display: SellerPriceDisplay): string {
  if (display.kind === "single") return formatRubAmount(display.amount)
  if (display.kind === "range") {
    return `от ${formatRubAmount(display.min)}`
  }
  return "нет"
}

function skuCell(product: SellerProduct): string {
  if (product.skus.length === 1) return product.skus[0]
  if (product.variants.length > 1) return formatSellerVariantCount(product.variants.length)
  return "нет"
}

const columnHelper = createDataTableColumnHelper<SellerProduct>()

const columns = [
  columnHelper.display({
    id: "thumbnail",
    header: "",
    cell: ({ row }) =>
      row.original.thumbnail ? (
        <img
          src={row.original.thumbnail}
          alt=""
          className="h-8 w-8 rounded-md object-cover"
          onError={(event) => {
            ;(event.target as HTMLImageElement).style.visibility = "hidden"
          }}
        />
      ) : (
        <div className="h-8 w-8 rounded-md bg-ui-bg-subtle" />
      ),
  }),
  columnHelper.accessor("title", {
    header: "Товар",
    enableSorting: true,
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span>{row.original.title}</span>
        {row.original.collection_label && (
          <span className="text-ui-fg-subtle text-xs">{row.original.collection_label}</span>
        )}
      </div>
    ),
  }),
  columnHelper.accessor((row) => skuCell(row), {
    id: "sku",
    header: "Артикул",
    enableSorting: true,
    cell: ({ row }) => skuCell(row.original),
  }),
  columnHelper.accessor((row) => formatPrice(row.price_display), {
    id: "price",
    header: "Цена",
    cell: ({ row }) => formatPrice(row.original.price_display),
  }),
  columnHelper.accessor("status", {
    header: "Статус",
    cell: ({ row }) => (
      <StatusBadge color={row.original.status === "published" ? "green" : "grey"}>
        {sellerStatusLabel(row.original.status, row.original.readiness.visible)}
      </StatusBadge>
    ),
  }),
  columnHelper.display({
    id: "attention",
    header: "Требует внимания",
    cell: ({ row }) => <AttentionChips codes={row.original.readiness.codes} />,
  }),
]

const FILTER_LABELS: Record<AttentionFilter, string> = {
  all: "Все",
  drafts: "Черновики",
  missing_media: "Без фото",
  missing_price: "Без цены",
  published_invisible: "Не видны",
  not_ready: "Не готовы",
}

const WoodrightProductsPage = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data, loading, error } = useWoodrightProducts()
  const [search, setSearch] = useState(searchParams.get("q") ?? "")
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZE })
  const filter = parseFilter(searchParams.get("filter"))

  const filteredRows = useMemo(() => {
    return (data?.products ?? [])
      .filter((product) => matchesAttentionFilter(product, filter))
      .filter((product) => matchesSellerSearch(product, search))
  }, [data?.products, filter, search])

  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }))
  }, [search, filter])

  const pagedRows = useMemo(() => {
    const start = pagination.pageIndex * pagination.pageSize
    return filteredRows.slice(start, start + pagination.pageSize)
  }, [filteredRows, pagination])

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
    search: {
      state: search,
      onSearchChange: (value) => {
        setSearch(value)
        const next = new URLSearchParams(searchParams)
        if (value.trim()) next.set("q", value)
        else next.delete("q")
        setSearchParams(next)
      },
    },
    onRowClick: (_event, row) => {
      navigate(`/woodright/products/${row.id}`)
    },
  })

  if (error) {
    return (
      <Container className="p-6">
        <Text size="small" className="text-ui-fg-error">
          {error}
        </Text>
      </Container>
    )
  }

  return (
    <Container className="divide-y p-0">
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
              <DataTable.Search placeholder="Найти товар по артикулу или названию" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(FILTER_LABELS) as AttentionFilter[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                className={`rounded-full border px-3 py-1 text-sm ${
                  filter === key
                    ? "border-ui-border-strong bg-ui-bg-base"
                    : "border-ui-border-base text-ui-fg-subtle"
                }`}
                onClick={() => {
                  const next = new URLSearchParams(searchParams)
                  if (key === "all") next.delete("filter")
                  else next.set("filter", key)
                  setSearchParams(next)
                }}
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
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Товары",
  icon: Tag,
})

export default WoodrightProductsPage
