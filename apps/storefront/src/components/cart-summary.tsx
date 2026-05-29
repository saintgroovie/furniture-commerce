"use client"

/**
 * Cart UI: grouped Woodright / Woodright Kids rows, totals, checkout CTA.
 * Data: client-only via getCartIdFromSession + getCart / removeLineItem.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { getCartIdFromSession, clearCartIdFromSession } from "@/lib/cart/session"
import { getCart, removeLineItem, CART_NOT_FOUND } from "@/lib/api/cart"
import { formatRub } from "@/lib/format"
import { resolveKidsProducts } from "@/lib/kids"

type CartViewState = "loading" | "empty" | "ready" | "mutating" | "error" | "invalid_state"

function lineTotalMinor(item: Record<string, unknown>, qty: number): number | null {
  const total = (item as { total?: number }).total
  if (total != null) return Number(total)
  const subtotal = (item as { subtotal?: number }).subtotal
  if (subtotal != null) return Number(subtotal)
  const unitPrice = (item as { unit_price?: number }).unit_price
  if (unitPrice != null) return Number(unitPrice) * qty
  return null
}

function formatQtyPriceLine(item: Record<string, unknown>, qty: number): string {
  const totalMinor = lineTotalMinor(item, qty)
  const qtyLabel = qty === 1 ? "1 шт." : `${qty} шт.`
  if (totalMinor != null && !Number.isNaN(totalMinor)) {
    return `${qtyLabel} · ${formatRub(totalMinor / 100)}`
  }
  const unitPrice = (item as { unit_price?: number }).unit_price
  if (unitPrice != null) {
    return `${qtyLabel} · ${formatRub((Number(unitPrice) / 100) * qty)}`
  }
  return qtyLabel
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
          setError("Не удалось загрузить корзину.")
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
      const items = (c?.items as unknown[]) ?? []
      if (!Array.isArray(items) || items.length === 0) {
        setViewState("empty")
      }
    } catch {
      setError("Ошибка удаления")
    } finally {
      setMutating(false)
    }
  }

  if (viewState === "loading") {
    return (
      <div data-state="loading">
        <div className="skeleton" style={{ height: "4rem", marginBottom: "0.75rem" }} aria-hidden />
        <div className="skeleton" style={{ height: "4rem", marginBottom: "0.75rem" }} aria-hidden />
        <div className="skeleton" style={{ height: "3rem" }} aria-hidden />
      </div>
    )
  }

  if (viewState === "error") {
    return (
      <div data-state="error">
        <p className="feedback-error">{error}</p>
        <div className="nav-links" style={{ marginTop: "1rem" }}>
          <Link href="/catalog">В каталог</Link>
        </div>
      </div>
    )
  }

  if (viewState === "invalid_state") {
    return (
      <div data-state="invalid_state" className="status-message">
        <p>Корзина недоступна.</p>
        <div className="nav-links nav-links-center">
          <Link href="/catalog">В каталог</Link>
          <Link href="/rooms">В комнаты</Link>
          <Link href="/">На главную</Link>
        </div>
      </div>
    )
  }

  const cartId = getCartIdFromSession()
  if (!cartId || !cart) {
    return (
      <div data-state="empty" className="status-message">
        <p>Корзина пуста.</p>
        <div className="nav-links nav-links-center">
          <Link href="/catalog">В каталог</Link>
          <Link href="/rooms">В комнаты</Link>
          <Link href="/">На главную</Link>
        </div>
      </div>
    )
  }

  const items = (cart.items as Array<Record<string, unknown>>) ?? []
  if (items.length === 0) {
    return (
      <div data-state="empty" className="status-message">
        <p>Корзина пуста.</p>
        <div className="nav-links nav-links-center">
          <Link href="/catalog">В каталог</Link>
          <Link href="/rooms">В комнаты</Link>
          <Link href="/">На главную</Link>
        </div>
      </div>
    )
  }

  const cartTotalMinor =
    cart.total != null
      ? Number(cart.total)
      : items.reduce((sum, item) => {
          const qty = Number((item as { quantity?: number }).quantity ?? 1)
          const line = lineTotalMinor(item, qty)
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
    return (
      <li key={lineId} className="cart-item">
        <div className="cart-item-info">
          <span className="cart-item-title">{(item.title as string) ?? "—"}</span>
          <span className="cart-item-meta">{formatQtyPriceLine(item, qty)}</span>
        </div>
        <div className="cart-item-actions">
          <button
            type="button"
            className="btn-remove"
            aria-label="Удалить товар"
            disabled={mutating}
            onClick={() => handleRemove(cartId, lineId)}
          >
            ×
          </button>
        </div>
      </li>
    )
  }

  return (
    <div data-state={mutating ? "mutating" : "ready"} className="cart-summary">
      {adultItems.length > 0 && (
        <div className="cart-group">
          <h3 className="cart-section-title">Woodright</h3>
          <ul className="cart-items">{adultItems.map(renderItem)}</ul>
        </div>
      )}

      {kidsItems.length > 0 && (
        <div className="cart-group">
          <h3 className="cart-section-title cart-section-title-kids">Woodright Kids</h3>
          <ul className="cart-items">{kidsItems.map(renderItem)}</ul>
        </div>
      )}

      {cartTotalMinor > 0 && !Number.isNaN(cartTotalMinor) && (
        <div className="cart-total">
          <span>Итого</span>
          <span>{formatRub(cartTotalMinor / 100)}</span>
        </div>
      )}

      {mutating && <p className="note">Обновление…</p>}
      {error && <p className="feedback-error" style={{ marginTop: "0.5rem" }}>{error}</p>}

      <div className="cart-checkout">
        <Link href="/checkout" className="btn btn-primary">
          Оформить заказ
        </Link>
      </div>
    </div>
  )
}
