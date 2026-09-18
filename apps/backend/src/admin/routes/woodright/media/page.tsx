import { Container, Text } from "@medusajs/ui"
import { Link } from "react-router-dom"
import { DeskFrame } from "../../../components/woodright/DeskNav"
import { useWoodrightProducts } from "../../../lib/use-woodright-products"

const WoodrightMediaPage = () => {
  const { data, loading, error } = useWoodrightProducts()
  const rows = (data?.products ?? []).filter(
    (p) => !p.readiness.has_media || p.image_urls.length === 0
  )
  const withPhotos = (data?.products ?? []).filter((p) => p.readiness.has_media)

  return (
    <Container className="divide-y p-0">
      <DeskFrame
        title="Медиа"
        lead="Очередь ролей, не галерея файлов"
        active="media"
      >
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
        ) : null}
        <div className="px-6 py-4">
          <Text weight="plus" className="mb-3">
            Нужен кадр
          </Text>
          {rows.length === 0 && !loading ? (
            <Text size="small" className="text-ui-fg-subtle">
              Всему каталогу хватает фото
            </Text>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((product) => (
                <li key={product.id}>
                  <Link to={`/woodright/products/${product.id}`} className="text-sm">
                    {product.title}
                    {product.skus[0] ? ` · ${product.skus[0]}` : ""}
                    <span className="block text-ui-fg-subtle">Нет hero</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="px-6 py-4">
          <Text weight="plus" className="mb-3">
            Было / стало
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            Сравнение кадров - в карточке товара. Здесь очередь, у кого не закрыта роль
          </Text>
          <Text size="small" className="text-ui-fg-subtle mt-2">
            С фото: {withPhotos.length}
          </Text>
        </div>
      </DeskFrame>
    </Container>
  )
}

export default WoodrightMediaPage
