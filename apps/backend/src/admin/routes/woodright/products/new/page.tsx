import { Button, Container, Heading, Input, Label, Text } from "@medusajs/ui"
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { adminJson, sellerErrorMessage } from "../../../../lib/admin-fetch"
import {
  SELLER_CLASSIFICATION_CHOICES,
  sellerCollectionChoices,
} from "../../../../../lib/woodright-admin/seller-choices"
import type { SellerProduct } from "../../../../../lib/woodright-admin/seller-product-types"

const WoodrightCreateProductPage = () => {
  const navigate = useNavigate()
  const collections = sellerCollectionChoices()
  const [title, setTitle] = useState("")
  const [sku, setSku] = useState("")
  const [classification, setClassification] = useState("STANDARD")
  const [collectionKey, setCollectionKey] = useState(collections[0]?.key ?? "oliver")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      const json = await adminJson<{ product: SellerProduct }>("/admin/woodright/products", {
        method: "POST",
        body: JSON.stringify({
          title,
          sku,
          classification,
          collection_key: collectionKey,
        }),
      })
      navigate(`/woodright/products/${json.product.id}?wizard=price`)
    } catch (err) {
      setError(sellerErrorMessage(err, "Не удалось создать товар"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Link to="/woodright/products" className="text-ui-fg-subtle text-sm">
          К списку товаров
        </Link>
        <Heading className="mt-2">Добавить товар</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Создаётся черновик. Покупатели его не увидят, пока вы не опубликуете
        </Text>
      </div>
      <form
        className="flex flex-col gap-4 px-6 py-4"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Text weight="plus">Основное</Text>
        <div className="flex flex-col gap-1">
          <Label htmlFor="create-title">Название</Label>
          <Input
            id="create-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="create-sku">Артикул</Label>
          <Input
            id="create-sku"
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="create-type">Тип товара</Label>
          <select
            id="create-type"
            className="bg-ui-bg-field border-ui-border-base h-8 rounded-md border px-2 text-sm"
            value={classification}
            onChange={(event) => setClassification(event.target.value)}
          >
            {SELLER_CLASSIFICATION_CHOICES.map((choice) => (
              <option key={choice.key} value={choice.key}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="create-collection">Коллекция</Label>
          <select
            id="create-collection"
            className="bg-ui-bg-field border-ui-border-base h-8 rounded-md border px-2 text-sm"
            value={collectionKey}
            onChange={(event) => setCollectionKey(event.target.value)}
          >
            {collections.map((choice) => (
              <option key={choice.key} value={choice.key}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>
        {classification === "CONFIGURABLE" && (
          <Text size="small" className="text-ui-fg-subtle">
            Обычные фотографии товара можно добавить позже. Фотографии отдельных исполнений настраиваются отдельно
          </Text>
        )}
        {error && (
          <Text size="small" className="text-ui-fg-error">
            {error}
          </Text>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Создаём…" : "Создать черновик"}
          </Button>
          <Button type="button" variant="secondary" asChild>
            <Link to="/woodright/products">Закрыть</Link>
          </Button>
        </div>
      </form>
    </Container>
  )
}

export default WoodrightCreateProductPage
