import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Hashtag } from "@medusajs/icons"
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
import { useNavigate } from "react-router-dom"
import { localizeCollectionDisplayTitle } from "../../../lib/collection-display-labels"

type AdminProductVariantLite = {
  sku: string | null
}

type AdminProductLite = {
  id: string
  title: string
  thumbnail: string | null
  status: string
  collection?: { title: string } | null
  variants?: AdminProductVariantLite[] | null
}

type SkuRow = {
  id: string
  title: string
  thumbnail: string | null
  status: string
  collectionTitle: string | null
  skus: string[]
}

const PAGE_LIMIT = 200
const PAGE_SIZE = 20

async function fetchAllProducts(): Promise<AdminProductLite[]> {
  const products: AdminProductLite[] = []
  let offset = 0

  while (true) {
    const params = new URLSearchParams({
      fields: "id,title,thumbnail,status,*collection,*variants",
      limit: String(PAGE_LIMIT),
      offset: String(offset),
    })

    const res = await fetch(`/admin/products?${params.toString()}`, {
      credentials: "include",
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(body || `HTTP ${res.status}`)
    }

    const json = (await res.json()) as { products: AdminProductLite[]; count: number }
    products.push(...json.products)
    offset += json.products.length

    if (json.products.length === 0 || offset >= json.count) {
      break
    }
  }

  return products
}

function toRows(products: AdminProductLite[]): SkuRow[] {
  return products.map((p) => ({
    id: p.id,
    title: p.title,
    thumbnail: p.thumbnail ?? null,
    status: p.status,
    collectionTitle: localizeCollectionDisplayTitle(p.collection?.title) ?? null,
    skus: (p.variants ?? []).map((v) => v.sku).filter((sku): sku is string => Boolean(sku)),
  }))
}

function matchesSearch(row: SkuRow, query: string): boolean {
  const haystack = [row.title, row.collectionTitle ?? "", ...row.skus].join(" ").toLowerCase()
  return haystack.includes(query.toLowerCase())
}

const STATUS_LABELS: Record<string, string> = {
  published: "Опубликован",
  draft: "Черновик",
  proposed: "Предложен",
  rejected: "Отклонён",
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

const columnHelper = createDataTableColumnHelper<SkuRow>()

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
          onError={(e) => {
            ;(e.target as HTMLImageElement).style.visibility = "hidden"
          }}
        />
      ) : (
        <div className="h-8 w-8 rounded-md bg-ui-bg-subtle" />
      ),
  }),
  columnHelper.accessor("title", {
    header: "Товар",
    enableSorting: true,
    cell: ({ row }) => row.original.title,
  }),
  columnHelper.accessor((row) => row.skus.join(", "), {
    id: "sku",
    header: "SKU",
    enableSorting: true,
    cell: ({ row }) => (row.original.skus.length > 0 ? row.original.skus.join(", ") : "—"),
  }),
  columnHelper.accessor("collectionTitle", {
    header: "Коллекция",
    enableSorting: true,
    cell: ({ row }) => row.original.collectionTitle ?? "—",
  }),
  columnHelper.accessor("status", {
    header: "Статус",
    cell: ({ row }) => (
      <StatusBadge color={row.original.status === "published" ? "green" : "grey"}>
        {statusLabel(row.original.status)}
      </StatusBadge>
    ),
  }),
]

const WoodrightSkuPage = () => {
  const navigate = useNavigate()
  const [allRows, setAllRows] = useState<SkuRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZE })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchAllProducts()
      .then((products) => {
        if (!cancelled) setAllRows(toRows(products))
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Не удалось загрузить список товаров")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const filteredRows = useMemo(() => {
    if (!search.trim()) return allRows
    return allRows.filter((row) => matchesSearch(row, search.trim()))
  }, [allRows, search])

  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }))
  }, [search])

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
      onSearchChange: setSearch,
    },
    onRowClick: (_event, row) => {
      navigate(`/products/${row.id}`)
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
        <DataTable.Toolbar className="flex items-center justify-between gap-2 px-6 py-4">
          <div>
            <Heading level="h2">SKU</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Все товары и их коды SKU в одном списке. Поиск ищет по названию, SKU и коллекции.
            </Text>
          </div>
          <DataTable.Search placeholder="Поиск по SKU, названию, коллекции…" />
        </DataTable.Toolbar>
        <DataTable.Table />
        <DataTable.Pagination
          translations={{ of: "из", results: "результатов", pages: "страниц", prev: "Назад", next: "Далее" }}
        />
      </DataTable>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "SKU",
  icon: Hashtag,
  nested: "/products",
})

export default WoodrightSkuPage
