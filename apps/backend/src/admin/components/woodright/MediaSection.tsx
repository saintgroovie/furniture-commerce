import { Button, Text } from "@medusajs/ui"
import { Link } from "react-router-dom"
import { resolveAdminImageSrc } from "./site-status-labels"

type Props = {
  productId: string
  thumbnail: string | null
  imageUrls: string[]
  executionGuard: boolean
}

export function MediaSection({ productId, thumbnail, imageUrls, executionGuard }: Props) {
  const previews = imageUrls.slice(0, 8)

  return (
    <section className="px-6 py-4">
      <Text weight="plus" className="mb-1">
        Фотографии
      </Text>
      {previews.length === 0 ? (
        <Text size="small" className="text-ui-fg-subtle mb-3">
          У товара пока нет фотографий
        </Text>
      ) : (
        <div className="mb-3 flex flex-wrap gap-2">
          {previews.map((url) => {
            const src = resolveAdminImageSrc(url)
            const isHero = thumbnail != null && (url === thumbnail || src === resolveAdminImageSrc(thumbnail))
            return (
              <img
                key={url}
                src={src}
                alt={isHero ? "Обложка товара" : ""}
                className={`h-16 w-16 rounded-md border object-cover ${
                  isHero ? "border-ui-border-strong" : "border-ui-border-base"
                }`}
                onError={(event) => {
                  ;(event.target as HTMLImageElement).style.opacity = "0.35"
                }}
              />
            )
          })}
        </div>
      )}
      <Text size="small" className="text-ui-fg-subtle mb-3">
        {thumbnail ? "Обложка отмечена рамкой" : "Обложка не выбрана"}
        {imageUrls.length > 0 ? ` · ${imageUrls.length} фото` : ""}
      </Text>
      {executionGuard && (
        <div className="mb-3 rounded-md border border-ui-border-base bg-ui-bg-subtle p-3">
          <Text size="small" weight="plus">
            У этого товара есть фотографии исполнений
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            Обычные фотографии товара можно изменить здесь, но фотографии отдельных материалов и отделок управляются отдельно
          </Text>
        </div>
      )}
      <Button variant="secondary" size="small" asChild>
        <Link to={`/products/${productId}`} aria-label="Редактировать фотографии в карточке товара">
          Редактировать фотографии
        </Link>
      </Button>
    </section>
  )
}
