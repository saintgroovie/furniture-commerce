import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Buildings } from "@medusajs/icons"
import { Container, Text } from "@medusajs/ui"
import { Link } from "react-router-dom"
import { CatalogOpsBoard } from "../../components/woodright/CatalogOpsBoard"
import { DeskFrame } from "../../components/woodright/DeskNav"
import { useDeskExtras } from "../../lib/use-desk-extras"
import { useWoodrightProducts } from "../../lib/use-woodright-products"
import {
  buildDeskInbox,
  type DeskInboxItem,
} from "../../../lib/woodright-admin/seller-desk"

const WoodrightOverviewPage = () => {
  const { data, loading, error } = useWoodrightProducts()
  const extras = useDeskExtras()
  const leadsById = new Map(extras.leads.map((lead) => [lead.id, lead]))
  const otherWork = buildDeskInbox({
    now: new Date(),
    products: [],
    requests: extras.requests.map((request) => ({
      id: request.id,
      lead_id: request.lead_id,
      lead_name: leadsById.get(request.lead_id)?.name ?? null,
      status: request.status,
      comment: request.comment ?? null,
      created_at: request.created_at ?? request.updated_at ?? null,
    })),
    processes: extras.processes.map((process) => ({
      id: process.id,
      order_id: process.order_id,
      current_stage: process.current_stage,
    })),
  })

  return (
    <Container className="divide-y p-0">
      <DeskFrame title="Каталог" lead="Только то, что ещё можно закрыть" active="today">
        {error ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-error">
              {error}
            </Text>
          </div>
        ) : null}
        {loading ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              Загружаем каталог…
            </Text>
          </div>
        ) : (
          <CatalogOpsBoard products={data?.products ?? []} />
        )}
        {otherWork.length > 0 ? (
          <div className="px-6 py-4 border-t border-ui-border-base">
            <Text weight="plus" className="mb-3">
              Заявки и заказы
            </Text>
            <ul className="flex flex-col gap-2">
              {otherWork.map((item) => (
                <OtherRow key={item.id} item={item} />
              ))}
            </ul>
          </div>
        ) : null}
      </DeskFrame>
    </Container>
  )
}

function OtherRow({ item }: { item: DeskInboxItem }) {
  return (
    <li>
      <Link to={item.href} className="flex items-start justify-between gap-3 text-sm min-w-0">
        <span className="min-w-0">
          <span className="font-medium">{item.title}</span>
          <span className="block text-ui-fg-subtle break-words">{item.hint}</span>
        </span>
        <span className="text-ui-fg-subtle shrink-0">{item.action}</span>
      </Link>
    </li>
  )
}

export const config = defineRouteConfig({
  label: "Woodright",
  icon: Buildings,
})

export default WoodrightOverviewPage
