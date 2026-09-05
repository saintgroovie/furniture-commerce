import { Button, Input, Label, Text } from "@medusajs/ui"
import { useEffect, useState, type RefObject } from "react"
import { adminJson, sellerErrorMessage } from "../../lib/admin-fetch"
import { useRegisterDirty } from "../../lib/use-dirty-guard"

type Props = {
  productId: string
  title: string
  subtitle: string
  description: string
  onSaved: () => Promise<void> | void
  titleInputRef?: RefObject<HTMLInputElement | null>
}

export function BasicsSection({
  productId,
  title,
  subtitle,
  description,
  onSaved,
  titleInputRef,
}: Props) {
  const [form, setForm] = useState({ title, subtitle, description })
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const dirty =
    form.title !== title || form.subtitle !== subtitle || form.description !== description
  useRegisterDirty("basics", dirty)

  useEffect(() => {
    if (dirty) return
    setForm({ title, subtitle, description })
  }, [title, subtitle, description, dirty])

  const save = async () => {
    const nextTitle = form.title.trim()
    if (!nextTitle) {
      setError("Укажите название")
      return
    }
    if (nextTitle.length > 180) {
      setError("Название слишком длинное")
      return
    }
    setSaving(true)
    setError(null)
    setNote(null)
    try {
      await adminJson(`/admin/products/${productId}`, {
        method: "POST",
        body: JSON.stringify({
          title: nextTitle,
          subtitle: form.subtitle,
          description: form.description,
        }),
      })
      setForm({ title: nextTitle, subtitle: form.subtitle, description: form.description })
      await onSaved()
      setNote("Сохранено")
      window.setTimeout(() => setNote(null), 5000)
    } catch (err) {
      setError(sellerErrorMessage(err, "Не удалось сохранить основное"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="px-6 py-4" id="woodright-basics">
      <Text weight="plus" className="mb-3">
        Основное
      </Text>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="woodright-title">Название</Label>
          <Input
            ref={titleInputRef}
            id="woodright-title"
            value={form.title}
            maxLength={180}
            aria-invalid={Boolean(error && !form.title.trim())}
            onChange={(event) => {
              setError(null)
              setForm((prev) => ({ ...prev, title: event.target.value }))
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="woodright-subtitle">Подзаголовок</Label>
          <Input
            id="woodright-subtitle"
            value={form.subtitle}
            onChange={(event) => {
              setError(null)
              setForm((prev) => ({ ...prev, subtitle: event.target.value }))
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="woodright-description">Описание</Label>
          <textarea
            id="woodright-description"
            className="bg-ui-bg-field border-ui-border-base min-h-24 rounded-md border px-2 py-2 text-sm"
            value={form.description}
            onChange={(event) => {
              setError(null)
              setForm((prev) => ({ ...prev, description: event.target.value }))
            }}
          />
        </div>
        {error && (
          <Text size="small" className="text-ui-fg-error">
            {error}
          </Text>
        )}
        {note && !error && (
          <Text size="small" className="text-ui-fg-subtle">
            {note}
          </Text>
        )}
        <div>
          <Button size="small" disabled={saving} onClick={() => void save()}>
            {saving ? "Сохраняем…" : "Сохранить основное"}
          </Button>
        </div>
      </div>
    </section>
  )
}
