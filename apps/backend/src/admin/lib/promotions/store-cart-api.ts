import type { StoreCartLike } from "./cart-result.ts"

/**
 * Package E — Store API helpers for cart verification.
 * Store endpoints require the `x-publishable-api-key` header. The admin panel
 * has no build-time access to the storefront key
 * (NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY), so the key is resolved at runtime:
 * explicit parameter → window override → localStorage. When no key is found,
 * helpers fail closed with `publishable_key_missing` — verification is
 * impossible, not "assumed fine".
 *
 * Known limitation (patch-skip-cart-promotions.mjs, Medusa #14149):
 * automatic promotions do NOT refresh on cart create / item update in this
 * install. Explicit POST /store/carts/:id/promotions *does* run computeActions
 * and may apply *other* active automatic promotions in addition to the code
 * under test — UI must attribute adjustments honestly (see cart-result.ts).
 * The endpoint may still hit #14149 on some fixtures — smoke on :9001 required.
 */

export type StoreApiFailure = { status: number; body: unknown }
export type PublishableKeyMissing = { status: 0; body: { code: "publishable_key_missing" } }

const KEY_STORAGE_NAME = "WOODRIGHT_STORE_PUBLISHABLE_KEY"

export function resolvePublishableKey(explicit?: string | null): string | null {
  if (explicit?.trim()) return explicit.trim()
  try {
    const w = window as unknown as { __WOODRIGHT_STORE_PUBLISHABLE_KEY__?: string }
    if (w.__WOODRIGHT_STORE_PUBLISHABLE_KEY__?.trim()) {
      return w.__WOODRIGHT_STORE_PUBLISHABLE_KEY__.trim()
    }
  } catch {
    /* not in a browser */
  }
  try {
    const ls = window.localStorage.getItem(KEY_STORAGE_NAME)
    if (ls?.trim()) return ls.trim()
  } catch {
    /* storage unavailable */
  }
  return null
}

export const PUBLISHABLE_KEY_MISSING: PublishableKeyMissing = {
  status: 0,
  body: { code: "publishable_key_missing" },
}

function storeHeaders(key: string, init?: RequestInit): HeadersInit {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-publishable-api-key": key,
    ...(init?.headers ?? {}),
  }
}

const CART_FIELDS = [
  "id",
  "currency_code",
  "total",
  "discount_total",
  "*items",
  "*items.adjustments",
  "*shipping_methods",
  "*shipping_methods.adjustments",
  "*promotions",
].join(",")

export type StoreCartResponse = { cart: StoreCartLike & Record<string, unknown> }

export async function createStoreCart(
  input: { region_id?: string; currency_code?: string; publishableKey?: string | null },
  init?: RequestInit
): Promise<StoreCartResponse | StoreApiFailure | PublishableKeyMissing> {
  const key = resolvePublishableKey(input.publishableKey)
  if (!key) return PUBLISHABLE_KEY_MISSING
  const payload: Record<string, unknown> = {}
  if (input.region_id) payload.region_id = input.region_id
  if (input.currency_code) payload.currency_code = input.currency_code
  const res = await fetch(`/store/carts?fields=${encodeURIComponent(CART_FIELDS)}`, {
    method: "POST",
    ...init,
    headers: storeHeaders(key, init),
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { status: res.status, body }
  return body as StoreCartResponse
}

export async function addStoreCartLineItem(
  cartId: string,
  input: { variant_id: string; quantity: number; publishableKey?: string | null },
  init?: RequestInit
): Promise<StoreCartResponse | StoreApiFailure | PublishableKeyMissing> {
  const key = resolvePublishableKey(input.publishableKey)
  if (!key) return PUBLISHABLE_KEY_MISSING
  const res = await fetch(
    `/store/carts/${encodeURIComponent(cartId)}/line-items?fields=${encodeURIComponent(CART_FIELDS)}`,
    {
      method: "POST",
      ...init,
      headers: storeHeaders(key, init),
      body: JSON.stringify({ variant_id: input.variant_id, quantity: input.quantity }),
    }
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { status: res.status, body }
  return body as StoreCartResponse
}

/**
 * ADD codes to the cart. Passing an empty array REPLACES (clears) the applied
 * set on this endpoint — never call it with [] during verification.
 */
export async function applyStoreCartPromoCodes(
  cartId: string,
  input: { promo_codes: string[]; publishableKey?: string | null },
  init?: RequestInit
): Promise<StoreCartResponse | StoreApiFailure | PublishableKeyMissing> {
  const key = resolvePublishableKey(input.publishableKey)
  if (!key) return PUBLISHABLE_KEY_MISSING
  if (!input.promo_codes.length) {
    return {
      status: 0,
      body: { code: "empty_promo_codes", message: "Refusing to clear promotions during verification" },
    }
  }
  const res = await fetch(
    `/store/carts/${encodeURIComponent(cartId)}/promotions?fields=${encodeURIComponent(CART_FIELDS)}`,
    {
      method: "POST",
      ...init,
      headers: storeHeaders(key, init),
      body: JSON.stringify({ promo_codes: input.promo_codes }),
    }
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { status: res.status, body }
  return body as StoreCartResponse
}

export async function removeStoreCartPromoCodes(
  cartId: string,
  input: { promo_codes: string[]; publishableKey?: string | null },
  init?: RequestInit
): Promise<StoreCartResponse | StoreApiFailure | PublishableKeyMissing> {
  const key = resolvePublishableKey(input.publishableKey)
  if (!key) return PUBLISHABLE_KEY_MISSING
  const res = await fetch(
    `/store/carts/${encodeURIComponent(cartId)}/promotions?fields=${encodeURIComponent(CART_FIELDS)}`,
    {
      method: "DELETE",
      ...init,
      headers: storeHeaders(key, init),
      body: JSON.stringify({ promo_codes: input.promo_codes }),
    }
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { status: res.status, body }
  return body as StoreCartResponse
}

export async function fetchStoreCart(
  cartId: string,
  input?: { publishableKey?: string | null },
  init?: RequestInit
): Promise<StoreCartResponse | StoreApiFailure | PublishableKeyMissing> {
  const key = resolvePublishableKey(input?.publishableKey)
  if (!key) return PUBLISHABLE_KEY_MISSING
  const res = await fetch(
    `/store/carts/${encodeURIComponent(cartId)}?fields=${encodeURIComponent(CART_FIELDS)}`,
    {
      ...init,
      headers: {
        Accept: "application/json",
        "x-publishable-api-key": key,
        ...(init?.headers ?? {}),
      },
    }
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { status: res.status, body }
  return body as StoreCartResponse
}
