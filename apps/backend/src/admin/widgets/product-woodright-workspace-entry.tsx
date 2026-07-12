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
      <Text weight="plus">Инструменты Woodright</Text>
      <Text size="small" className="mt-1 text-ui-fg-subtle">
        Расширенное редактирование этого товара: варианты и цены, галерея, акции товара. Штатная
        карточка Medusa остаётся основным местом для наличия и SEO.
      </Text>
      <div className="mt-3">
        <Button variant="secondary" asChild>
          <Link to={href} aria-label="Открыть расширенное редактирование Woodright">
            Цены, галерея и акции
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
