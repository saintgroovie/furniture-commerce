import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Buildings } from "@medusajs/icons"
import { Container, Text } from "@medusajs/ui"
import { Link, useNavigate } from "react-router-dom"
import { DeskFrame } from "../../components/woodright/DeskNav"
import { RecentlyOpened } from "../../components/woodright/RecentlyOpened"
import { useDeskExtras } from "../../lib/use-desk-extras"
import { useWoodrightProducts } from "../../lib/use-woodright-products"
import type { SellerProduct } from "../../../lib/woodright-admin/seller-product-types"
import {
  buildDeskInbox,
  type DeskCatalogHint,
  type DeskInboxItem,
} from "../../../lib/woodright-admin/seller-desk"

function toHints(products: SellerProduct[]): DeskCatalogHint[] {
  return products.map((product) => ({
    id: product.id,
    title: product.title,
    sku: product.skus[0] ?? null,
    missing_media: !product.readiness.has_media,
    missing_price: product.classification !== "BESPOKE" && !product.readiness.has_price,
    published_invisible: product.status === "published" && !product.readiness.visible,
  }))
}

const WoodrightOverviewPage = () => {
  const navigate = useNavigate()
  const { data, loading, error } = useWoodrightProducts()
  const extras = useDeskExtras()
  const leadsById = new Map(extras.leads.map((l) => [l.id, l]))
  const inbox = buildDeskInbox({
    now: new Date(),
    products: toHints(data?.products ?? []),
    requests: extras.requests.map((r) => ({
      id: r.id,
      lead_id: r.lead_id,
      lead_name: leadsById.get(r.lead_id)?.name ?? null,
      status: r.status,
      comment: r.comment ?? null,
      created_at: r.created_at ?? r.updated_at ?? null,
    })),
    processes: extras.processes.map((p) => ({
      id: p.id,
      order_id: p.order_id,
      current_stage: p.current_stage,
    })),
  })
  const overdue = inbox.filter((i) => i.overdue)
  const due = inbox.filter((i) => !i.overdue)
  const newRequests = extras.requests.filter((r) => r.status === "new" || r.status === "contacted").length
  const blockers = new Set(
    (data?.products ?? [])
      .filter((product) => {
        const missingMedia = !product.readiness.has_media
        const missingPrice = product.classification !== "BESPOKE" && !product.readiness.has_price
        const invisible = product.status === "published" && !product.readiness.visible
        return missingMedia || missingPrice || invisible
      })
      .map((product) => product.id)
  ).size
  const waiting = extras.processes.filter((p) => p.current_stage === "awaiting_customer_approval").length
  const mediaNeed = data?.attention.missing_media ?? 0
  const busy = loading || extras.loading

  return (
    <Container className="divide-y p-0">
      <DeskFrame
        title="Что сделать сегодня"
        lead="Очередь дел, не дерево CMS"
        active="today"
      >
        {error ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-error">
              {error}
            </Text>
          </div>
        ) : null}
        {extras.error ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-error">
              Заявки и заказы: {extras.error}
            </Text>
          </div>
        ) : null}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 py-4">
          <StatButton label="Новые заявки" value={newRequests} onClick={() => navigate("/woodright/requests")} />
          <StatButton label="Товары с блокером" value={blockers} onClick={() => navigate("/woodright/products")} />
          <StatButton label="Ждут клиента" value={waiting} onClick={() => navigate("/woodright/production")} />
          <StatButton label="Кадра не хватает" value={mediaNeed} onClick={() => navigate("/woodright/media")} />
        </div>
        {busy ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              Загружаем очередь…
            </Text>
          </div>
        ) : null}
        <InboxGroup title="Просрочено" items={overdue} />
        <InboxGroup title="На сегодня" items={due} />
        <RecentlyOpened products={data?.products ?? []} />
      </DeskFrame>
    </Container>
  )
}

function StatButton({
  label,
  value,
  onClick,
}: {
  label: string
  value: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-md border border-ui-border-base px-3 py-3"
    >
      <div className="text-2xl font-medium">{value}</div>
      <Text size="small" className="text-ui-fg-subtle">
        {label}
      </Text>
    </button>
  )
}

function InboxGroup({ title, items }: { title: string; items: DeskInboxItem[] }) {
  return (
    <div className="px-6 py-4">
      <Text weight="plus" className="mb-3">
        {title}
        {items.length ? ` · ${items.length}` : ""}
      </Text>
      {items.length === 0 ? (
        <Text size="small" className="text-ui-fg-subtle">
          Очередь пустая
        </Text>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link to={item.href} className="flex items-start justify-between gap-3 text-sm">
                <span>
                  <span className="font-medium">{item.title}</span>
                  <span className="block text-ui-fg-subtle">{item.hint}</span>
                </span>
                <span className={item.overdue ? "text-ui-fg-error" : "text-ui-fg-subtle"}>
                  {item.action}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Woodright",
  icon: Buildings,
})

export default WoodrightOverviewPage
