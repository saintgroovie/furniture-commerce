import type { DetailWidgetProps, AdminProduct } from "@medusajs/types"
import { Button, Container, Text } from "@medusajs/ui"
import { Link } from "react-router-dom"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { readWoodrightAdminUxFlagFromBrowser } from "../lib/woodright/browser-flag"
import { woodrightWorkspacePath } from "../lib/product-workspace/admin-api"

const ProductWoodrightWorkspaceEntry = ({ data }: DetailWidgetProps<AdminProduct>) => {
  if (!readWoodrightAdminUxFlagFromBrowser()) {
    return null
  }

  const href = woodrightWorkspacePath(data.id)

  return (
    <Container className="p-4">
      <Text weight="plus">Довести карточку</Text>
      <Text size="small" className="mt-1 text-ui-fg-subtle">
        Проверить готовность, поправить цены и галерею, посмотреть акции этого товара. Наличие и
        SEO правятся на этой же карточке выше.
      </Text>
      <div className="mt-3">
        <Button variant="secondary" asChild>
          <Link to={href} aria-label="Довести карточку: цены и галерея">
            Цены и галерея
          </Link>
        </Button>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
  id: "woodright-product-workspace-entry",
})

export default ProductWoodrightWorkspaceEntry
