import { Button, Container, Heading, Input, Label, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { adminJson, sellerErrorMessage } from "../../../lib/admin-fetch"
import type { WoodrightSiteContacts } from "../../../../lib/woodright-admin/site-contacts"
import { WOODRIGHT_CONTACTS_SOURCE_STATUS } from "../../../../lib/woodright-admin/site-contacts"

type ContactsResponse = {
  configured: boolean
  source_status: string
  live: boolean
  contacts: WoodrightSiteContacts | null
  message?: string
}

const emptyForm = {
  free_display: "",
  free_e164: "",
  write_display: "",
  write_e164: "",
  telegram: false,
  whatsapp: false,
  max: false,
}

const WoodrightContactsPrepPage = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const json = await adminJson<ContactsResponse>("/admin/woodright/contacts")
      if (json.contacts) {
        setForm({
          free_display: json.contacts.free_call.display,
          free_e164: json.contacts.free_call.e164,
          write_display: json.contacts.write_or_call.display,
          write_e164: json.contacts.write_or_call.e164,
          telegram: json.contacts.messengers.telegram.enabled,
          whatsapp: json.contacts.messengers.whatsapp.enabled,
          max: json.contacts.messengers.max.enabled,
        })
      }
    } catch (err) {
      setError(sellerErrorMessage(err, "Не удалось загрузить контакты"))
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
      const json = await adminJson<ContactsResponse>("/admin/woodright/contacts", {
        method: "PUT",
        body: JSON.stringify({
          schema_version: 1,
          free_call: { display: form.free_display, e164: form.free_e164 },
          write_or_call: { display: form.write_display, e164: form.write_e164 },
          messengers: {
            telegram: { enabled: form.telegram },
            whatsapp: { enabled: form.whatsapp },
            max: { enabled: form.max },
          },
        }),
      })
      setNote(json.message ?? "Черновик контактов сохранён")
    } catch (err) {
      setError(sellerErrorMessage(err, "Не удалось сохранить контакты"))
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Link to="/woodright" className="text-ui-fg-subtle text-sm">
          Woodright
        </Link>
        <Heading className="mt-2">Контакты - подготовка</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Эти настройки пока не подключены к публичному сайту
        </Text>
        <Text size="small" className="text-ui-fg-subtle">
          Статус: {WOODRIGHT_CONTACTS_SOURCE_STATUS === "staged_not_live" ? "черновик, не на сайте" : "черновик"}
        </Text>
      </div>
      {loading && (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            Загружаем контакты…
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
      <form
        className="flex flex-col gap-4 px-6 py-4"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="free-display">Бесплатный звонок</Label>
          <Input
            id="free-display"
            value={form.free_display}
            onChange={(event) => setForm((prev) => ({ ...prev, free_display: event.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="free-e164">Бесплатный звонок, международный формат</Label>
          <Input
            id="free-e164"
            value={form.free_e164}
            onChange={(event) => setForm((prev) => ({ ...prev, free_e164: event.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="write-display">Написать или позвонить</Label>
          <Input
            id="write-display"
            value={form.write_display}
            onChange={(event) => setForm((prev) => ({ ...prev, write_display: event.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="write-e164">Написать или позвонить, международный формат</Label>
          <Input
            id="write-e164"
            value={form.write_e164}
            onChange={(event) => setForm((prev) => ({ ...prev, write_e164: event.target.value }))}
          />
        </div>
        <fieldset className="flex flex-col gap-2">
          <Text size="small" weight="plus">
            Мессенджеры
          </Text>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.telegram}
              onChange={(event) => setForm((prev) => ({ ...prev, telegram: event.target.checked }))}
            />
            Telegram
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.whatsapp}
              onChange={(event) => setForm((prev) => ({ ...prev, whatsapp: event.target.checked }))}
            />
            WhatsApp
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.max}
              onChange={(event) => setForm((prev) => ({ ...prev, max: event.target.checked }))}
            />
            MAX
          </label>
        </fieldset>
        <Text size="small" className="text-ui-fg-subtle">
          Адрес шоурума здесь не меняется
        </Text>
        {note && (
          <Text size="small" className="text-ui-fg-subtle">
            {note}
          </Text>
        )}
        <Button type="submit" disabled={loading}>
          Сохранить черновик
        </Button>
      </form>
    </Container>
  )
}

export default WoodrightContactsPrepPage
