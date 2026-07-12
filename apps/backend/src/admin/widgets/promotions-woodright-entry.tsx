import { Button, Container, Text } from "@medusajs/ui"
import { Link } from "react-router-dom"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { readWoodrightAdminUxFlagFromBrowser } from "../lib/woodright/browser-flag"
import { woodrightPromotionNewPath } from "../lib/promotions/api"

const PromotionsWoodrightEntry = () => {
  if (!readWoodrightAdminUxFlagFromBrowser()) {
    return null
  }

  return (
    <Container className="p-4">
      <Text weight="plus">Простая акция</Text>
      <Text size="small" className="mt-1 text-ui-fg-subtle">
        Список ниже — полный каталог акций. Мастер помогает создать простую скидку (% или рубли) и
        проверить расчёт в Store API. На текущей витрине поля промокода нет.
      </Text>
      <div className="mt-3">
        <Button variant="secondary" asChild>
          <Link to={woodrightPromotionNewPath()} aria-label="Создать простую акцию">
            Создать простую акцию
          </Link>
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
