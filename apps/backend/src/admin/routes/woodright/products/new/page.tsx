import { Button, Container, Heading, Input, Label, Text } from "@medusajs/ui"
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { adminJson, sellerErrorMessage } from "../../../../lib/admin-fetch"
import {
  SELLER_CLASSIFICATION_CHOICES,
  sellerCollectionChoices,
} from "../../../../../lib/woodright-admin/seller-choices"
import {
  normalizeSellerSku,
  sellerSkuHasCyrillic,
} from "../../../../../lib/woodright-admin/create-product-command"
import type { SellerProduct } from "../../../../../lib/woodright-admin/seller-product-types"

const WoodrightCreateProductPage = () => {
  const navigate = useNavigate()
  const collections = sellerCollectionChoices()
  const [title, setTitle] = useState("")
  const [sku, setSku] = useState("")
  const [classification, setClassification] = useState("STANDARD")
  const [collectionKey, setCollectionKey] = useState("")
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; sku?: string; collection?: string }>(
    {}
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const skuCyrillic = sellerSkuHasCyrillic(sku)

  const submit = async () => {
    const nextErrors: { title?: string; sku?: string; collection?: string } = {}
    if (!title.trim()) nextErrors.title = "Укажите название"
    const nextSku = normalizeSellerSku(sku)
    if (!sku.trim()) nextErrors.sku = "Укажите артикул"
    if (!collectionKey) nextErrors.collection = "Выберите коллекцию"
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    setSku(nextSku)

    setSaving(true)
    setError(null)
    try {
      const json = await adminJson<{ product: SellerProduct }>("/admin/woodright/products", {
        method: "POST",
        body: JSON.stringify({
          title,
          sku: nextSku,
          classification,
          collection_key: collectionKey,
        }),
      })
      navigate(`/woodright/products/${json.product.id}`, { state: { focus: "price" } })
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
        noValidate
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
            aria-invalid={Boolean(fieldErrors.title)}
            onChange={(event) => {
              setFieldErrors((prev) => ({ ...prev, title: undefined }))
              setTitle(event.target.value)
            }}
          />
          {fieldErrors.title && (
            <Text size="small" className="text-ui-fg-error">
              {fieldErrors.title}
            </Text>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="create-sku">Артикул</Label>
          <Input
            id="create-sku"
            value={sku}
            placeholder="Например: OL-05-1"
            aria-invalid={Boolean(fieldErrors.sku)}
            onChange={(event) => {
              setFieldErrors((prev) => ({ ...prev, sku: undefined }))
              setSku(event.target.value)
            }}
            onBlur={() => setSku((prev) => normalizeSellerSku(prev))}
          />
          {skuCyrillic && (
            <Text size="small" className="text-ui-fg-subtle">
              В артикуле есть русские буквы - проверьте
            </Text>
          )}
          {fieldErrors.sku && (
            <Text size="small" className="text-ui-fg-error">
              {fieldErrors.sku}
            </Text>
          )}
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
            aria-invalid={Boolean(fieldErrors.collection)}
            onChange={(event) => {
              setFieldErrors((prev) => ({ ...prev, collection: undefined }))
              setCollectionKey(event.target.value)
            }}
          >
            <option value="">Выберите коллекцию</option>
            {collections.map((choice) => (
              <option key={choice.key} value={choice.key}>
                {choice.label}
              </option>
            ))}
          </select>
          {fieldErrors.collection && (
            <Text size="small" className="text-ui-fg-error">
              {fieldErrors.collection}
            </Text>
          )}
        </div>
        {classification === "CONFIGURABLE" && (
          <Text size="small" className="text-ui-fg-subtle">
            Исполнения настроит администратор после создания
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
