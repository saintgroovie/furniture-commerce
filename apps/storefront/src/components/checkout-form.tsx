"use client"

/**
 * Checkout Phase 1: только вызов API и отображение состояний. Без бизнес-логики.
 * Данные корзины и завершение заказа — только через Medusa store API.
 * Mutation: action → pending → API → success (clear session, show success) | error (feedback).
 *
 * Визуально форма переиспользует те же классы, что "Заявка на расчёт"
 * (bespoke-request-*, form-stack/form-field, bespoke-submit-btn) — это
 * намеренно, чтобы оформление заказа выглядело как часть той же дизайн-системы.
 * Как и там, карточка формы и аside всегда показаны рядом (аside — во всех
 * состояниях, "Состав заказа" — только когда есть загруженная корзина).
 */
import type { ReactNode } from "react"
import { useEffect, useState, useRef, useSyncExternalStore } from "react"
import Link from "next/link"
import { getCartIdFromSession, clearCartIdFromSession } from "@/lib/cart/session"
import { emitCartUpdated } from "@/lib/cart/cart-events"
import { getCart, updateCart, CART_NOT_FOUND } from "@/lib/api/cart"
import { completeCart, prepareCheckoutForCompletion } from "@/lib/api/checkout"
import { formatRub, getOrderDisplayNumber } from "@/lib/format"
import { PackageIcon, ChecklistIcon } from "@/components/bespoke-help-icons"
import { checkoutCopy as copy } from "@/lib/woodright-copy"
import { CopyLines } from "@/components/copy-lines"
import { flatCopy } from "@/lib/format-ru-copy"
import { mintOrderAccess } from "@/lib/woodright-order/api"

type CheckoutState =
  | "empty_cart"
  | "loading"
  | "ready"
  | "submitting"
  | "success"
  | "validation_error"
  | "server_error"
  | "invalid_cart_state"

function subscribeNoop() {
  return () => {}
}

function useIsClient() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false)
}

function useSessionCartId() {
  return useSyncExternalStore(
    subscribeNoop,
    () => getCartIdFromSession(),
    () => null
  )
}

