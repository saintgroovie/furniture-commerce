import { Link, Navigate } from "react-router-dom"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import { readWoodrightAdminUxFlagFromBrowser } from "../../../lib/woodright/browser-flag"
import {
  stockAdminPromotionsPath,
  woodrightPromotionNewPath,
} from "../../../lib/promotions/api"

/**
 * Loop 1 / Strategy A: no peer promotions catalog.
 * Stock Medusa list owns browsing; Woodright only hosts the create wizard (+ detail).
 */
const PromotionsHubPage = () => {
  const flagOn = readWoodrightAdminUxFlagFromBrowser()

  if (!flagOn) {
    return <Navigate to={stockAdminPromotionsPath()} replace />
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <Heading level="h1">Простая акция</Heading>
        <Text size="small" className="mt-1 text-ui-fg-subtle">
          Все акции смотрите в общем списке. Здесь мастер простой скидки (% или рубли) и проверка
          расчёта в тестовой корзине — не доставка скидки покупателю на витрине.
        </Text>
      </div>

      <Container className="p-4">
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to={woodrightPromotionNewPath()}>Создать простую акцию</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to={stockAdminPromotionsPath()}>Открыть все акции</Link>
          </Button>
        </div>
      </Container>
    </div>
  )
}

export default PromotionsHubPage
