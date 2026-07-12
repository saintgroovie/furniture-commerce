import type { DetailWidgetProps, AdminProduct } from "@medusajs/types"
import { Button, Container, Text } from "@medusajs/ui"
import { Link } from "react-router-dom"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { readWoodrightAdminUxFlagFromBrowser } from "../lib/woodright/browser-flag"
import { woodrightDashboardPath } from "../lib/woodright/dashboard-api"
import { woodrightWorkspacePath } from "../lib/product-workspace/admin-api"

const ProductWoodrightWorkspaceEntry = ({ data }: DetailWidgetProps<AdminProduct>) => {
  if (!readWoodrightAdminUxFlagFromBrowser()) {
    return null
  }

  const href = woodrightWorkspacePath(data.id)

  return (
    <Container className="p-4">
      <Text weight="plus">Woodright</Text>
      <Text size="small" className="mt-1 text-ui-fg-subtle">
        Откройте операторское рабочее пространство: тип товара, сводка цен и галереи, сохранение
        названия и статуса. Штатная страница Medusa остаётся доступной.
      </Text>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" asChild>
          <Link to={href} aria-label="Открыть рабочее пространство Woodright">
            Открыть рабочее пространство Woodright
          </Link>
        </Button>
        <Button variant="transparent" asChild>
          <Link to={woodrightDashboardPath()}>Рабочий стол Woodright</Link>
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
