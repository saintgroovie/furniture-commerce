import { Button, Container, Text } from "@medusajs/ui"
import { Link } from "react-router-dom"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { isWoodrightAdminUxV1Enabled } from "../lib/feature-flags/woodright-admin-flags"
import { woodrightPromotionsPath } from "../lib/promotions/api"

function readFlagFromBrowser(): boolean {
  try {
    const w = window as unknown as { __WOODRIGHT_ADMIN_UX_V1__?: string }
    if (w.__WOODRIGHT_ADMIN_UX_V1__ != null) {
      return isWoodrightAdminUxV1Enabled({
        WOODRIGHT_ADMIN_UX_V1: String(w.__WOODRIGHT_ADMIN_UX_V1__),
      })
    }
  } catch {
    /* ignore */
  }
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

const PromotionsWoodrightEntry = () => {
  if (!readFlagFromBrowser()) {
    return null
  }

  return (
    <Container className="p-4">
      <Text weight="plus">Woodright</Text>
      <Text size="small" className="mt-1 text-ui-fg-subtle">
        Акции в операторском виде: человеческие статусы, мастер создания, проверка кода в
        корзине. Штатный раздел Medusa остаётся доступным.
      </Text>
      <div className="mt-3">
        <Link to={woodrightPromotionsPath()}>
          <Button variant="secondary" aria-label="Открыть акции Woodright">
            Открыть акции Woodright
          </Button>
        </Link>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "promotion.list.before",
  id: "woodright-promotions-entry",
})

export default PromotionsWoodrightEntry
