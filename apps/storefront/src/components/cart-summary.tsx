"use client"

/**
 * Cart UI: grouped Woodright / Woodright Kids rows, totals, checkout CTA.
 * Data: client-only via getCartIdFromSession + getCart / removeLineItem.
 *
 * Визуально страница переиспользует классы «Оформления заказа» / «Заявки на
 * расчёт» (bespoke-request-*): карточка слева со строками товаров (миниатюра
 * в выбранном исполнении + спецификация из line item metadata), aside справа
 * («Что дальше»). Группировка Woodright / Woodright Kids сохранена внутри
 * карточки как секции с прежними заголовками.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { getCartIdFromSession, clearCartIdFromSession } from "@/lib/cart/session"
import { countCartItems, emitCartUpdated } from "@/lib/cart/cart-events"
import { getCart, removeLineItem, CART_NOT_FOUND } from "@/lib/api/cart"
import { formatRub } from "@/lib/format"
import { resolveStorefrontProductImageSrc } from "@/lib/product-images"
import { resolveKidsProducts } from "@/lib/kids"
import { ChecklistIcon } from "@/components/bespoke-help-icons"
import { actions, cartCopy } from "@/lib/woodright-copy"

type CartViewState = "loading" | "empty" | "ready" | "mutating" | "error" | "invalid_state"

type ExecutionSpec = { label: string; value: string }

function lineTotal(item: Record<string, unknown>, qty: number): number | null {
  const total = (item as { total?: number }).total
  if (total != null) return Number(total)
  const subtotal = (item as { subtotal?: number }).subtotal
  if (subtotal != null) return Number(subtotal)
  const unitPrice = (item as { unit_price?: number }).unit_price
  if (unitPrice != null) return Number(unitPrice) * qty
  return null
}

/** Миниатюра: фото выбранного исполнения из metadata, иначе — thumbnail товара.
    Всегда через resolveStorefrontProductImageSrc: Medusa хранит пути вида
    `/static/…` (или абсолютные `:9000/static/…`) — на origin :3002 они не
    существуют, их нужно переписать в same-origin `/product-static/…`. */
function itemThumbSrc(item: Record<string, unknown>): string | null {
  const meta = (item.metadata ?? {}) as Record<string, unknown>
  const fromExecution = meta.execution_image
  if (typeof fromExecution === "string" && fromExecution.trim()) {
    return resolveStorefrontProductImageSrc(fromExecution.trim())
  }
  const thumb = item.thumbnail
  if (typeof thumb === "string" && thumb.trim()) {
    return resolveStorefrontProductImageSrc(thumb.trim())
  }
  return null
}

/** Спецификация исполнения («Цвет: Молочный», «Дерево: Дуб») из metadata. */
function itemExecutionSpecs(item: Record<string, unknown>): ExecutionSpec[] {
  const meta = (item.metadata ?? {}) as Record<string, unknown>
  const raw = meta.execution_specs
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (s): s is ExecutionSpec =>
      s != null &&
      typeof s === "object" &&
      typeof (s as ExecutionSpec).label === "string" &&
      typeof (s as ExecutionSpec).value === "string"
  )
}

function itemArticle(item: Record<string, unknown>): string | null {
  const sku = (item as { variant_sku?: string }).variant_sku
  return typeof sku === "string" && sku.trim() ? sku.trim() : null
}

