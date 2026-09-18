import { Container, Text } from "@medusajs/ui"
import { Link, useSearchParams } from "react-router-dom"
import { DeskFrame } from "../../../components/woodright/DeskNav"
import { useDeskExtras } from "../../../lib/use-desk-extras"
import { buildDeskPeople } from "../../../../lib/woodright-admin/seller-desk"
import { formatRubAmount } from "../../../../lib/woodright-admin/price-sanity"

function formatDeskLinkAmount(amount: number, currency: string): string {
  const code = (currency || "RUB").toUpperCase()
  if (code === "RUB") return formatRubAmount(amount)
  const formatted = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(amount)
  return `${formatted}\u00a0${code}`
}

const WoodrightPeoplePage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const extras = useDeskExtras()
  const people = buildDeskPeople(
    extras.leads.map((l) => ({ id: l.id, name: l.name ?? null, source: l.source ?? null })),
    extras.requests.map((r) => ({
      id: r.id,
      lead_id: r.lead_id,
      lead_name: extras.leads.find((l) => l.id === r.lead_id)?.name ?? null,
      status: r.status,
      comment: r.comment ?? null,
      created_at: r.created_at ?? null,
    }))
  )
  const selectedId = searchParams.get("id")
  const selected = people.find((p) => p.id === selectedId) ?? people[0] ?? null
  const lead = extras.leads.find((l) => l.id === selected?.id)
  const personLinks = extras.links.filter(
    (l) => l.entity_type === "lead" && l.entity_id === selected?.id
  )

  return (
    <Container className="divide-y p-0">
      <DeskFrame
        title="Люди"
        lead="Заявка, заказ и счёт одного человека"
        active="people"
      >
        {extras.loading ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              Загружаем…
            </Text>
          </div>
        ) : null}
        {extras.error ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-error">
              {extras.error}
            </Text>
          </div>
        ) : null}
        <div className="grid md:grid-cols-[1fr_1fr] gap-0">
          <div className="px-6 py-4">
            {people.length === 0 && !extras.loading && !extras.error ? (
              <Text size="small" className="text-ui-fg-subtle">
                Пока никого нет
              </Text>
            ) : (
              <ul className="flex flex-col gap-2">
                {people.map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      className="text-left text-sm"
                      onClick={() => {
                        const next = new URLSearchParams(searchParams)
                        next.set("id", person.id)
                        setSearchParams(next)
                      }}
                    >
                      <span className="font-medium">{person.name}</span>
                      <span className="block text-ui-fg-subtle">
                        {person.request_count} заявок
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {selected ? (
            <div className="px-6 py-4 border-t md:border-t-0 md:border-l border-ui-border-base">
              <Text weight="plus">{selected.name}</Text>
              {lead?.source ? (
                <Text size="small" className="text-ui-fg-subtle mt-1">
                  Источник: {lead.source === "bespoke" ? "По проекту" : lead.source}
                </Text>
              ) : null}
              {lead?.phone ? (
                <Text size="small" className="mt-2">
                  {lead.phone}
                </Text>
              ) : null}
              {lead?.email ? (
                <Text size="small" className="mt-1">
                  {lead.email}
                </Text>
              ) : null}
              {!lead?.phone && !lead?.email && !extras.error ? (
                <Text size="small" className="text-ui-fg-subtle mt-2">
                  Телефона и почты в заявке нет
                </Text>
              ) : null}
              <div className="mt-3 flex flex-col gap-1">
                {selected.request_ids.map((id) => (
                  <Link key={id} to={`/woodright/requests?id=${encodeURIComponent(id)}`} className="text-sm">
                    Заявка
                  </Link>
                ))}
              </div>
              <div className="mt-4">
                <Text size="small" className="text-ui-fg-subtle">
                  Счета
                </Text>
                {personLinks.length === 0 ? (
                  extras.error ? null : (
                  <Text size="small" className="text-ui-fg-subtle mt-1">
                    Ссылок на счёт нет. Реквизиты на витрину не публикуем
                  </Text>
                  )
                ) : (
                  personLinks.map((link) => (
                    <Text key={link.id} size="small" className="mt-1">
                      {formatDeskLinkAmount(link.amount, link.currency_code)}
                      {" · "}
                      {link.status === "sent"
                        ? "ссылка отправлена"
                        : link.status === "paid"
                          ? "оплачено"
                          : link.status}
                    </Text>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>
      </DeskFrame>
    </Container>
  )
}

export default WoodrightPeoplePage
