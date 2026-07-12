import type { DetailWidgetProps, AdminProduct } from "@medusajs/types"
import { Button, Container, Text } from "@medusajs/ui"
import { Link } from "react-router-dom"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { isWoodrightAdminUxV1Enabled } from "../lib/feature-flags/woodright-admin-flags"
import { woodrightWorkspacePath } from "../lib/product-workspace/admin-api"

function readFlagFromBrowser(): boolean {
  try {
    const ls = window.localStorage.getItem("WOODRIGHT_ADMIN_UX_V1")
    if (ls != null) {
      return isWoodrightAdminUxV1Enabled({ WOODRIGHT_ADMIN_UX_V1: ls })
    }
  } catch {
    /* ignore */
  }
  try {
    const meta = import.meta as unknown as { env?: Record<string, string> }
    if (meta.env?.WOODRIGHT_ADMIN_UX_V1) {
      return isWoodrightAdminUxV1Enabled(meta.env)
    }
  } catch {
    /* ignore */
  }
  return false
}

const ProductWoodrightWorkspaceEntry = ({ data }: DetailWidgetProps<AdminProduct>) => {
  if (!readFlagFromBrowser()) {
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
      <div className="mt-3">
        <Link to={href}>
          <Button variant="secondary" aria-label="Открыть рабочее пространство Woodright">
            Открыть рабочее пространство Woodright
          </Button>
        </Link>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
  id: "woodright-product-workspace-entry",
})

export default ProductWoodrightWorkspaceEntry
