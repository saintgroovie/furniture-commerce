import { Button, Prompt, Text } from "@medusajs/ui"
import { useState } from "react"
import {
  buildPublishChecklist,
  type ChecklistAction,
} from "../../../lib/woodright-admin/publish-checklist"
import type { WorkspacePublishReadiness } from "../../../lib/woodright-admin/publish-readiness"

type Props = {
  publish: WorkspacePublishReadiness
  published: boolean
  onPublish?: () => void
  publishing?: boolean
  publishError?: string | null
  onAction?: (action: ChecklistAction) => void
}

export function PublishChecklist({
  publish,
  published,
  onPublish,
  publishing,
  publishError,
  onAction,
}: Props) {
  const items = buildPublishChecklist(publish)
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <section className="px-6 py-4" aria-labelledby="woodright-publish-checklist">
      <Text id="woodright-publish-checklist" weight="plus" className="mb-3">
        Нужно сделать перед публикацией
      </Text>
      <ul className="mb-3 flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-baseline gap-2">
            <Text size="small">
              {item.kind === "done" ? "✓" : item.kind === "blocker" ? "✕" : "!"} {item.label}
            </Text>
            {item.kind === "warning" && (
              <Text size="small" className="text-ui-fg-subtle">
                можно опубликовать без них
              </Text>
            )}
            {item.adminOnly && item.kind !== "done" && (
              <Text size="small" className="text-ui-fg-subtle">
                Изменить может администратор
              </Text>
            )}
            {item.action && onAction && (
              <button
                type="button"
                className="text-sm underline"
                onClick={() => onAction(item.action!)}
              >
                {item.action === "focus_price"
                  ? "Добавить цену"
                  : item.action === "focus_media"
                    ? "Добавить фото"
                    : "Указать название"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {!published && onPublish && (
        <>
          <Button
            size="small"
            disabled={publishing || !publish.ready}
            onClick={() => setConfirmOpen(true)}
          >
            {publishing ? "Публикуем…" : "Опубликовать"}
          </Button>
          <Prompt open={confirmOpen} onOpenChange={setConfirmOpen} variant="confirmation">
            <Prompt.Content>
              <Prompt.Header>
                <Prompt.Title>Опубликовать товар?</Prompt.Title>
                <Prompt.Description>
                  Товар станет опубликованным. Если покупатель его всё ещё не найдёт, мы покажем
                  причину
                </Prompt.Description>
              </Prompt.Header>
              <Prompt.Footer>
                <Prompt.Cancel>Отмена</Prompt.Cancel>
                <Prompt.Action
                  onClick={() => {
                    setConfirmOpen(false)
                    onPublish()
                  }}
                >
                  Опубликовать
                </Prompt.Action>
              </Prompt.Footer>
            </Prompt.Content>
          </Prompt>
        </>
      )}
      {!published && !publish.ready && (
        <Text size="small" className="text-ui-fg-subtle mt-2">
          Опубликовать можно после закрытия пунктов со знаком ✕
        </Text>
      )}
      {publishError && (
        <Text size="small" className="text-ui-fg-error mt-2">
          {publishError}
        </Text>
      )}
    </section>
  )
}
