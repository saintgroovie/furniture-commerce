import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, AdminProduct } from "@medusajs/types"
import { Container, Text } from "@medusajs/ui"
import { Link } from "react-router-dom"

const WoodrightReturnBanner = ({ data }: DetailWidgetProps<AdminProduct>) => {
  return (
    <Container className="px-6 py-4">
      <Text weight="plus">Вы в расширенном режиме Medusa</Text>
      <div className="mt-2">
        <Link to={`/woodright/products/${data.id}`} className="text-sm">
          ← Вернуться в Woodright
        </Link>
      </div>
      <Text size="small" className="text-ui-fg-subtle mt-2">
        Не удаляйте фотографии исполнений - они привязаны к отделкам
      </Text>
      <Text size="small" className="text-ui-fg-subtle">
        Каналы продаж здесь не влияют на сайт Woodright
      </Text>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.before",
})

export default WoodrightReturnBanner
