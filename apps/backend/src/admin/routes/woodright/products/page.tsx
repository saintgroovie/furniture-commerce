import { Container, Text } from "@medusajs/ui"
import { useSearchParams } from "react-router-dom"
import type { AttentionFilter } from "../../../../lib/woodright-admin/seller-product-types"
import { SellerProductsList } from "../../../components/woodright/SellerProductsList"
import { useWoodrightProducts } from "../../../lib/use-woodright-products"

function parseFilter(raw: string | null): AttentionFilter {
  if (
    raw === "missing_media" ||
    raw === "missing_price" ||
    raw === "drafts" ||
    raw === "published_invisible"
  ) {
    return raw
  }
  return "all"
}

const WoodrightProductsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data, loading, error } = useWoodrightProducts()
  const search = searchParams.get("q") ?? ""
  const filter = parseFilter(searchParams.get("filter"))

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
      <SellerProductsList
        products={data?.products ?? []}
        loading={loading}
        search={search}
        filter={filter}
        onSearchChange={(value) => {
          const next = new URLSearchParams(searchParams)
          if (value.trim()) next.set("q", value)
          else next.delete("q")
          setSearchParams(next)
        }}
        onFilterChange={(nextFilter) => {
          const next = new URLSearchParams(searchParams)
          if (nextFilter === "all") next.delete("filter")
          else next.set("filter", nextFilter)
          setSearchParams(next)
        }}
      />
    </Container>
  )
}

export default WoodrightProductsPage
