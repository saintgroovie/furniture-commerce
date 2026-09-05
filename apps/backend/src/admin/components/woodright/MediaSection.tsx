import { Button, Text } from "@medusajs/ui"
import { Link } from "react-router-dom"
import { resolveAdminImageSrc } from "./site-status-labels"
import type { SellerExecutionFinish } from "../../../lib/woodright-admin/seller-product-types"

type Props = {
  productId: string
  thumbnail: string | null
  generalImageUrls: string[]
  executionPhotoCount: number
  executionFinishes: SellerExecutionFinish[]
}

export function MediaSection({
  productId,
  thumbnail,
  generalImageUrls,
  executionPhotoCount,
  executionFinishes,
}: Props) {
  const previews = generalImageUrls.slice(0, 8)
  const productCount = generalImageUrls.length

  return (
    <section className="px-6 py-4" id="woodright-media">
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
            const isHero =
              thumbnail != null && (url === thumbnail || src === resolveAdminImageSrc(thumbnail))
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
        {productCount} фото товара · {executionPhotoCount} фото исполнений
        {thumbnail ? " · обложка отмечена рамкой" : productCount > 0 ? " · обложка не выбрана" : ""}
      </Text>
      {executionFinishes.length > 0 && (
        <div className="mb-3 rounded-md border border-ui-border-base bg-ui-bg-subtle p-3">
          <Text size="small" weight="plus">
            Фотографии исполнений
          </Text>
          <ul className="mt-2 flex flex-col gap-1">
            {executionFinishes.map((finish) => (
              <li key={finish.key}>
                <Text size="small" className="text-ui-fg-subtle">
                  {finish.label} · {finish.photo_count} фото
                </Text>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Button variant="secondary" size="small" asChild>
        <Link to={`/products/${productId}`}>Изменить фотографии в Medusa ↗</Link>
      </Button>
    </section>
  )
}
