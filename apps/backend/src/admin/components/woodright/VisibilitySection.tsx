import { Button, Prompt, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { adminJson, sellerErrorMessage } from "../../lib/admin-fetch"
import type { WorkspacePublishReadiness } from "../../../lib/woodright-admin/publish-readiness"

type Props = {
  productId: string
  status: string
  visible: boolean
  publish: WorkspacePublishReadiness
  onSaved: () => Promise<void> | void
}

export function VisibilitySection({ productId, status, visible, publish, onSaved }: Props) {
  const published = status === "published"
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [publishNote, setPublishNote] = useState<string | null>(null)
  const [awaitingPublishResult, setAwaitingPublishResult] = useState(false)

  useEffect(() => {
    if (!awaitingPublishResult) return
    if (status !== "published") return
    setPublishNote(visible ? null : "Товар опубликован, но пока не виден на сайте")
    setAwaitingPublishResult(false)
  }, [awaitingPublishResult, status, visible])

  const hide = async () => {
    setSaving(true)
    setError(null)
    setPublishNote(null)
    try {
      await adminJson(`/admin/products/${productId}`, {
        method: "POST",
        body: JSON.stringify({ status: "draft" }),
      })
      await onSaved()
    } catch (err) {
      setError(sellerErrorMessage(err, "Не удалось скрыть товар"))
    } finally {
      setSaving(false)
      setOpen(false)
    }
  }

  const publishProduct = async () => {
    setSaving(true)
    setError(null)
    setPublishNote(null)
    try {
      await adminJson(`/admin/woodright/products/${productId}/publish`, {
        method: "POST",
        body: JSON.stringify({}),
      })
      await onSaved()
      setAwaitingPublishResult(true)
    } catch (err) {
      setError(sellerErrorMessage(err, "Пока нельзя опубликовать"))
    } finally {
      setSaving(false)
      setOpen(false)
    }
  }

  return (
    <section className="px-6 py-4">
      <Text weight="plus" className="mb-1">
        Видимость
      </Text>
      <Text size="small" className="text-ui-fg-subtle mb-3">
        {published
          ? visible
            ? "Покупатели видят этот товар на сайте"
            : "Товар опубликован, но пока не виден на сайте"
          : "Товар скрыт с сайта. Данные и фотографии сохранены"}
      </Text>
      {published ? (
        <>
          <Button
            variant="secondary"
            size="small"
            disabled={saving}
            onClick={() => setOpen(true)}
          >
            Скрыть с сайта
          </Button>
          <Prompt open={open} onOpenChange={setOpen} variant="danger">
            <Prompt.Content>
              <Prompt.Header>
                <Prompt.Title>Скрыть товар с сайта?</Prompt.Title>
                <Prompt.Description>
                  Покупатели больше не увидят эту позицию. Данные и фотографии сохранятся
                </Prompt.Description>
              </Prompt.Header>
              <Prompt.Footer>
                <Prompt.Cancel>Отмена</Prompt.Cancel>
                <Prompt.Action onClick={() => void hide()}>Скрыть товар</Prompt.Action>
              </Prompt.Footer>
            </Prompt.Content>
          </Prompt>
        </>
      ) : (
        <>
          <Button
            size="small"
            disabled={saving || !publish.ready}
            onClick={() => setOpen(true)}
          >
            Показать на сайте
          </Button>
          {!publish.ready && (
            <Text size="small" className="text-ui-fg-subtle mt-2">
              Сначала закройте пункты в проверке перед публикацией
            </Text>
          )}
          <Prompt open={open} onOpenChange={setOpen}>
            <Prompt.Content>
              <Prompt.Header>
                <Prompt.Title>Опубликовать товар?</Prompt.Title>
                <Prompt.Description>
                  Товар станет опубликованным. Если его всё ещё не будет видно на сайте, мы покажем причину
                </Prompt.Description>
              </Prompt.Header>
              <Prompt.Footer>
                <Prompt.Cancel>Отмена</Prompt.Cancel>
                <Prompt.Action onClick={() => void publishProduct()}>Опубликовать</Prompt.Action>
              </Prompt.Footer>
            </Prompt.Content>
          </Prompt>
        </>
      )}
      {error && (
        <Text size="small" className="text-ui-fg-error mt-2">
          {error}
        </Text>
      )}
      {publishNote && (
        <Text size="small" className="text-ui-fg-subtle mt-2">
          {publishNote}
        </Text>
      )}
    </section>
  )
}
