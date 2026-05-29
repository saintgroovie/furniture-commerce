"use client"

import { createCart } from "@/lib/api/cart"

const CART_COOKIE = "cart_id"

export function getCartIdFromSession(): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${CART_COOKIE}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export function setCartIdToSession(cartId: string): void {
  document.cookie = `${CART_COOKIE}=${encodeURIComponent(cartId)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`
}

export function clearCartIdFromSession(): void {
  document.cookie = `${CART_COOKIE}=; path=/; max-age=0`
}

export async function ensureCart(): Promise<string> {
  const existing = getCartIdFromSession()
  if (existing) return existing

  const data = await createCart()
  const id = data?.cart?.id
  if (!id) throw new Error("Failed to create cart")
  setCartIdToSession(id)
  return id
}
