import { getBaseUrl, medusaFetch } from "./base"
import { getCart } from "./cart"

const SYSTEM_PAYMENT_PROVIDER = "pp_system_default"

export async function getRegions() {
  const base = getBaseUrl()
  const res = await medusaFetch(`${base}/store/regions`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function parseError(res: Response, fallback: string): Promise<never> {
  const text = await res.text()
  let message = fallback
  try {
    const data = text ? JSON.parse(text) : null
    if (data && typeof (data as { message?: unknown }).message === "string") {
      message = (data as { message: string }).message
    } else if (text) {
      message = text
    }
  } catch {
    if (text) message = text
  }
  throw new Error(message)
}

/**
 * Medusa requires payment collection + session and shipping method before cart completion,
 * even when using the built-in no-op system provider (no online payment in MVP).
 */
export async function prepareCheckoutForCompletion(cartId: string) {
  const base = getBaseUrl()

  const cartPayload = await getCart(cartId)
  const cart = (cartPayload.cart ?? {}) as Record<string, unknown>

  const shippingMethods = cart.shipping_methods as unknown[] | undefined
  if (!shippingMethods?.length) {
    const optionsRes = await medusaFetch(
      `${base}/store/shipping-options?cart_id=${encodeURIComponent(cartId)}`
    )
    if (!optionsRes.ok) {
      await parseError(optionsRes, "Не удалось получить варианты доставки.")
    }
    const optionsData = (await optionsRes.json()) as {
      shipping_options?: Array<{ id: string }>
    }
    const optionId = optionsData.shipping_options?.[0]?.id
    if (!optionId) {
      throw new Error(
        "Нет доступных способов доставки. Запустите на backend: npm run ensure-checkout-ready"
      )
    }
    const shipRes = await medusaFetch(`${base}/store/carts/${cartId}/shipping-methods`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ option_id: optionId }),
    })
    if (!shipRes.ok) {
      await parseError(shipRes, "Не удалось выбрать доставку.")
    }
  }

  let paymentCollectionId = (cart.payment_collection as { id?: string } | undefined)?.id
  if (!paymentCollectionId) {
    const pcRes = await medusaFetch(`${base}/store/payment-collections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cart_id: cartId }),
    })
    if (!pcRes.ok) {
      await parseError(pcRes, "Не удалось инициализировать оплату заказа.")
    }
    const pcData = (await pcRes.json()) as {
      payment_collection?: { id?: string }
    }
    paymentCollectionId = pcData.payment_collection?.id
  }

  if (!paymentCollectionId) {
    throw new Error("Payment collection has not been initiated for cart")
  }

  const sessionRes = await medusaFetch(
    `${base}/store/payment-collections/${paymentCollectionId}/payment-sessions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider_id: SYSTEM_PAYMENT_PROVIDER,
        data: {},
      }),
    }
  )
  if (!sessionRes.ok) {
    await parseError(
      sessionRes,
      "Не удалось подготовить заказ без онлайн-оплаты. Запустите: npm run ensure-checkout-ready"
    )
  }
}

export async function completeCart(cartId: string) {
  const base = getBaseUrl()
  const res = await medusaFetch(`${base}/store/carts/${cartId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
  if (!res.ok) {
    await parseError(res, "Ошибка оформления заказа.")
  }
  return res.json()
}
