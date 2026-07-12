import { useEffect, useMemo, useReducer, useRef, useState } from "react"
import { useParams, Link, Navigate, useBlocker, useNavigate, useSearchParams } from "react-router-dom"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { readWoodrightAdminUxFlagFromBrowser } from "../../../../lib/woodright/browser-flag"
import {
  formatAdminErrorPrimary,
  normalizeAdminError,
} from "../../../../lib/errors/normalize-admin-error"
import { buildAdminErrorViewModel } from "../../../../components/woodright/admin-error-view-model"
import {
  fetchProductWorkspaceBundle,
  stockAdminProductPath,
  updateAdminProduct,
} from "../../../../lib/product-workspace/admin-api"
import { VariantsPricesPanel } from "../../../../lib/product-workspace/VariantsPricesPanel"
import { GalleryPanel } from "../../../../lib/product-workspace/GalleryPanel"
import { ProductPromotionsPanel } from "../../../../lib/promotions/ProductPromotionsPanel"
import { buildClassificationView } from "../../../../lib/product-workspace/classification"
import { buildMediaSummary } from "../../../../lib/product-workspace/media-summary"
import { buildPriceSummary } from "../../../../lib/product-workspace/price-summary"
import { buildProductReadiness } from "../../../../lib/product-workspace/readiness"
import { ProductReadinessChecklist } from "../../../../lib/product-workspace/ProductReadinessChecklist"
import {
  buildStorefrontPreviewUrl,
  resolveStorefrontOrigin,
} from "../../../../lib/product-workspace/preview-url"
import {
  createSaveState,
  isDirty,
  reduceSaveState,
  saveStatusLabel,
} from "../../../../lib/product-workspace/save-state"
import type {
  AdminProductPayload,
  EditableProductFields,
  ProductWorkspaceTabId,
} from "../../../../lib/product-workspace/types"

// v1 tabs only — inventory/SEO deferred; operators use stock Medusa for those.
const TABS: Array<{ id: ProductWorkspaceTabId; label: string }> = [
  { id: "overview", label: "Обзор" },
  { id: "variants", label: "Варианты и цены" },
  { id: "gallery", label: "Галерея" },
  { id: "promotions", label: "Акции товара" },
  { id: "technical", label: "Служебное" },
]

const TAB_IDS = new Set(TABS.map((t) => t.id))

function isTabId(value: string | null): value is ProductWorkspaceTabId {
  return value != null && TAB_IDS.has(value as ProductWorkspaceTabId)
}

function toEditable(p: AdminProductPayload): EditableProductFields {
  const status = (p.status ?? "draft") as EditableProductFields["status"]
  return {
    title: p.title ?? "",
    description: p.description ?? "",
    status:
      status === "published" || status === "proposed" || status === "rejected"
        ? status
        : "draft",
  }
}

