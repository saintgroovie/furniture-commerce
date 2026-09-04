import { Button, Container, Heading, StatusBadge, Text } from "@medusajs/ui"
import { useMemo, useState } from "react"
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom"
import { productTypeBadge } from "../../../../components/woodright/site-status-labels"
import { DimensionsSection } from "../../../../components/woodright/DimensionsSection"
import { MediaSection } from "../../../../components/woodright/MediaSection"
import { PreviewLink } from "../../../../components/woodright/PreviewLink"
import { PriceSection } from "../../../../components/woodright/PriceSection"
import { PublishReadinessPanel } from "../../../../components/woodright/PublishReadinessPanel"
import { VisibilitySection } from "../../../../components/woodright/VisibilitySection"
import { sellerStatusLabel } from "../../../../components/woodright/AttentionChips"
import { useWoodrightProducts } from "../../../../lib/use-woodright-products"
import { adminJson, sellerErrorMessage } from "../../../../lib/admin-fetch"
import {
  formatSellerVariantCount,
  isWoodrightCreateProductSegment,
} from "../../../../../lib/woodright-admin/workspace-query"

const WIZARD_STEPS = ["price", "dimensions", "media", "review"] as const
type WizardStep = (typeof WIZARD_STEPS)[number]

function parseWizard(raw: string | null): WizardStep | null {
  if (raw && WIZARD_STEPS.includes(raw as WizardStep)) return raw as WizardStep
  return null
}

const WoodrightProductEditorPage = () => {
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const wizard = parseWizard(searchParams.get("wizard"))
  const { data, loading, error, reload } = useWoodrightProducts()
  const product = useMemo(
    () => data?.products.find((item) => item.id === id) ?? null,
    [data?.products, id]
  )
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)

  const goWizard = (step: WizardStep) => {
    const next = new URLSearchParams(searchParams)
    next.set("wizard", step)
    setSearchParams(next)
  }

  const publishProduct = async () => {
    if (!id) return
    setPublishing(true)
    setPublishError(null)
    try {
      await adminJson(`/admin/woodright/products/${id}/publish`, {
        method: "POST",
        body: JSON.stringify({}),
      })
      await reload()
    } catch (err) {
      setPublishError(sellerErrorMessage(err, "Пока нельзя опубликовать"))
    } finally {
      setPublishing(false)
    }
  }

  if (isWoodrightCreateProductSegment(id)) {
    return <Navigate to="/woodright/products/new" replace />
  }

  if (!id) {
    return (
      <Container className="p-6">
        <Text>Товар не найден</Text>
      </Container>
    )
  }

  if (error) {
    return (
      <Container className="p-6">
        <Text size="small" className="text-ui-fg-error">
          {error}
        </Text>
      </Container>
    )
  }

  if (loading && !product) {
    return (
      <Container className="p-6">
        <Text size="small" className="text-ui-fg-subtle">
          Загружаем товар…
        </Text>
      </Container>
    )
  }

  if (!product) {
    return (
      <Container className="p-6">
        <Text>Товар не найден</Text>
        <Link to="/woodright/products">К списку товаров</Link>
      </Container>
    )
  }

  const sku =
    product.skus.length === 1
      ? product.skus[0]
      : product.variants.length > 1
        ? formatSellerVariantCount(product.variants.length)
        : ""

  const showPrice = !wizard || wizard === "price"
  const showDimensions = !wizard || wizard === "dimensions"
  const showMedia = !wizard || wizard === "media"
  const showReview = !wizard || wizard === "review"

  return (
    <div className="flex flex-col gap-4">
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-3 px-6 py-4">
          <Link to="/woodright/products" className="text-ui-fg-subtle text-sm">
            К списку товаров
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {product.thumbnail ? (
                <img
                  src={product.thumbnail}
                  alt=""
                  className="h-16 w-16 rounded-md object-cover"
                />
              ) : (
                <div className="h-16 w-16 rounded-md bg-ui-bg-subtle" />
              )}
              <div>
                <Heading>{product.title}</Heading>
                {sku && (
                  <Text size="small" className="text-ui-fg-subtle">
                    {sku}
                  </Text>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge color={product.status === "published" ? "green" : "grey"}>
                    {sellerStatusLabel(product.status, product.readiness.visible)}
                  </StatusBadge>
                  {product.collection_label && (
                    <Text size="small">{product.collection_label}</Text>
                  )}
                  <Text size="small" className="text-ui-fg-subtle">
                    {productTypeBadge(product.classification)}
                  </Text>
                </div>
                {product.status !== "published" && (
                  <Text size="small" className="text-ui-fg-subtle mt-2">
                    Товар пока не виден покупателям
                  </Text>
                )}
              </div>
            </div>
            <PreviewLink
              productId={product.id}
              published={product.status === "published"}
              siteUrl={data?.site_url ?? ""}
            />
          </div>
          {wizard && (
            <div className="flex flex-wrap gap-2">
              {WIZARD_STEPS.map((step, index) => (
                <button
                  key={step}
                  type="button"
                  className={`rounded-full border px-3 py-1 text-sm ${
                    wizard === step
                      ? "border-ui-border-strong bg-ui-bg-base"
                      : "border-ui-border-base text-ui-fg-subtle"
                  }`}
                  onClick={() => goWizard(step)}
                >
                  {index + 2}. {step === "price" ? "Цена" : step === "dimensions" ? "Размеры" : step === "media" ? "Фотографии" : "Проверка"}
                </button>
              ))}
            </div>
          )}
        </div>
        {showPrice && (
          <PriceSection
            productId={product.id}
            variants={product.variants}
            hasMaterialTiers={product.has_material_tiers}
            onSaved={reload}
          />
        )}
        {showDimensions && (
          <DimensionsSection
            productId={product.id}
            dimensions={product.dimensions}
            onSaved={reload}
          />
        )}
        {showMedia && (
          <MediaSection
            productId={product.id}
            thumbnail={product.thumbnail}
            imageUrls={product.image_urls}
            executionGuard={product.execution_media_guard}
          />
        )}
        {showReview && (
          <PublishReadinessPanel
            publish={product.publish}
            onPublish={product.status === "published" ? undefined : () => void publishProduct()}
            publishing={publishing}
            publishError={publishError}
          />
        )}
        {!wizard && (
          <VisibilitySection
            productId={product.id}
            status={product.status}
            visible={product.readiness.visible}
            publish={product.publish}
            onSaved={reload}
          />
        )}
        {wizard && (
          <div className="flex flex-wrap gap-2 px-6 py-4">
            {wizard === "price" && (
              <Button size="small" onClick={() => goWizard("dimensions")}>
                Дальше: размеры
              </Button>
            )}
            {wizard === "dimensions" && (
              <Button size="small" onClick={() => goWizard("media")}>
                Дальше: фотографии
              </Button>
            )}
            {wizard === "media" && (
              <Button size="small" onClick={() => goWizard("review")}>
                Дальше: проверка
              </Button>
            )}
            <Button variant="secondary" size="small" asChild>
              <Link to={`/woodright/products/${product.id}`}>Продолжить позже</Link>
            </Button>
          </div>
        )}
      </Container>
    </div>
  )
}

export default WoodrightProductEditorPage
