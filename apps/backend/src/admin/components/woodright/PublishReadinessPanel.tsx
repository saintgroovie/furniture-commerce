import { Button, Text } from "@medusajs/ui"
import type { WorkspacePublishReadiness } from "../../../lib/woodright-admin/publish-readiness"

type Props = {
  publish: WorkspacePublishReadiness
  onPublish?: () => void
  publishing?: boolean
  publishError?: string | null
}

export function PublishReadinessPanel({
  publish,
  onPublish,
  publishing,
  publishError,
}: Props) {
  return (
    <section className="px-6 py-4">
      <Text weight="plus" className="mb-1">
        Проверка перед публикацией
      </Text>
      {publish.ready ? (
        <Text size="small" className="text-ui-fg-subtle mb-3">
          Всё готово к публикации
        </Text>
      ) : (
        <div className="mb-3">
          <Text size="small" className="mb-2">
            Пока нельзя опубликовать
          </Text>
          <ul className="flex flex-col gap-1">
            {publish.blockers.map((item) => (
              <li key={item.code}>
                <Text size="small" className="text-ui-fg-error">
                  {item.message}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      )}
      {publish.warnings.length > 0 && (
        <div className="mb-3">
          <Text size="small" className="mb-2">
            Обратите внимание
          </Text>
          <ul className="flex flex-col gap-1">
            {publish.warnings.map((item) => (
              <li key={item.code}>
                <Text size="small" className="text-ui-fg-subtle">
                  {item.message}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      )}
      {onPublish && publish.ready && (
        <Button size="small" disabled={publishing} onClick={onPublish}>
          {publishing ? "Публикуем…" : "Опубликовать"}
        </Button>
      )}
      {publishError && (
        <Text size="small" className="text-ui-fg-error mt-2">
          {publishError}
        </Text>
      )}
    </section>
  )
}