export function CheckoutForm() {
  const isClient = useIsClient()
  const sessionCartId = useSessionCartId()
  const [cart, setCart] = useState<Record<string, unknown> | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>("")
  const [orderNumber, setOrderNumber] = useState<string>("")
  /** undefined = follow session; null = cleared locally after empty/error */
  const [cartIdOverride, setCartIdOverride] = useState<string | null | undefined>(
    undefined
  )
  const cartId = cartIdOverride === undefined ? sessionCartId : cartIdOverride
  const [state, setState] = useState<CheckoutState>("loading")
  const [trackHref, setTrackHref] = useState<string | null>(null)
  const [nameError, setNameError] = useState("")
  const [phoneError, setPhoneError] = useState("")
  const submittingRef = useRef(false)

  useEffect(() => {
    if (!isClient || !sessionCartId) {
      return
    }
    let cancelled = false
    getCart(sessionCartId)
      .then((data: { cart?: Record<string, unknown> }) => {
        if (cancelled) return
        const c = data.cart ?? null
        setCart(c)
        const items = (c?.items as unknown[]) ?? []
        if (!Array.isArray(items) || items.length === 0) {
          clearCartIdFromSession()
          setCartIdOverride(null)
          setState("empty_cart")
        } else {
          setState("ready")
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return
        if (e instanceof Error && e.message === CART_NOT_FOUND) {
          clearCartIdFromSession()
          setCartIdOverride(null)
          setState("invalid_cart_state")
          setErrorMessage(flatCopy(copy.invalidState))
        } else {
          setState("server_error")
          setErrorMessage(flatCopy(copy.loadError))
        }
      })
    return () => {
      cancelled = true
    }
  }, [isClient, sessionCartId])

  const effectiveState: CheckoutState =
    !isClient
      ? "loading"
      : !cartId && (state === "loading" || state === "empty_cart")
        ? "empty_cart"
        : state

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!cartId) return
    if (state !== "ready" && state !== "validation_error" && state !== "server_error") return
    if (submittingRef.current) return
    const form = e.currentTarget
    const name = (form.elements.namedItem("name") as HTMLInputElement)?.value?.trim() ?? ""
    const phone = (form.elements.namedItem("phone") as HTMLInputElement)?.value?.trim() ?? ""
    const email = (form.elements.namedItem("email") as HTMLInputElement)?.value?.trim()
    const address_1 = (form.elements.namedItem("address_1") as HTMLInputElement)?.value?.trim()
    const city = (form.elements.namedItem("city") as HTMLInputElement)?.value?.trim()
    const country_code = (form.elements.namedItem("country_code") as HTMLInputElement)?.value?.trim() || "ru"

    // Такие же обязательные поля, как в «Рассчитать проект»: имя и телефон.
    // Остальное (email, адрес, город) — необязательно, менеджер уточнит при звонке.
    const nextNameError = name ? "" : copy.nameRequired
    const nextPhoneError = phone ? "" : flatCopy(copy.phoneRequired)
    setNameError(nextNameError)
    setPhoneError(nextPhoneError)
    if (nextNameError || nextPhoneError) {
      setState("validation_error")
      setErrorMessage(copy.validationError)
      return
    }

    submittingRef.current = true
    // Medusa's shipping_address wants first/last name separately — split on
    // the first space so the single «Имя» field (same as the bespoke form)
    // still fills both without asking the customer to type it twice.
    const [first_name, ...rest] = name.split(/\s+/)
    const last_name = rest.join(" ") || first_name

    setState("submitting")
    setErrorMessage("")
    try {
      await updateCart(cartId, {
        email: email || undefined,
        shipping_address: {
          first_name,
          last_name,
          phone,
          address_1: address_1 || undefined,
          city: city || undefined,
          country_code,
        },
      })
      await prepareCheckoutForCompletion(cartId)
      const data = await completeCart(cartId)
      const result = data as { type?: string; order?: { id?: string }; error?: string }
      if (result.type === "order" && result.order) {
        setOrderNumber(getOrderDisplayNumber(result.order as Record<string, unknown>))
        const orderId = result.order.id
        if (orderId) {
          try {
            const access = await mintOrderAccess({ orderId, cartId })
            if (access.track_path) setTrackHref(access.track_path)
          } catch {
            // Tracking link is best-effort for MVP; order success still stands.
          }
        }
        clearCartIdFromSession()
        setCartIdOverride(null)
        emitCartUpdated({ count: 0 })
        setState("success")
      } else {
        setState("server_error")
        setErrorMessage(result.error ?? flatCopy(copy.serverError))
      }
    } catch (err) {
      setState("server_error")
      setErrorMessage(err instanceof Error ? err.message : flatCopy(copy.serverError))
    } finally {
      submittingRef.current = false
    }
  }

  const items = (cart?.items as Array<Record<string, unknown>>) ?? []
  const total = cart?.total != null ? Number(cart.total) : null
  const submitting = state === "submitting"

  let cardContent: ReactNode
  let cardState: string = effectiveState

  if (effectiveState === "empty_cart") {
    cardContent = (
      <>
        <p className="bespoke-request-card-title">{copy.emptyCartTitle}</p>
        <CopyLines className="page-caption bespoke-request-card-caption" lines={copy.emptyCartBody} />
        <p className="nav-links">
          <Link href="/catalog">В каталог</Link>
          {" · "}
          <Link href="/rooms">В комнаты</Link>
          {" · "}
          <Link href="/cart">В корзину</Link>
        </p>
      </>
    )
  } else if (effectiveState === "loading") {
    cardContent = <p className="info-text">Загружаем корзину…</p>
  } else if (effectiveState === "invalid_cart_state") {
    cardContent = (
      <>
        <CopyLines className="bespoke-request-card-title" lines={copy.invalidState} />
        <p className="nav-links">
          <Link href="/catalog">В каталог</Link> или <Link href="/cart">в корзину</Link>
        </p>
      </>
    )
  } else if (effectiveState === "success") {
    cardContent = (
      <div className="request-success">
        <p className="request-success-title">{copy.successTitle}</p>
        {orderNumber && (
          <p className="request-success-text">
            {copy.orderNumberLabel}: <strong className="checkout-order-number">{orderNumber}</strong>
          </p>
        )}
        {orderNumber && (
          <CopyLines className="checkout-order-note" role="alert" lines={copy.orderNumberNote} />
        )}
        <CopyLines className="request-success-text" lines={copy.paymentNote} />
        {trackHref && (
          <p className="request-success-text" style={{ marginTop: "0.75rem" }}>
            <Link href={trackHref} className="btn btn-primary">
              {copy.trackOrderCta}
            </Link>
          </p>
        )}
        {trackHref && (
          <p className="info-text" style={{ marginTop: "0.5rem" }}>
            {copy.trackOrderHint}
          </p>
        )}
        <Link href="/catalog" className="btn btn-secondary" style={{ marginTop: "0.75rem" }}>
          {copy.successCta}
        </Link>
      </div>
    )
  } else {
    cardState = state === "validation_error" ? "error_validation" : state === "server_error" ? "error_server" : state
    cardContent = (
      <>
        <h2 className="bespoke-request-card-title">{copy.formTitle}</h2>
        <CopyLines className="page-caption bespoke-request-card-caption" lines={copy.formCaption} />

        <form onSubmit={handleSubmit} data-state={cardState} className="form-stack bespoke-form">
          <div className="form-field">
            <label htmlFor="checkout-name">
              {copy.fields.name}
              <span className="form-required-mark" aria-hidden="true"> *</span>
            </label>
            <input
              id="checkout-name"
              name="name"
              type="text"
              placeholder={copy.placeholders.name}
              disabled={submitting}
              aria-required="true"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? "checkout-name-error" : undefined}
            />
            {nameError && (
              <span id="checkout-name-error" className="feedback-error" role="alert">{nameError}</span>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="checkout-phone">
              {copy.fields.phone}
              <span className="form-required-mark" aria-hidden="true"> *</span>
            </label>
            <input
              id="checkout-phone"
              name="phone"
              type="tel"
              placeholder={copy.placeholders.phone}
              disabled={submitting}
              aria-required="true"
              aria-invalid={phoneError ? true : undefined}
              aria-describedby={phoneError ? "checkout-phone-error" : undefined}
            />
            {phoneError && (
              <span id="checkout-phone-error" className="feedback-error" role="alert">{phoneError}</span>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="checkout-email">{copy.fields.email}</label>
            <input id="checkout-email" name="email" type="email" placeholder={copy.placeholders.email} disabled={submitting} />
          </div>

          <div className="form-field">
            <label htmlFor="checkout-address">{copy.fields.address}</label>
            <input id="checkout-address" name="address_1" type="text" placeholder={copy.placeholders.address} disabled={submitting} />
          </div>

          <div className="form-field">
            <label htmlFor="checkout-city">{copy.fields.city}</label>
            <input id="checkout-city" name="city" type="text" placeholder={copy.placeholders.city} disabled={submitting} />
          </div>

          <div className="form-field">
            <label htmlFor="checkout-country">{copy.fields.country}</label>
            <input id="checkout-country" name="country_code" type="text" defaultValue="ru" disabled={submitting} />
          </div>

          <CopyLines className="checkout-payment-clarity" lines={copy.paymentClarity} />
          <CopyLines className="checkout-legal-note" lines={copy.legalNote} />
          <p className="checkout-legal-links">
            <Link href="/privacy">{copy.legalPrivacyLabel}</Link>
            <span aria-hidden="true"> · </span>
            <Link href="/offer">{copy.legalOfferLabel}</Link>
          </p>

          <button type="submit" className="btn btn-primary bespoke-submit-btn" disabled={submitting}>
            {submitting ? copy.submitting : copy.submit}
          </button>

          {(state === "validation_error" || state === "server_error") && errorMessage && (
            <div className="form-alert-error" role="alert">{errorMessage}</div>
          )}
        </form>
      </>
    )
  }

  return (
    <div className="bespoke-request-layout">
      <div className="bespoke-request-card" data-state={cardState}>{cardContent}</div>

      <aside className="bespoke-request-help">
        {items.length > 0 && (
          <div className="bespoke-request-help-section">
            <div className="bespoke-request-help-section-header">
              <span className="bespoke-request-help-icon">
                <PackageIcon />
              </span>
              <h2>{copy.compositionTitle}</h2>
            </div>
            <ul className="checkout-composition-list">
              {items.map((item) => (
                <li key={String(item.id)} className="checkout-composition-item">
                  <span>{(item.title as string) ?? "Без названия"}</span>
                  <span>× {Number((item as { quantity?: number }).quantity ?? 1)}</span>
                </li>
              ))}
            </ul>
            {total != null && !Number.isNaN(total) && (
              <p className="checkout-composition-total">Итого: {formatRub(total)}</p>
            )}
          </div>
        )}

        <div className="bespoke-request-help-section">
          <div className="bespoke-request-help-section-header">
            <span className="bespoke-request-help-icon">
              <ChecklistIcon />
            </span>
            <h2>{copy.nextStepsTitle}</h2>
          </div>
          <ul className="bespoke-request-help-list">
            {copy.nextStepsBullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        </div>

        <CopyLines className="page-caption" lines={copy.asideCaption} />
      </aside>
    </div>
  )
}