const ProductWorkspacePage = () => {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const flagOn = readWoodrightAdminUxFlagFromBrowser()
  // F-13: the active tab lives in ?tab= so sections can be deep-linked.
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<ProductWorkspaceTabId>(() => {
    const fromUrl = searchParams.get("tab")
    return isTabId(fromUrl) ? fromUrl : "overview"
  })

  // Unknown / deferred tab ids (e.g. legacy ?tab=inventory) → overview.
  useEffect(() => {
    const fromUrl = searchParams.get("tab")
    if (fromUrl == null) return
    if (!isTabId(fromUrl)) {
      setTab("overview")
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          params.delete("tab")
          return params
        },
        { replace: true }
      )
    }
  }, [searchParams, setSearchParams])

  const selectTab = (next: ProductWorkspaceTabId) => {
    setTab(next)
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (next === "overview") params.delete("tab")
        else params.set("tab", next)
        return params
      },
      { replace: true }
    )
  }
  const [loading, setLoading] = useState(true)
  const [product, setProduct] = useState<AdminProductPayload | null>(null)
  const [priceRows, setPriceRows] = useState<Array<Array<{ amount: number; currency_code: string }>>>([])
  const [variantsTruncated, setVariantsTruncated] = useState(false)
  const [variantsDirty, setVariantsDirty] = useState(false)
  const [galleryDirty, setGalleryDirty] = useState(false)
  const [loadError, setLoadError] = useState<ReturnType<typeof normalizeAdminError> | null>(null)
  const [saveState, dispatchSave] = useReducer(
    reduceSaveState,
    createSaveState({ title: "", description: "", status: "draft" })
  )

  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const descriptionInputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!flagOn || !id) return
    const ac = new AbortController()
    setLoading(true)
    setLoadError(null)

    ;(async () => {
      try {
        const bundle = await fetchProductWorkspaceBundle(id, { signal: ac.signal })
        if (ac.signal.aborted) return
        if ("status" in bundle) {
          setLoadError(
            normalizeAdminError({
              httpStatus: bundle.status,
              endpoint: `/admin/products/${id}`,
              body: bundle.body,
              codeHint: bundle.status === 404 ? "deleted_entity" : undefined,
            })
          )
          setProduct(null)
          return
        }
        setProduct(bundle.product)
        setVariantsTruncated(bundle.truncated)
        setPriceRows((bundle.product.variants ?? []).map((v) => v.prices ?? []))
        dispatchSave({
          type: "hydrate",
          fields: toEditable(bundle.product),
          savedAt: bundle.product.updated_at ?? null,
        })
        setVariantsDirty(false)
        setGalleryDirty(false)
      } catch (e) {
        if (ac.signal.aborted) return
        setLoadError(
          normalizeAdminError({
            error: e,
            endpoint: `/admin/products/${id}`,
            codeHint: "network_error",
          })
        )
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    })()

    return () => {
      ac.abort()
    }
  }, [flagOn, id])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!(isDirty(saveState) || variantsDirty || galleryDirty)) return
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [saveState, variantsDirty, galleryDirty])

  const dirty = isDirty(saveState) || variantsDirty || galleryDirty
  const blocker = useBlocker(dirty)
  useEffect(() => {
    if (blocker.state !== "blocked") return
    const ok = window.confirm(
      "У вас есть несохранённые изменения. Покинуть страницу и потерять их?"
    )
    if (ok) blocker.proceed()
    else blocker.reset()
  }, [blocker])

  const statusLabel =
    product?.status === "published"
      ? "Опубликован"
      : product?.status === "proposed"
        ? "На проверке"
        : product?.status === "rejected"
          ? "Отклонён"
          : "Черновик"

  const classification = useMemo(
    () => (product ? buildClassificationView(product) : null),
    [product]
  )
  const media = useMemo(() => (product ? buildMediaSummary(product) : null), [product])
  const prices = useMemo(
    () => buildPriceSummary(product?.variants?.length ?? 0, priceRows),
    [product, priceRows]
  )
  const readiness = useMemo(() => {
    if (!classification || !media) return null
    return buildProductReadiness({
      title: saveState.draft.title,
      description: saveState.draft.description,
      classification,
      variantCount: product?.variants?.length ?? 0,
      variantsTruncated,
      prices,
      media,
    })
  }, [
    classification,
    media,
    prices,
    product?.variants?.length,
    saveState.draft.description,
    saveState.draft.title,
    variantsTruncated,
  ])
  const preview = useMemo(
    () =>
      buildStorefrontPreviewUrl({
        productId: id,
        status: product?.status,
        storefrontOrigin: resolveStorefrontOrigin(
          (import.meta as unknown as { env?: Record<string, string> }).env ?? {}
        ),
      }),
    [id, product?.status]
  )

  const confirmLeave = () => {
    if (!(isDirty(saveState) || variantsDirty || galleryDirty)) return true
    return window.confirm(
      "У вас есть несохранённые изменения. Покинуть страницу и потерять их?"
    )
  }

  const onSave = async () => {
    if (!id || !product) return
    dispatchSave({ type: "save_start" })
    const res = await updateAdminProduct(id, {
      title: saveState.draft.title,
      description: saveState.draft.description,
      status: saveState.draft.status,
    })
    if ("status" in res) {
      const err = normalizeAdminError({
        httpStatus: res.status,
        endpoint: `/admin/products/${id}`,
        body: res.body,
        codeHint: res.status === 409 ? "conflict" : "validation",
      })
      dispatchSave({
        type: res.status === 409 ? "conflict" : "save_error",
        message: formatAdminErrorPrimary(err),
      })
      toast.error(err.title, { description: err.action })
      return
    }
    setProduct(res.product)
    dispatchSave({
      type: "save_success",
      fields: toEditable(res.product),
      savedAt: res.product.updated_at ?? new Date().toISOString(),
    })
    toast.success("Товар сохранён")
  }

  if (!flagOn) {
    return <Navigate to={id ? stockAdminProductPath(id) : "/app/products"} replace />
  }

  if (loading) {
    return (
      <Container className="p-6">
        <Text>Загружаем товар…</Text>
      </Container>
    )
  }

  if (loadError) {
    const vm = buildAdminErrorViewModel({
      title: loadError.title,
      explanation: loadError.explanation,
      action: loadError.action,
      technical: loadError.technical,
    })
    return (
      <Container className="p-6">
        <Heading level="h1">{vm.primary.title}</Heading>
        <Text className="mt-2">{vm.primary.explanation}</Text>
        <Text className="mt-1">{vm.primary.action}</Text>
        <details className="mt-4">
          <summary>Технические сведения</summary>
          <ul className="mt-2 list-disc pl-5 text-ui-fg-subtle">
            {vm.technicalRows.map((row) => (
              <li key={row.label}>
                {row.label}: {row.value}
              </li>
            ))}
          </ul>
        </details>
        {id ? (
          <Button className="mt-4" variant="secondary" asChild>
            <Link to={stockAdminProductPath(id)}>К полной карточке товара</Link>
          </Button>
        ) : null}
      </Container>
    )
  }

  if (!product) {
    return (
      <Container className="p-6">
        <Heading level="h1">Товар не найден</Heading>
      </Container>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-ui-bg-subtle">
            {product.thumbnail ? (
              <img
                src={product.thumbnail}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-ui-fg-muted">
                Нет фото
              </div>
            )}
          </div>
          <div className="min-w-0">
            <Heading level="h1" className="truncate">
              {saveState.draft.title || product.title || "Без названия"}
            </Heading>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge>
                {statusLabel}
              </Badge>
              <Badge color={classification?.code ? "green" : "orange"}>
                {classification?.label}
              </Badge>
              {product.collection?.title ? (
                <Badge>{product.collection.title}</Badge>
              ) : null}
            </div>
            <Text size="small" className="mt-2 text-ui-fg-subtle">
              Адрес на витрине: {product.handle || "не задан"} · Вариантов:{" "}
              {product.variants?.length ?? 0} · Цены: {prices.label} · Фото:{" "}
              {media?.image_count ?? 0}
              {saveState.lastSavedAt
                ? ` · Обновлён: ${new Date(saveState.lastSavedAt).toLocaleString("ru-RU")}`
                : product.updated_at
                  ? ` · Обновлён: ${new Date(product.updated_at).toLocaleString("ru-RU")}`
                  : ""}
            </Text>
            <Text size="small" className="mt-1 font-medium">
              {saveStatusLabel(saveState.status)}
            </Text>
            {readiness ? (
              <Text
                size="small"
                className={
                  readiness.verification === "ready"
                    ? "mt-1 text-ui-fg-subtle"
                    : "mt-1 font-medium"
                }
              >
                Готовность: {readiness.summary_label}
              </Text>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap gap-2">
          {preview.url ? (
            <Button variant="secondary" asChild>
              <a
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                aria-label={preview.label}
              >
                {preview.label}
              </a>
            </Button>
          ) : null}
          <Button variant="secondary" asChild>
            <Link
              to={stockAdminProductPath(product.id)}
              onClick={(e) => {
                if (!confirmLeave()) e.preventDefault()
              }}
            >
              К полной карточке товара
            </Link>
          </Button>
          <Button
            onClick={onSave}
            disabled={saveState.status === "saving" || !isDirty(saveState)}
            isLoading={saveState.status === "saving"}
          >
            Сохранить
          </Button>
          </div>
          <Text size="xsmall" className="max-w-xs text-right text-ui-fg-subtle">
            Сохраняет только название, описание и статус. Цены и галерея — во вкладках.
          </Text>
        </div>
      </div>

      {preview.note ? (
        <Text size="small" className="text-ui-fg-subtle">
          {preview.note}
        </Text>
      ) : null}
      {saveState.errorMessage ? (
        <Container className="border border-ui-border-error p-3">
          <Text size="small">{saveState.errorMessage}</Text>
        </Container>
      ) : null}

      <div
        role="tablist"
        aria-label="Разделы рабочего пространства"
        className="flex flex-wrap gap-2 border-b border-ui-border-base pb-2"
      >
        {TABS.map((t) => (
          <Button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            variant={tab === t.id ? "primary" : "secondary"}
            size="small"
            onClick={() => selectTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <Text size="xsmall" className="text-ui-fg-subtle">
        Наличие и SEO:{" "}
        <Link to={stockAdminProductPath(product.id)} className="underline">
          открыть полную карточку товара
        </Link>
      </Text>

      {tab === "overview" ? (
        <>
          {readiness ? (
            <ProductReadinessChecklist
              readiness={readiness}
              onField={(field) => {
                selectTab("overview")
                requestAnimationFrame(() => {
                  if (field === "title") titleInputRef.current?.focus()
                  else descriptionInputRef.current?.focus()
                })
              }}
              onTab={(next) => selectTab(next)}
              onStock={() => {
                if (!confirmLeave()) return
                navigate(stockAdminProductPath(product.id))
              }}
            />
          ) : null}
        <Container className="flex flex-col gap-4 p-4">
          <div>
            <Text weight="plus">Название</Text>
            <Input
              ref={titleInputRef}
              className="mt-1"
              value={saveState.draft.title}
              onChange={(e) =>
                dispatchSave({ type: "edit", patch: { title: e.target.value } })
              }
              aria-label="Название товара"
            />
          </div>
          <div>
            <Text weight="plus">Описание</Text>
            <Textarea
              ref={descriptionInputRef}
              className="mt-1"
              rows={5}
              value={saveState.draft.description}
              onChange={(e) =>
                dispatchSave({ type: "edit", patch: { description: e.target.value } })
              }
              aria-label="Описание товара"
            />
          </div>
          <div>
            <Text weight="plus">Статус публикации</Text>
            <select
              className="mt-1 w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-2"
              value={saveState.draft.status}
              aria-label="Статус публикации"
              onChange={(e) =>
                dispatchSave({
                  type: "edit",
                  patch: {
                    status: e.target.value as EditableProductFields["status"],
                  },
                })
              }
            >
              <option value="draft">Черновик</option>
              <option value="published">Опубликован</option>
              {saveState.draft.status === "proposed" ? (
                <option value="proposed">На проверке (текущий)</option>
              ) : null}
              {saveState.draft.status === "rejected" ? (
                <option value="rejected">Отклонён (текущий)</option>
              ) : null}
            </select>
            {saveState.draft.status === "proposed" || saveState.draft.status === "rejected" ? (
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Служебный статус: {statusLabel}. Выберите «Черновик» или «Опубликован», чтобы
                изменить его здесь.
              </Text>
            ) : null}
          </div>
          <div>
            <Text weight="plus">Сводка медиа</Text>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              Главное фото: {media?.has_thumbnail ? "есть" : "нет"} · Кадров в галерее:{" "}
              {media?.image_count}
            </Text>
            {(media?.warnings ?? []).map((w) => (
              <Text key={w} size="small" className="text-ui-fg-subtle">
                {w}
              </Text>
            ))}
            <div className="mt-2 flex flex-wrap gap-2">
              {(media?.preview_urls ?? []).map((url) => (
                <img
                  key={url}
                  src={url}
                  alt=""
                  loading="lazy"
                  className="h-16 w-16 rounded object-cover"
                />
              ))}
            </div>
          </div>
        </Container>
        </>
      ) : null}

      {tab === "variants" ? (
        <VariantsPricesPanel
          product={product}
          truncated={variantsTruncated}
          onDirtyChange={setVariantsDirty}
          onProductUpdated={(next) => {
            setProduct(next)
            setPriceRows((next.variants ?? []).map((v) => v.prices ?? []))
          }}
        />
      ) : null}

      {tab === "gallery" ? (
        <GalleryPanel
          product={product}
          onDirtyChange={setGalleryDirty}
          onProductUpdated={(next) => {
            setProduct(next)
            setPriceRows((next.variants ?? []).map((v) => v.prices ?? []))
          }}
        />
      ) : null}

      {tab === "promotions" ? (
        <ProductPromotionsPanel
          productId={product.id}
          collectionId={product.collection?.id ?? null}
        />
      ) : null}

      {tab === "technical" ? (
        <Container className="p-4">
          <details>
            <summary>Для поддержки</summary>
            <Text size="small" className="mt-2 break-all text-ui-fg-subtle">
              ID товара: {product.id}
            </Text>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              Источник типа: {classification?.source ?? "—"}
            </Text>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              Ключи метаданных:{" "}
              {Object.keys(product.metadata ?? {}).join(", ") || "нет"}
            </Text>
          </details>
        </Container>
      ) : null}
    </div>
  )
}

// F-04: no defineRouteConfig on purpose — a nested sidebar item without a
// product id was useless. Entry points: the Woodright dashboard, the product
// widget in the stock Admin, and direct deep links.
export default ProductWorkspacePage
