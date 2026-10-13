import { Container, Text } from "@medusajs/ui"
import { DeskFrame } from "../../../components/woodright/DeskNav"
import { CatalogOpsBoard } from "../../../components/woodright/CatalogOpsBoard"
import { useWoodrightProducts } from "../../../lib/use-woodright-products"
import { boardLoadView } from "../../../../lib/woodright-admin/catalog-ops-board"

const WoodrightMediaPage = () => {
  const { data, loading, error } = useWoodrightProducts()
  const loadView = boardLoadView({
    loading,
    error,
    hasSnapshot: Boolean(data),
  })

  return (
    <Container className="divide-y p-0">
      <DeskFrame title="Съёмка" lead="Один комплект на все товары без нормального фото" active="media">
        {loadView === "loading" ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              Загружаем…
            </Text>
          </div>
        ) : null}
        {loadView === "failed" && error ? (
          <div className="px-6 py-8">
            <Text weight="plus">Каталог не загрузился</Text>
            <Text size="small" className="text-ui-fg-error mt-2 block">
              {error}
            </Text>
            <Text size="small" className="text-ui-fg-subtle mt-2 block">
              Повторите загрузку. Пустой стол вместо снимка не показываем
            </Text>
          </div>
        ) : null}
        {loadView === "stale" && error ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-error">
              {error}. На экране прошлый снимок
            </Text>
          </div>
        ) : null}
        {loadView === "ready" || loadView === "stale" ? (
          <CatalogOpsBoard products={data?.products ?? []} initialTaskId="photo-catalog" />
        ) : null}
      </DeskFrame>
    </Container>
  )
}

export default WoodrightMediaPage
