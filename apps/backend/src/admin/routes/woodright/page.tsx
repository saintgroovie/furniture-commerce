import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Buildings } from "@medusajs/icons"
import { Container, Heading, Text } from "@medusajs/ui"
import { Link, useSearchParams } from "react-router-dom"
import type { AttentionFilter } from "../../../lib/woodright-admin/seller-product-types"
import { NeedToDo } from "../../components/woodright/NeedToDo"
import { RecentlyOpened } from "../../components/woodright/RecentlyOpened"
import { SellerProductsList } from "../../components/woodright/SellerProductsList"
import { useWoodrightProducts } from "../../lib/use-woodright-products"

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

const WoodrightOverviewPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data, loading, error } = useWoodrightProducts()
  const search = searchParams.get("q") ?? ""
  const filter = parseFilter(searchParams.get("filter"))

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading>Woodright</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Найдите товар, проверьте готовность и измените цену, размеры или видимость
        </Text>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <Link to="/woodright/contacts" className="text-ui-fg-subtle">
            Контакты
          </Link>
        </div>
      </div>
      {error && (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-error">
            {error}
          </Text>
        </div>
      )}
      <NeedToDo attention={data?.attention} />
      <RecentlyOpened products={data?.products ?? []} />
      <SellerProductsList
        products={data?.products ?? []}
        loading={loading}
        search={search}
        filter={filter}
        showSuggestions
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

export const config = defineRouteConfig({
  label: "Woodright",
  icon: Buildings,
})

export default WoodrightOverviewPage
