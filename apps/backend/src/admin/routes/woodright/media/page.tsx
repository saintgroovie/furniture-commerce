import { Container, Text } from "@medusajs/ui"
import { DeskFrame } from "../../../components/woodright/DeskNav"
import { CatalogOpsBoard } from "../../../components/woodright/CatalogOpsBoard"
import { useWoodrightProducts } from "../../../lib/use-woodright-products"

const WoodrightMediaPage = () => {
  const { data, loading, error } = useWoodrightProducts()

  return (
    <Container className="divide-y p-0">
      <DeskFrame title="Съёмка" lead="Один комплект на все товары без нормального фото" active="media">
        {error ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-error">
              {error}
            </Text>
          </div>
        ) : null}
        {loading ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              Загружаем…
            </Text>
          </div>
        ) : (
          <CatalogOpsBoard products={data?.products ?? []} initialTaskId="photo-catalog" />
        )}
      </DeskFrame>
    </Container>
  )
}

export default WoodrightMediaPage
