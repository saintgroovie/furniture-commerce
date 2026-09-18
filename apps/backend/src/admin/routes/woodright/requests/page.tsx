import { Button, Container, Text } from "@medusajs/ui"
import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { DeskFrame } from "../../../components/woodright/DeskNav"
import { adminJson, sellerErrorMessage } from "../../../lib/admin-fetch"
import { useDeskExtras } from "../../../lib/use-desk-extras"
import { BESPOKE_STATUS_LABEL } from "../../../../lib/woodright-admin/seller-desk"

const WoodrightRequestsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const extras = useDeskExtras()
  const selectedId = searchParams.get("id")
  const leadsById = useMemo(
    () => new Map(extras.leads.map((l) => [l.id, l])),
    [extras.leads]
  )
  const selected =
    extras.requests.find((r) => r.id === selectedId) ?? extras.requests[0] ?? null
  const selectedLead = selected ? leadsById.get(selected.lead_id) : undefined
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const markQuoted = async (id: string) => {
    setBusy(true)
    setNote(null)
    try {
      await adminJson(`/admin/bespoke-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "quote_sent",
          quoted_at: new Date().toISOString(),
        }),
      })
      await extras.reload()
      setNote("Отметили: расчёт отправлен")
    } catch (err) {
      setNote(sellerErrorMessage(err, "Не удалось обновить заявку"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Container className="divide-y p-0">
      <DeskFrame
        title="Заявки"
        lead="По проекту и готовые позиции в одной очереди"
        active="requests"
      >
        {extras.error ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-error">
              {extras.error}
            </Text>
          </div>
        ) : null}
        {extras.loading ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              Загружаем заявки…
            </Text>
          </div>
        ) : null}
        {note ? (
          <div className="px-6 py-4">
            <Text size="small">{note}</Text>
          </div>
        ) : null}
        <div className="grid md:grid-cols-[1.4fr_0.8fr] gap-0">
          <div className="px-6 py-4">
            {extras.requests.length === 0 && !extras.loading && !extras.error ? (
              <Text size="small" className="text-ui-fg-subtle">
                Заявок пока нет
              </Text>
            ) : (
              <ul className="flex flex-col gap-3">
                {extras.requests.map((row) => {
                  const lead = leadsById.get(row.lead_id)
                  const active = selected?.id === row.id
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        className={`w-full text-left ${active ? "font-medium" : ""}`}
                        onClick={() => {
                          const next = new URLSearchParams(searchParams)
                          next.set("id", row.id)
                          setSearchParams(next)
                        }}
                      >
                        <span className="block text-sm">
                          {(lead?.name && lead.name.trim()) || "Без имени"}
                        </span>
                        <span className="block text-ui-fg-subtle text-sm">
                          {row.comment?.trim() || "Без комментария"}
                          {" · "}
                          {BESPOKE_STATUS_LABEL[row.status] ?? row.status}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          {selected ? (
            <div className="px-6 py-4 border-t md:border-t-0 md:border-l border-ui-border-base">
              <Text weight="plus">Переписка и статус</Text>
              <Text size="small" className="text-ui-fg-subtle mt-2">
                {selected.comment?.trim() || "Комментария нет"}
              </Text>
              {selected.dimensions ? (
                <Text size="small" className="mt-2">
                  Размеры: {selected.dimensions}
                </Text>
              ) : (
                <Text size="small" className="text-ui-fg-subtle mt-2">
                  Размеры ещё не прислали
                </Text>
              )}
              {selected.materials ? (
                <Text size="small" className="mt-1">
                  Материалы: {selected.materials}
                </Text>
              ) : null}
              <Text size="small" className="mt-2">
                {BESPOKE_STATUS_LABEL[selected.status] ?? selected.status}
              </Text>
              {selectedLead?.phone ? (
                <Text size="small" className="mt-2">
                  {selectedLead.phone}
                </Text>
              ) : null}
              {selectedLead?.email ? (
                <Text size="small" className="mt-1">
                  {selectedLead.email}
                </Text>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {selected.status === "new" || selected.status === "contacted" ? (
                  <Button
                    size="small"
                    disabled={busy}
                    onClick={() => void markQuoted(selected.id)}
                  >
                    Отметить: расчёт отправлен
                  </Button>
                ) : null}
                <Link
                  to={`/woodright/people?id=${encodeURIComponent(selected.lead_id)}`}
                  className="text-sm text-ui-fg-subtle"
                >
                  Человек
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </DeskFrame>
    </Container>
  )
}

export default WoodrightRequestsPage
