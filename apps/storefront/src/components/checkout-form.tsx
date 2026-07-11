"use client"

/**
 * Checkout Phase 1: только вызов API и отображение состояний. Без бизнес-логики.
 * Данные корзины и завершение заказа — только через Medusa store API.
 * Mutation: action → pending → API → success (clear session, show success) | error (feedback).
 */
import { useEffect, useState, useRef } from "react"
import Link from "next/link"
import { getCartIdFromSession, clearCartIdFromSession } from "@/lib/cart/session"
import { getCart, updateCart, CART_NOT_FOUND } from "@/lib/api/cart"
import { completeCart } from "@/lib/api/checkout"
import { a1Checkout } from "@/lib/package-a1-copy"

type CheckoutState =
  | "empty_cart"
  | "loading"
  | "ready"
  | "submitting"
  | "success"
  | "validation_error"
  | "server_error"
  | "invalid_cart_state"

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
    if (!cartId) return
    if (
      state !== "ready" &&
      state !== "validation_error" &&
      state !== "server_error"
    ) {
      return
    }
    if (submittingRef.current) return
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

    submittingRef.current = true
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
      <div data-state="empty_cart">
        <p>Корзина пуста. Оформление заказа недоступно.</p>
        <p>
          <Link href="/catalog">В каталог</Link>
          {" · "}
          <Link href="/rooms">В комнаты</Link>
          {" · "}
          <Link href="/cart">В корзину</Link>
        </p>
      </div>
    )
  }

  if (state === "loading") {
    return (
      <div data-state="loading">
        <div style={{ height: "2rem", backgroundColor: "#f5f5f5", marginBottom: "0.5rem" }} aria-hidden />
        <div style={{ height: "4rem", backgroundColor: "#f5f5f5", marginBottom: "0.5rem" }} aria-hidden />
        <div style={{ height: "3rem", backgroundColor: "#f5f5f5" }} aria-hidden />
      </div>
    )
  }

  if (state === "invalid_cart_state") {
    return (
      <div data-state="invalid_cart_state">
        <p>Корзина повреждена или недоступна.</p>
        <p><Link href="/catalog">В каталог</Link> или <Link href="/cart">В корзину</Link>.</p>
      </div>
    )
  }

  if (state === "success") {
    return (
      <div data-state="success">
        <p style={{ fontWeight: "bold" }}>{a1Checkout.successTitle}</p>
        {orderId && <p>Номер заказа: {orderId}</p>}
        <p>{a1Checkout.successBody}</p>
        <p>
          <Link href="/catalog">В каталог</Link>
        </p>
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
          <section style={{ marginBottom: "1.5rem" }} aria-label="Состав заказа">
            <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.5rem" }}>Состав заказа</h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {items.map((item: Record<string, unknown>) => (
                <li key={String(item.id)} style={{ marginBottom: "0.25rem" }}>
                  {(item.title as string) ?? "—"} × {Number((item as { quantity?: number }).quantity ?? 1)}
                </li>
              ))}
            </ul>
            {total != null && !Number.isNaN(total) && (
              <p style={{ marginTop: "0.5rem", fontWeight: 600 }}>Итого: {total} ₽</p>
            )}
          </section>
        )}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: "400px" }}>
          <label>Email * <input name="email" type="email" required disabled={state === "submitting"} /></label>
          <label>Имя * <input name="first_name" type="text" required disabled={state === "submitting"} /></label>
          <label>Фамилия * <input name="last_name" type="text" required disabled={state === "submitting"} /></label>
          <label>Адрес * <input name="address_1" type="text" required disabled={state === "submitting"} /></label>
          <label>Город * <input name="city" type="text" required disabled={state === "submitting"} /></label>
          <label>Индекс * <input name="postal_code" type="text" required disabled={state === "submitting"} /></label>
          <label>Страна <input name="country_code" type="text" defaultValue="ru" disabled={state === "submitting"} /></label>
          <button type="submit" disabled={state === "submitting"}>
            {state === "submitting" ? a1Checkout.submitting : a1Checkout.submit}
          </button>
          {(state === "validation_error" || state === "server_error") && errorMessage && (
            <p style={{ color: "red" }} role="alert">{errorMessage}</p>
          )}
        </form>
      </div>
    )
  }

  return null
}
