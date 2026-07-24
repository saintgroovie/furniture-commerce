import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { createHash } from "node:crypto"
import { ORDER_PROCESS_MODULE } from "../../../../../modules/order-process"
import type { OrderProcessServiceLike } from "../../../../../lib/woodright-order-process/ensure-process"
import { mintOrderAccessToken } from "../../../../../lib/woodright-order-process/guest-access-token"

function hashCartId(cartId: string): string {
  return createHash("sha256").update(cartId, "utf8").digest("hex")
}

function asTime(value: unknown): number | null {
  if (!value) return null
  const t = new Date(value as string | Date).getTime()
  return Number.isFinite(t) ? t : null
}

/**
 * Mint / rotate opaque guest access token.
 * Requires completed cart bound to the order (email + completion window).
 * Remint requires the same cart_id_hash.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params.order_id as string
  const body = req.body as { cart_id?: string }
  const cartId = typeof body.cart_id === "string" ? body.cart_id.trim() : ""

  const deny = () => {
    res.status(404).json({
      code: "ORDER_NOT_FOUND",
      message: "Не удалось открыть заказ",
    })
  }

  if (!cartId) {
    deny()
    return
  }

  const orderModule = req.scope.resolve(Modules.ORDER) as {
    retrieveOrder: (id: string) => Promise<Record<string, unknown>>
  }
  const cartModule = req.scope.resolve(Modules.CART) as {
    retrieveCart: (id: string) => Promise<Record<string, unknown>>
  }

  let order: Record<string, unknown>
  let cart: Record<string, unknown>
  try {
    order = await orderModule.retrieveOrder(orderId)
    cart = await cartModule.retrieveCart(cartId)
  } catch {
    deny()
    return
  }

  if (!order?.id || !cart?.id) {
    deny()
    return
  }

  if (!cart.completed_at) {
    deny()
    return
  }

  const orderEmail = String(order.email ?? "")
    .trim()
    .toLowerCase()
  const cartEmail = String(cart.email ?? "")
    .trim()
    .toLowerCase()
  if (!orderEmail || !cartEmail || orderEmail !== cartEmail) {
    deny()
    return
  }

  const orderCreated = asTime(order.created_at)
  const cartCompleted = asTime(cart.completed_at)
  if (
    orderCreated == null ||
    cartCompleted == null ||
    Math.abs(orderCreated - cartCompleted) > 30 * 60 * 1000
  ) {
    deny()
    return
  }

  const service = req.scope.resolve(
    ORDER_PROCESS_MODULE
  ) as unknown as OrderProcessServiceLike

  const cartHash = hashCartId(cartId)
  const existing = await service.listWoodrightOrderAccesses({
    order_id: orderId,
  })
  const existingRow = existing?.[0] as
    | { id: string; cart_id_hash?: string | null }
    | undefined

  if (
    existingRow?.cart_id_hash &&
    existingRow.cart_id_hash !== cartHash
  ) {
    deny()
    return
  }

  const minted = mintOrderAccessToken()

  if (existingRow?.id) {
    await service.updateWoodrightOrderAccesses({
      id: existingRow.id,
      token_hash: minted.token_hash,
      cart_id_hash: cartHash,
      expires_at: minted.expires_at,
      revoked_at: null,
    })
  } else {
    await service.createWoodrightOrderAccesses({
      order_id: orderId,
      token_hash: minted.token_hash,
      cart_id_hash: cartHash,
      expires_at: minted.expires_at,
      revoked_at: null,
    })
  }

  res.status(201).json({
    order_id: orderId,
    token: minted.token,
    expires_at: minted.expires_at.toISOString(),
    track_path: `/orders/track?order_id=${encodeURIComponent(orderId)}&token=${encodeURIComponent(minted.token)}`,
  })
}
