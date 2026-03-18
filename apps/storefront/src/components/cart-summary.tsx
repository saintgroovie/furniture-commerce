"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { getCartIdFromSession, clearCartIdFromSession } from "@/lib/cart/session"
import { getCart, removeLineItem, CART_NOT_FOUND } from "@/lib/api/cart"
import { formatRub } from "@/lib/format"

type CartViewState = "loading" | "empty" | "ready" | "mutating" | "error" | "invalid_state"

export function CartSummary() {
  const [cart, setCart] = useState<Record<string, unknown> | null>(null)
  const [viewState, setViewState] = useState<CartViewState>("loading")
  const [mutating, setMutating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const cartId = getCartIdFromSession()
    if (!cartId) {
      setCart(null)
      setViewState("empty")
      return
    }
    getCart(cartId)
      .then((data: { cart?: Record<string, unknown> }) => {
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
        <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}>
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
        <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}>
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
        <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}>
          <Link href="/catalog">В каталог</Link>
          <Link href="/rooms">В комнаты</Link>
          <Link href="/">На главную</Link>
        </div>
      </div>
    )
  }

  const total = cart.total != null ? Number(cart.total) : null

  return (
    <div data-state={mutating ? "mutating" : "ready"}>
      <ul className="cart-items">
        {items.map((item: Record<string, unknown>) => {
          const qty = Number((item as { quantity?: number }).quantity ?? 1)
          const unitPrice = (item as { unit_price?: number }).unit_price
          const itemTotal = (item as { total?: number }).total ?? (item as { subtotal?: number }).subtotal
          return (
            <li key={String(item.id)} className="cart-item">
              <div className="cart-item-info">
                <span className="cart-item-title">{(item.title as string) ?? "—"}</span>
                <span className="cart-item-meta">
                  {qty > 1 ? `${qty} шт.` : "1 шт."}
                  {unitPrice != null ? ` · ${formatRub(unitPrice / 100)}` : ""}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                {itemTotal != null && <span className="price">{formatRub(Number(itemTotal) / 100)}</span>}
                <button
                  type="button"
                  onClick={() => handleRemove(cartId, item.id as string)}
                  disabled={mutating}
                  className="btn-danger"
                >
                  Удалить
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {total != null && !Number.isNaN(total) && (
        <div className="cart-total">
          <span>Итого</span>
          <span>{formatRub(total / 100)}</span>
        </div>
      )}

      {mutating && <p className="note" style={{ marginTop: "0.5rem" }}>Обновление…</p>}
      {error && <p className="feedback-error" style={{ marginTop: "0.5rem" }}>{error}</p>}

      <div style={{ marginTop: "1.5rem" }}>
        <Link href="/checkout" className="btn btn-primary">Оформить заказ</Link>
      </div>
    </div>
  )
}
