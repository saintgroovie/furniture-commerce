import { Button, Container, Heading, Prompt, StatusBadge, Text } from "@medusajs/ui"
import { useEffect, useRef, useState } from "react"
import { Link, Navigate, useLocation, useParams } from "react-router-dom"
import { BasicsSection } from "../../../../components/woodright/BasicsSection"
import { DimensionsSection } from "../../../../components/woodright/DimensionsSection"
import { MediaSection } from "../../../../components/woodright/MediaSection"
import { PreviewActions } from "../../../../components/woodright/PreviewLink"
import { PriceSection } from "../../../../components/woodright/PriceSection"
import { PublishChecklist } from "../../../../components/woodright/PublishChecklist"
import { productTypeBadge } from "../../../../components/woodright/site-status-labels"
import { VisibilitySection } from "../../../../components/woodright/VisibilitySection"
import { adminJson, sellerErrorMessage } from "../../../../lib/admin-fetch"
import { DirtyGuardProvider } from "../../../../lib/use-dirty-guard"
import { recordRecentProductId } from "../../../../lib/recent-products"
import { useWoodrightProduct } from "../../../../lib/use-woodright-product"
import type { ChecklistAction } from "../../../../../lib/woodright-admin/publish-checklist"
import { buildPublishChecklist } from "../../../../../lib/woodright-admin/publish-checklist"
import { sellerSiteState, SELLER_STATE_LABELS } from "../../../../../lib/woodright-admin/seller-site-state"
import { formatSellerVariantCount, isWoodrightCreateProductSegment } from "../../../../../lib/woodright-admin/workspace-query"

const WoodrightProductEditorPage = () => {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const { product, siteUrl, loading, error, reload } = useWoodrightProduct(id)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [hiding, setHiding] = useState(false)
  const [hideOpen, setHideOpen] = useState(false)
  const [hideError, setHideError] = useState<string | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const focusedRef = useRef(false)

  useEffect(() => {
    if (id) recordRecentProductId(id)
  }, [id])

  const applyFocus = (action: ChecklistAction, opts?: { scroll?: boolean }) => {
    const scroll = opts?.scroll !== false
    const run = () => {
      if (action === "focus_price") {
        const input = document.querySelector<HTMLInputElement>('input[id^="price-"]')
        input?.focus({ preventScroll: !scroll })
        if (scroll) document.getElementById("woodright-price")?.scrollIntoView({ block: "nearest" })
        return
      }
      if (action === "focus_media") {
        document.getElementById("woodright-media")?.scrollIntoView({ block: "nearest" })
        return
      }
      titleInputRef.current?.focus({ preventScroll: !scroll })
      if (scroll) document.getElementById("woodright-basics")?.scrollIntoView({ block: "nearest" })
    }
    window.setTimeout(run, 0)
  }

  useEffect(() => {
    if (!product || focusedRef.current) return
    focusedRef.current = true
    const requested = (location.state as { focus?: string } | null)?.focus
    if (requested === "price") {
      applyFocus("focus_price", { scroll: false })
      return
    }
    const first = buildPublishChecklist(product.publish).find((item) => item.action)
    if (first?.action) applyFocus(first.action, { scroll: false })
  }, [product, location.state])

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

  const hide = async () => {
    if (!id) return
    setHiding(true)
    setHideError(null)
    try {
      await adminJson(`/admin/products/${id}`, {
        method: "POST",
        body: JSON.stringify({ status: "draft" }),
      })
      await reload()
    } catch (err) {
      setHideError(sellerErrorMessage(err, "Не удалось скрыть товар"))
    } finally {
      setHiding(false)
      setHideOpen(false)
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
  const state = sellerSiteState(product)
  const labels = SELLER_STATE_LABELS[state]
  const published = product.status === "published"
  const hideStrip = state === "on_site" && product.publish.warnings.length === 0

  return (
    <DirtyGuardProvider>
      <div className="flex flex-col gap-4">
        <Container className="divide-y p-0">
          <div className="bg-ui-bg-base sticky top-0 z-10">
          <div className="flex flex-col gap-3 px-6 py-4">
            <Link to="/woodright/products" className="text-ui-fg-subtle text-sm">
              ← Товары
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
                  <Text size="small" className="text-ui-fg-subtle">
                    {[sku, product.collection_label, productTypeBadge(product.classification)]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  <div className="mt-2">
                    <StatusBadge color={labels.color}>{labels.badge}</StatusBadge>
                  </div>
                  <Text size="small" className="text-ui-fg-subtle mt-2">
                    {labels.helper}
                  </Text>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <PreviewActions
                  productId={product.id}
                  onSite={state === "on_site"}
                  siteUrl={siteUrl}
                />
                {published && (
                  <>
                    <Button
                      variant="secondary"
                      size="small"
                      disabled={hiding}
                      onClick={() => setHideOpen(true)}
                    >
                      Скрыть с сайта
                    </Button>
                    <Prompt open={hideOpen} onOpenChange={setHideOpen} variant="danger">
                      <Prompt.Content>
                        <Prompt.Header>
                          <Prompt.Title>Скрыть товар с сайта?</Prompt.Title>
                          <Prompt.Description>
                            Покупатели больше не увидят эту позицию. Данные и фотографии сохранятся
                          </Prompt.Description>
                        </Prompt.Header>
                        <Prompt.Footer>
                          <Prompt.Cancel>Отмена</Prompt.Cancel>
                          <Prompt.Action onClick={() => void hide()}>Скрыть товар</Prompt.Action>
                        </Prompt.Footer>
                      </Prompt.Content>
                    </Prompt>
                  </>
                )}
                {hideError && (
                  <Text size="small" className="text-ui-fg-error">
                    {hideError}
                  </Text>
                )}
              </div>
            </div>
          </div>
          {!hideStrip && (
            <PublishChecklist
              publish={product.publish}
              published={published}
              onPublish={published ? undefined : () => void publishProduct()}
              publishing={publishing}
              publishError={publishError}
              onAction={(action) => applyFocus(action, { scroll: true })}
            />
          )}
          </div>
          <BasicsSection
            productId={product.id}
            title={product.title}
            subtitle={product.subtitle}
            description={product.description}
            onSaved={reload}
            titleInputRef={titleInputRef}
          />
          <PriceSection
            productId={product.id}
            variants={product.variants}
            hasMaterialTiers={product.has_material_tiers}
            onSaved={reload}
          />
          <DimensionsSection
            productId={product.id}
            dimensions={product.dimensions}
            onSaved={reload}
          />
          <MediaSection
            productId={product.id}
            thumbnail={product.thumbnail}
            generalImageUrls={product.general_image_urls}
            executionPhotoCount={product.execution_photo_count}
            executionFinishes={product.execution_finishes}
          />
          <VisibilitySection state={state} />
        </Container>
      </div>
    </DirtyGuardProvider>
  )
}

export default WoodrightProductEditorPage
