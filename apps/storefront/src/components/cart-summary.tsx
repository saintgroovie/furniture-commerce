"use client"

/**
 * Данные корзины загружаются только на клиенте. Нет cart_id в cookie → пустая корзина (cart не создаётся).
 * После remove — removeLineItem() и повторный getCart(); без global cart store.
 * invalid_state: cart_id есть, но cart не существует (404) → очистка session, сообщение.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { getCartIdFromSession, clearCartIdFromSession } from "@/lib/cart/session"
import { getCart, removeLineItem, CART_NOT_FOUND } from "@/lib/api/cart"

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
        setCart(data.cart ?? null)
        setViewState("ready")
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
      setCart(data.cart ?? null)
    } catch {
      setError("Ошибка удаления")
    } finally {
      setMutating(false)
    }
  }

  if (viewState === "loading") {
    return (
      <div data-state="loading">
        <div style={{ height: "2rem", backgroundColor: "#f5f5f5", marginBottom: "0.5rem" }} aria-hidden />
        <div style={{ height: "4rem", backgroundColor: "#f5f5f5", marginBottom: "0.5rem" }} aria-hidden />
        <div style={{ height: "3rem", backgroundColor: "#f5f5f5" }} aria-hidden />
      </div>
    )
  }
  if (viewState === "error") return <p data-state="error" style={{ color: "red" }}>{error}</p>
  if (viewState === "invalid_state") {
    return (
      <div data-state="invalid_state">
        <p>Корзина недоступна.</p>
        <p>
          <Link href="/catalog">В каталог</Link>, <Link href="/rooms">в комнаты</Link>, <Link href="/">на главную</Link>.
        </p>
      </div>
    )
  }

  const cartId = getCartIdFromSession()
  if (!cartId || !cart) {
    return (
      <div data-state="empty">
        <p>Корзина пуста.</p>
        <p>
          <Link href="/catalog">В каталог</Link>, <Link href="/rooms">в комнаты</Link>, <Link href="/">на главную</Link>.
        </p>
      </div>
    )
  }

  const items = (cart.items as Array<Record<string, unknown>>) ?? []
  if (items.length === 0) {
    return (
      <div data-state="empty">
        <p>Корзина пуста.</p>
        <p>
          <Link href="/catalog">В каталог</Link>, <Link href="/rooms">в комнаты</Link>, <Link href="/">на главную</Link>.
        </p>
      </div>
    )
  }

  return (
    <div data-state={mutating ? "mutating" : "ready"}>
      <ul style={{ listStyle: "none", marginTop: "0.5rem" }}>
        {items.map((item: Record<string, unknown>) => (
          <li key={String(item.id)} style={{ marginBottom: "0.5rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <span>{(item.title as string) ?? "—"} × {Number((item as { quantity?: number }).quantity ?? 1)}</span>
            <button
              type="button"
              onClick={() => handleRemove(cartId, item.id as string)}
              disabled={mutating}
              style={{ fontSize: "0.85rem" }}
            >
              Удалить
            </button>
          </li>
        ))}
      </ul>
      {mutating && <p>Обновление…</p>}
      <p style={{ marginTop: "1rem" }}>
        <Link href="/checkout">Оформить заказ</Link>
      </p>
    </div>
  )
}
