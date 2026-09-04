import { Button, Text } from "@medusajs/ui"
import { ArrowUpRightOnBox } from "@medusajs/icons"
import { buyerProductPreviewUrl } from "../../../lib/woodright-admin/site-preview-url"

type Props = {
  productId: string
  published: boolean
  siteUrl: string
}

export function PreviewLink({ productId, published, siteUrl }: Props) {
  if (!published) {
    return (
      <Text size="small" className="text-ui-fg-subtle">
        Товар скрыт с сайта
      </Text>
    )
  }

  const origin = siteUrl.trim()
  if (!origin) {
    return (
      <Text size="small" className="text-ui-fg-subtle">
        Ссылка на сайт недоступна
      </Text>
    )
  }

  const href = buyerProductPreviewUrl(productId, origin)
  return (
    <Button variant="secondary" size="small" asChild>
      <a href={href} target="_blank" rel="noreferrer" aria-label="Посмотреть на сайте, откроется в новой вкладке">
        Посмотреть на сайте
        <ArrowUpRightOnBox />
      </a>
    </Button>
  )
}
