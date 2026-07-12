import { Button, Container, Text } from "@medusajs/ui"
import { Link } from "react-router-dom"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { readWoodrightAdminUxFlagFromBrowser } from "../lib/woodright/browser-flag"
import { woodrightDashboardPath } from "../lib/woodright/dashboard-api"
import { woodrightPromotionsPath } from "../lib/promotions/api"

const PromotionsWoodrightEntry = () => {
  if (!readWoodrightAdminUxFlagFromBrowser()) {
    return null
  }

  return (
    <Container className="p-4">
      <Text weight="plus">Woodright</Text>
      <Text size="small" className="mt-1 text-ui-fg-subtle">
        Акции в операторском виде: человеческие статусы, мастер создания, проверка кода в
        корзине. Штатный раздел Medusa остаётся доступным.
      </Text>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" asChild>
          <Link to={woodrightPromotionsPath()} aria-label="Открыть акции Woodright">
            Открыть акции Woodright
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
  zone: "promotion.list.before",
  id: "woodright-promotions-entry",
})

export default PromotionsWoodrightEntry