export function CartSummary() {
  const [cart, setCart] = useState<Record<string, unknown> | null>(null)
  const [viewState, setViewState] = useState<CartViewState>("loading")
  const [mutating, setMutating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [kidsIds, setKidsIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const cartId = getCartIdFromSession()
    if (!cartId) {
      setCart(null)
      setViewState("empty")
      return
    }

    const kidsPromise = resolveKidsProducts()
      .then((data) => data.ids)
      .catch(() => new Set<string>())

    getCart(cartId)
      .then(async (data: { cart?: Record<string, unknown> }) => {
        setKidsIds(await kidsPromise)
        const c = data.cart ?? null
        const items = (c?.items as unknown[]) ?? []
        if (!c || !Array.isArray(items) || items.length === 0) {
          setCart(null)
          setViewState("empty")
        } else {
          setCart(c)
          setViewState("ready")
        }
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.message === CART_NOT_FOUND) {
          clearCartIdFromSession()
          setCart(null)
          setViewState("invalid_state")
        } else {
          setError(cartCopy.loadError)
          setViewState("error")
        }
      })
  }, [])

  async function handleRemove(cartId: string, lineId: string) {
    setMutating(true)
    setError(null)
    try {
      await removeLineItem(cartId, lineId)
      const data = await getCart(cartId)
      const c = data.cart ?? null
      setCart(c)
      emitCartUpdated({ count: countCartItems(c) ?? 0 })
      const items = (c?.items as unknown[]) ?? []
      if (!Array.isArray(items) || items.length === 0) {
        setViewState("empty")
      }
    } catch {
      setError(cartCopy.removeError)
    } finally {
      setMutating(false)
    }
  }

  const aside = (
    <aside className="bespoke-request-help">
      <div className="bespoke-request-help-section">
        <div className="bespoke-request-help-section-header">
          <span className="bespoke-request-help-icon">
            <ChecklistIcon />
          </span>
          <h2>{cartCopy.nextStepsTitle}</h2>
        </div>
        <ul className="bespoke-request-help-list">
          {cartCopy.nextStepsBullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      </div>
      <p className="page-caption">{cartCopy.asideCaption}</p>
    </aside>
  )

  function cardShell(state: string, children: React.ReactNode) {
    return (
      <div className="bespoke-request-layout">
        <div className="bespoke-request-card" data-state={state}>
          {children}
        </div>
        {aside}
      </div>
    )
  }

  if (viewState === "loading") {
    return cardShell(
      "loading",
      <p className="info-text">Загружаем корзину…</p>
    )
  }

  if (viewState === "error") {
    return cardShell(
      "error",
      <>
        <p className="feedback-error">{error}</p>
        <p className="nav-links" style={{ marginTop: "0.75rem" }}>
          <Link href="/catalog">{actions.viewCatalog}</Link>
        </p>
      </>
    )
  }

  if (viewState === "invalid_state") {
    return cardShell(
      "invalid_state",
      <>
        <p className="bespoke-request-card-title">{cartCopy.invalidState}</p>
        <p className="nav-links" style={{ marginTop: "0.5rem" }}>
          <Link href="/catalog">{actions.viewCatalog}</Link>
          <Link href="/rooms">{actions.toRooms}</Link>
        </p>
      </>
    )
  }

  const cartId = getCartIdFromSession()
  const items = ((cart?.items as Array<Record<string, unknown>>) ?? [])
  if (!cartId || !cart || items.length === 0) {
    return cardShell(
      "empty",
      <>
        <p className="bespoke-request-card-title">{cartCopy.emptyTitle}</p>
        <p className="page-caption bespoke-request-card-caption">{cartCopy.emptyBody}</p>
        <p className="nav-links">
          <Link href="/catalog">{actions.viewCatalog}</Link>
          <Link href="/bespoke/request">{actions.discussProject}</Link>
        </p>
      </>
    )
  }

  const cartTotal =
    cart.total != null
      ? Number(cart.total)
      : items.reduce((sum, item) => {
          const qty = Number((item as { quantity?: number }).quantity ?? 1)
          const line = lineTotal(item, qty)
          return line != null ? sum + line : sum
        }, 0)

  const adultItems = items.filter(
    (item) => !kidsIds.has((item as { product_id?: string }).product_id ?? "")
  )
  const kidsItems = items.filter((item) =>
    kidsIds.has((item as { product_id?: string }).product_id ?? "")
  )

  function renderItem(item: Record<string, unknown>) {
    const lineId = String(item.id)
    const qty = Number((item as { quantity?: number }).quantity ?? 1)
    const thumbSrc = itemThumbSrc(item)
    const specs = itemExecutionSpecs(item)
    const article = itemArticle(item)
    const total = lineTotal(item, qty)
    const productId = (item as { product_id?: string }).product_id
    return (
      <li key={lineId} className="cart-line">
        {thumbSrc ? (
          <Link
            href={productId ? `/product/${productId}` : "#"}
            className="cart-line-thumb"
            tabIndex={-1}
            aria-hidden="true"
          >
            <img src={thumbSrc} alt="" loading="lazy" />
          </Link>
        ) : (
          <span className="cart-line-thumb cart-line-thumb-empty" aria-hidden="true" />
        )}
        <div className="cart-line-info">
          <Link
            href={productId ? `/product/${productId}` : "#"}
            className="cart-line-title"
          >
            {(item.title as string) ?? "—"}
          </Link>
          {(specs.length > 0 || article) && (
            <span className="cart-line-specs">
              {[
                ...specs.map((s) => `${s.label}: ${s.value}`),
                ...(article ? [`Арт. ${article}`] : []),
              ].join(" · ")}
            </span>
          )}
          <span className="cart-line-qty-price">
            {qty} шт.
            {total != null && !Number.isNaN(total) && (
              <> · {formatRub(total)}</>
            )}
          </span>
        </div>
        <button
          type="button"
          className="btn-remove"
          aria-label={cartCopy.removeItemLabel}
          disabled={mutating}
          onClick={() => handleRemove(cartId, lineId)}
        >
          ×
        </button>
      </li>
    )
  }

  return cardShell(
    mutating ? "mutating" : "ready",
    <>
      <h2 className="bespoke-request-card-title">{cartCopy.formTitle}</h2>
      <p className="page-caption bespoke-request-card-caption">{cartCopy.formCaption}</p>

      <div className="cart-card-body">
        {adultItems.length > 0 && (
          <div className="cart-group">
            <h3 className="cart-section-title">Woodright</h3>
            <ul className="cart-lines">{adultItems.map(renderItem)}</ul>
          </div>
        )}

        {kidsItems.length > 0 && (
          <div className="cart-group">
            <h3 className="cart-section-title cart-section-title-kids">Woodright Kids</h3>
            <ul className="cart-lines">{kidsItems.map(renderItem)}</ul>
          </div>
        )}

        {cartTotal > 0 && !Number.isNaN(cartTotal) && (
          <div className="cart-total">
            <span>{cartCopy.total}</span>
            <span>{formatRub(cartTotal)}</span>
          </div>
        )}

        {mutating && <p className="note">{cartCopy.updating}</p>}
        {error && <div className="form-alert-error" role="alert">{error}</div>}

        <Link href="/checkout" className="btn btn-primary bespoke-submit-btn">
          {actions.checkout}
        </Link>
      </div>
    </>
  )
}
