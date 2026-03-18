"use client"

import { useEffect, useState, useRef } from "react"
import Link from "next/link"
import { getCartIdFromSession, clearCartIdFromSession } from "@/lib/cart/session"
import { getCart, updateLineItem, removeLineItem, CART_NOT_FOUND } from "@/lib/api/cart"
import { formatRub } from "@/lib/format"
import { resolveKidsProducts } from "@/lib/kids"

type CartViewState = "loading" | "empty" | "ready" | "mutating" | "error" | "invalid_state"

export function CartSummary() {
  const [cart, setCart] = useState<Record<string, unknown> | null>(null)
  const [viewState, setViewState] = useState<CartViewState>("loading")
  const [mutating, setMutating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [kidsIds, setKidsIds] = useState<Set<string>>(new Set())
  const [editingQty, setEditingQty] = useState<Record<string, string>>({})
  const mutatingRef = useRef(false)

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
    if (mutatingRef.current) return
    mutatingRef.current = true
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
      mutatingRef.current = false
      setMutating(false)
    }
  }

  async function handleQuantityUpdate(lineId: string, newQty: number) {
    const cid = getCartIdFromSession()
    if (newQty < 1 || !cid || mutatingRef.current) return
    mutatingRef.current = true
    setMutating(true)
    setError(null)
    setEditingQty((prev) => {
      const next = { ...prev }
      delete next[lineId]
      return next
    })
    try {
      await updateLineItem(cid, lineId, { quantity: newQty })
      const data = await getCart(cid)
      const c = data.cart ?? null
      setCart(c)
      const items = (c?.items as unknown[]) ?? []
      if (!Array.isArray(items) || items.length === 0) {
        setViewState("empty")
      }
    } catch {
      setError("Ошибка обновления количества")
    } finally {
      mutatingRef.current = false
      setMutating(false)
    }
  }

  function commitQuantity(lineId: string, currentQty: number) {
    const raw = editingQty[lineId]
    if (raw == null) return
    const parsed = parseInt(raw, 10)
    const newQty = Number.isFinite(parsed) && parsed >= 1 ? parsed : currentQty
    setEditingQty((prev) => {
      const next = { ...prev }
      delete next[lineId]
      return next
    })
    if (newQty !== currentQty) {
      handleQuantityUpdate(lineId, newQty)
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

  const total = cart.total != null ? Number(cart.total) : null

  const adultItems = items.filter(
    (item) => !kidsIds.has((item as { product_id?: string }).product_id ?? "")
  )
  const kidsItems = items.filter(
    (item) => kidsIds.has((item as { product_id?: string }).product_id ?? "")
  )
  const showHeaders = adultItems.length > 0 && kidsItems.length > 0

  function renderItem(item: Record<string, unknown>) {
    const lineId = String(item.id)
    const qty = Number((item as { quantity?: number }).quantity ?? 1)
    const unitPrice = (item as { unit_price?: number }).unit_price
    const itemTotal = (item as { total?: number }).total ?? (item as { subtotal?: number }).subtotal
    const displayQty = editingQty[lineId] ?? String(qty)

    return (
      <li key={lineId} className="cart-item">
        <div className="cart-item-info">
          <span className="cart-item-title">{(item.title as string) ?? "—"}</span>
          <span className="cart-item-meta">
            {unitPrice != null ? `${formatRub(unitPrice / 100)} за шт.` : ""}
          </span>
        </div>
        <div className="cart-item-actions">
          <div className="qty-control">
            <button
              type="button"
              className="qty-btn"
              aria-label="Уменьшить количество"
              disabled={mutating || qty <= 1}
              onClick={() => handleQuantityUpdate(lineId, qty - 1)}
            >
              −
            </button>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="qty-input"
              aria-label="Количество"
              value={displayQty}
              disabled={mutating}
              onChange={(e) => setEditingQty((prev) => ({ ...prev, [lineId]: e.target.value }))}
              onBlur={() => commitQuantity(lineId, qty)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur()
              }}
            />
            <button
              type="button"
              className="qty-btn"
              aria-label="Увеличить количество"
              disabled={mutating}
              onClick={() => handleQuantityUpdate(lineId, qty + 1)}
            >
              +
            </button>
          </div>
          {itemTotal != null && <span className="price">{formatRub(Number(itemTotal) / 100)}</span>}
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
    <div data-state={mutating ? "mutating" : "ready"}>
      {adultItems.length > 0 && (
        <div className="cart-group">
          {showHeaders && <h3 className="cart-section-title">Woodright</h3>}
          <ul className="cart-items">{adultItems.map(renderItem)}</ul>
        </div>
      )}

      {kidsItems.length > 0 && (
        <div className="cart-group">
          {showHeaders && (
            <h3 className="cart-section-title cart-section-title-kids">
              Woodright Kids
            </h3>
          )}
          <ul className="cart-items">{kidsItems.map(renderItem)}</ul>
        </div>
      )}

      {total != null && !Number.isNaN(total) && (
        <div className="cart-total">
          <span>Итого</span>
          <span>{formatRub(total / 100)}</span>
        </div>
      )}

      {mutating && <p className="note">Обновление…</p>}
      {error && <p className="feedback-error" style={{ marginTop: "0.5rem" }}>{error}</p>}

      <div className="cart-checkout">
        <Link href="/checkout" className="btn btn-primary">Оформить заказ</Link>
      </div>
    </div>
  )
}
