import { Button, Container, Text } from "@medusajs/ui"
import { Link } from "react-router-dom"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { readWoodrightAdminUxFlagFromBrowser } from "../lib/woodright/browser-flag"
import { woodrightPromotionNewPath, woodrightPromotionsPath } from "../lib/promotions/api"

const PromotionsWoodrightEntry = () => {
  if (!readWoodrightAdminUxFlagFromBrowser()) {
    return null
  }

  return (
    <Container className="p-4">
      <Text weight="plus">Мастер акций Woodright</Text>
      <Text size="small" className="mt-1 text-ui-fg-subtle">
        Подсказки при создании акции и проверка кода в корзине. Штатный список Medusa остаётся
        основным списком акций.
      </Text>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="secondary" asChild>
          <Link to={woodrightPromotionNewPath()} aria-label="Создать акцию в мастере Woodright">
            Создать акцию
          </Link>
        </Button>
        <Link
          to={`${woodrightPromotionsPath()}?filter=attention`}
          className="text-ui-fg-subtle text-sm underline"
        >
          Проблемные акции (по текущей странице)
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
