import { Button, Container, Heading, Input, Label, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { adminJson, sellerErrorMessage } from "../../../lib/admin-fetch"
import type {
  WoodrightPartner,
  WoodrightPartnerPresentation,
} from "../../../../lib/woodright-admin/site-partners"

type PartnersResponse = {
  schema_version: 1
  partners: WoodrightPartner[]
  message?: string
}

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function emptyPartner(): WoodrightPartner {
  return {
    id: newId("p"),
    slug: "",
    name: "",
    description: null,
    logo_url: null,
    website_url: null,
    images: [],
    featured: false,
    sort_order: 0,
    is_active: false,
    presentations: [],
  }
}

function emptyPresentation(): WoodrightPartnerPresentation {
  return {
    id: newId("deck"),
    title: "",
    file_url: "",
    cover_url: null,
    page_count: null,
    mime: "application/pdf",
  }
}

const WoodrightPartnersPage = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [partners, setPartners] = useState<WoodrightPartner[]>([])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const json = await adminJson<PartnersResponse>("/admin/woodright/partners")
      setPartners(json.partners ?? [])
    } catch (err) {
      setError(sellerErrorMessage(err, "Не удалось загрузить партнёров"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const save = async () => {
    setError(null)
    setNote(null)
    try {
      const json = await adminJson<PartnersResponse>("/admin/woodright/partners", {
        method: "PUT",
        body: JSON.stringify({ schema_version: 1, partners }),
      })
      setPartners(json.partners)
      setNote(json.message ?? "Список партнёров сохранён")
    } catch (err) {
      setError(sellerErrorMessage(err, "Не удалось сохранить партнёров"))
    }
  }

  const update = (id: string, patch: Partial<WoodrightPartner>) => {
    setPartners((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Link to="/woodright" className="text-ui-fg-subtle text-sm">
          Woodright
        </Link>
        <Heading className="mt-2">Партнёры</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Публичный индекс. Не добавляйте компании без подтверждения и прав на логотип
        </Text>
      </div>
      {loading && (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            Загружаем партнёров…
          </Text>
        </div>
      )}
      {error && (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-error">
            {error}
          </Text>
        </div>
      )}
      {note && (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            {note}
          </Text>
        </div>
      )}
      <div className="flex flex-col gap-6 px-6 py-4">
        {partners.length === 0 && !loading && (
          <Text size="small" className="text-ui-fg-subtle">
            Пока нет записей. Индекс на сайте останется пустым, пока не появится подтверждённый партнёр
          </Text>
        )}
        {partners.map((partner) => (
          <fieldset key={partner.id} className="flex flex-col gap-3 rounded-md border border-ui-border-base p-4">
            <legend className="px-1 text-sm font-medium">{partner.name || "Новый партнёр"}</legend>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${partner.id}-name`}>Название</Label>
                <Input
                  id={`${partner.id}-name`}
                  value={partner.name}
                  onChange={(event) => update(partner.id, { name: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${partner.id}-slug`}>Slug</Label>
                <Input
                  id={`${partner.id}-slug`}
                  value={partner.slug}
                  onChange={(event) => update(partner.id, { slug: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1 md:col-span-2">
                <Label htmlFor={`${partner.id}-description`}>Короткое описание</Label>
                <Input
                  id={`${partner.id}-description`}
                  value={partner.description ?? ""}
                  onChange={(event) => update(partner.id, { description: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${partner.id}-logo`}>Логотип, URL</Label>
                <Input
                  id={`${partner.id}-logo`}
                  value={partner.logo_url ?? ""}
                  onChange={(event) => update(partner.id, { logo_url: event.target.value || null })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${partner.id}-site`}>Сайт</Label>
                <Input
                  id={`${partner.id}-site`}
                  value={partner.website_url ?? ""}
                  onChange={(event) => update(partner.id, { website_url: event.target.value || null })}
                />
              </div>
              <div className="flex flex-col gap-1 md:col-span-2">
                <Label htmlFor={`${partner.id}-images`}>Изображения, по одному URL</Label>
                <textarea
                  id={`${partner.id}-images`}
                  className="min-h-20 rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm"
                  value={partner.images.join("\n")}
                  onChange={(event) =>
                    update(partner.id, {
                      images: event.target.value
                        .split("\n")
                        .map((line) => line.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${partner.id}-sort`}>Порядок</Label>
                <Input
                  id={`${partner.id}-sort`}
                  type="number"
                  value={String(partner.sort_order)}
                  onChange={(event) =>
                    update(partner.id, { sort_order: Number.parseInt(event.target.value, 10) || 0 })
                  }
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={partner.is_active}
                onChange={(event) => update(partner.id, { is_active: event.target.checked })}
              />
              Показывать на сайте
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={partner.featured}
                onChange={(event) => update(partner.id, { featured: event.target.checked })}
              />
              Выделить в индексе
            </label>
            <Text size="small" className="text-ui-fg-subtle">
              Логотип, фото и PDF: только путь Medusa `/static/partners/…`. На сайте это `/product-static/partners/…`. Внешние https-файлы нельзя - их режет CSP
            </Text>
            {partner.presentations.map((deck, deckIndex) => (
              <div key={deck.id} className="grid gap-2 rounded-md bg-ui-bg-subtle p-3 md:grid-cols-2">
                <Input
                  aria-label="Название презентации"
                  placeholder="Название презентации"
                  value={deck.title}
                  onChange={(event) => {
                    const presentations = partner.presentations.map((row, index) =>
                      index === deckIndex ? { ...row, title: event.target.value } : row
                    )
                    update(partner.id, { presentations })
                  }}
                />
                <Input
                  aria-label="Файл презентации"
                  placeholder="/static/partners/name.pdf"
                  value={deck.file_url}
                  onChange={(event) => {
                    const presentations = partner.presentations.map((row, index) =>
                      index === deckIndex ? { ...row, file_url: event.target.value } : row
                    )
                    update(partner.id, { presentations })
                  }}
                />
                <Input
                  aria-label="Обложка"
                  placeholder="Обложка, URL"
                  value={deck.cover_url ?? ""}
                  onChange={(event) => {
                    const presentations = partner.presentations.map((row, index) =>
                      index === deckIndex ? { ...row, cover_url: event.target.value || null } : row
                    )
                    update(partner.id, { presentations })
                  }}
                />
                <Input
                  aria-label="Число страниц"
                  type="number"
                  placeholder="Страниц"
                  value={deck.page_count == null ? "" : String(deck.page_count)}
                  onChange={(event) => {
                    const raw = event.target.value
                    const presentations = partner.presentations.map((row, index) =>
                      index === deckIndex
                        ? { ...row, page_count: raw ? Number.parseInt(raw, 10) : null }
                        : row
                    )
                    update(partner.id, { presentations })
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    update(partner.id, {
                      presentations: partner.presentations.filter((_, index) => index !== deckIndex),
                    })
                  }
                >
                  Удалить презентацию
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  update(partner.id, { presentations: [...partner.presentations, emptyPresentation()] })
                }
              >
                Добавить презентацию
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPartners((prev) => prev.filter((row) => row.id !== partner.id))}
              >
                Удалить партнёра
              </Button>
            </div>
          </fieldset>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setPartners((prev) => [...prev, emptyPartner()])}>
            Добавить партнёра
          </Button>
          <Button type="button" onClick={() => void save()} disabled={loading}>
            Сохранить
          </Button>
        </div>
      </div>
    </Container>
  )
}

export default WoodrightPartnersPage
