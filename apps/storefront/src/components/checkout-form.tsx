"use client"

import { useEffect, useState, useRef } from "react"
import Link from "next/link"
import { getCartIdFromSession, clearCartIdFromSession } from "@/lib/cart/session"
import { getCart, updateCart, CART_NOT_FOUND } from "@/lib/api/cart"
import { completeCart } from "@/lib/api/checkout"

type CheckoutState =
  | "empty_cart"
  | "loading"
  | "ready"
  | "submitting"
  | "success"
  | "validation_error"
  | "server_error"
  | "invalid_cart_state"

function formatRub(amount: number): string {
  return amount.toLocaleString("ru-RU") + " ₽"
}

export function CheckoutForm() {
  const [state, setState] = useState<CheckoutState>("loading")
  const [cart, setCart] = useState<Record<string, unknown> | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>("")
  const [orderId, setOrderId] = useState<string>("")
  const [cartId, setCartId] = useState<string | null>(null)
  const submittingRef = useRef(false)

  useEffect(() => {
    const id = getCartIdFromSession()
    setCartId(id)
    if (!id) {
      setState("empty_cart")
      return
    }
    setState("loading")
    getCart(id)
      .then((data: { cart?: Record<string, unknown> }) => {
        const c = data.cart ?? null
        setCart(c)
        const items = (c?.items as unknown[]) ?? []
        if (!Array.isArray(items) || items.length === 0) {
          clearCartIdFromSession()
          setCartId(null)
          setState("empty_cart")
        } else {
          setState("ready")
        }
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.message === CART_NOT_FOUND) {
          clearCartIdFromSession()
          setCartId(null)
          setState("invalid_cart_state")
          setErrorMessage("Корзина недоступна.")
        } else {
          setState("server_error")
          setErrorMessage("Не удалось загрузить корзину.")
        }
      })
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!cartId || state !== "ready") return
    if (submittingRef.current) return
    submittingRef.current = true
    const form = e.currentTarget
    const email = (form.elements.namedItem("email") as HTMLInputElement)?.value?.trim()
    const first_name = (form.elements.namedItem("first_name") as HTMLInputElement)?.value?.trim()
    const last_name = (form.elements.namedItem("last_name") as HTMLInputElement)?.value?.trim()
    const address_1 = (form.elements.namedItem("address_1") as HTMLInputElement)?.value?.trim()
    const city = (form.elements.namedItem("city") as HTMLInputElement)?.value?.trim()
    const postal_code = (form.elements.namedItem("postal_code") as HTMLInputElement)?.value?.trim()
    const country_code = (form.elements.namedItem("country_code") as HTMLInputElement)?.value?.trim() || "ru"

    if (!email || !first_name || !last_name || !address_1 || !city || !postal_code) {
      setState("validation_error")
      setErrorMessage("Заполните обязательные поля.")
      return
    }

    setState("submitting")
    setErrorMessage("")
    try {
      await updateCart(cartId, {
        email,
        shipping_address: {
          first_name,
          last_name,
          address_1,
          city,
          postal_code,
          country_code,
        },
      })
      const data = await completeCart(cartId)
      const result = data as { type?: string; order?: { id?: string }; error?: string }
      if (result.type === "order" && result.order) {
        setOrderId(result.order.id ?? "")
        clearCartIdFromSession()
        setState("success")
      } else {
        setState("server_error")
        setErrorMessage(result.error ?? "Ошибка оформления заказа.")
      }
    } catch (err) {
      setState("server_error")
      setErrorMessage(err instanceof Error ? err.message : "Ошибка оформления заказа.")
    } finally {
      submittingRef.current = false
    }
  }

  if (state === "empty_cart") {
    return (
      <div data-state="empty_cart" className="status-message">
        <p>Корзина пуста. Оформление заказа недоступно.</p>
        <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}>
          <Link href="/catalog">В каталог</Link>
          <Link href="/rooms">В комнаты</Link>
          <Link href="/cart">В корзину</Link>
        </div>
      </div>
    )
  }

  if (state === "loading") {
    return (
      <div data-state="loading">
        <div className="skeleton" style={{ height: "6rem", marginBottom: "1rem" }} aria-hidden />
        <div className="skeleton" style={{ height: "12rem" }} aria-hidden />
      </div>
    )
  }

  if (state === "invalid_cart_state") {
    return (
      <div data-state="invalid_cart_state" className="status-message">
        <p>Корзина повреждена или недоступна.</p>
        <div className="nav-links nav-links-center" style={{ marginTop: "1rem" }}>
          <Link href="/catalog">В каталог</Link>
          <Link href="/cart">В корзину</Link>
        </div>
      </div>
    )
  }

  if (state === "success") {
    return (
      <div data-state="success" className="status-message">
        <h2>Заказ оформлен</h2>
        {orderId && <p style={{ marginTop: "0.5rem" }}>Номер заказа: <strong>{orderId}</strong></p>}
        <p className="info-text" style={{ marginTop: "0.75rem" }}>
          Оплата по ссылке: менеджер отправит вам ссылку на оплату отдельно.
        </p>
        <div className="nav-links nav-links-center" style={{ marginTop: "1.5rem" }}>
          <Link href="/catalog">В каталог</Link>
          <Link href="/">На главную</Link>
        </div>
      </div>
    )
  }

  if (state === "ready" || state === "submitting" || state === "validation_error" || state === "server_error") {
    const items = (cart?.items as Array<Record<string, unknown>>) ?? []
    const total = cart?.total != null ? Number(cart.total) : null
    const dataState = state === "submitting" ? "submitting" : state === "validation_error" ? "error_validation" : state === "server_error" ? "error_server" : "ready"

    return (
      <div data-state={dataState}>
        {items.length > 0 && (
          <section className="order-summary" aria-label="Состав заказа">
            <h2>Состав заказа</h2>
            {items.map((item: Record<string, unknown>) => {
              const qty = Number((item as { quantity?: number }).quantity ?? 1)
              const itemTotal = (item as { total?: number }).total ?? (item as { subtotal?: number }).subtotal
              return (
                <div key={String(item.id)} className="order-summary-item">
                  <span>{(item.title as string) ?? "—"} × {qty}</span>
                  {itemTotal != null && <span>{formatRub(itemTotal)}</span>}
                </div>
              )
            })}
            {total != null && !Number.isNaN(total) && (
              <div className="order-summary-total">
                <span>Итого</span>
                <span>{formatRub(total)}</span>
              </div>
            )}
          </section>
        )}

        <form onSubmit={handleSubmit} className="form-stack">
          <div className="form-field">
            <label htmlFor="checkout-email">Email *</label>
            <input id="checkout-email" name="email" type="email" required disabled={state === "submitting"} />
          </div>
          <div className="form-field">
            <label htmlFor="checkout-first-name">Имя *</label>
            <input id="checkout-first-name" name="first_name" type="text" required disabled={state === "submitting"} />
          </div>
          <div className="form-field">
            <label htmlFor="checkout-last-name">Фамилия *</label>
            <input id="checkout-last-name" name="last_name" type="text" required disabled={state === "submitting"} />
          </div>
          <div className="form-field">
            <label htmlFor="checkout-address">Адрес *</label>
            <input id="checkout-address" name="address_1" type="text" required disabled={state === "submitting"} />
          </div>
          <div className="form-field">
            <label htmlFor="checkout-city">Город *</label>
            <input id="checkout-city" name="city" type="text" required disabled={state === "submitting"} />
          </div>
          <div className="form-field">
            <label htmlFor="checkout-postal">Индекс *</label>
            <input id="checkout-postal" name="postal_code" type="text" required disabled={state === "submitting"} />
          </div>
          <div className="form-field">
            <label htmlFor="checkout-country">Страна</label>
            <input id="checkout-country" name="country_code" type="text" defaultValue="ru" disabled={state === "submitting"} />
          </div>
          <button type="submit" disabled={state === "submitting"} className="btn btn-primary">
            {state === "submitting" ? "Оформление…" : "Оформить заказ"}
          </button>
          {(state === "validation_error" || state === "server_error") && errorMessage && (
            <p className="feedback-error" role="alert">{errorMessage}</p>
          )}
        </form>
      </div>
    )
  }

  return null
}
