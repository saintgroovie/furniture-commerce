"use client"

import Link from "next/link"
import type { MouseEvent } from "react"
import { useState } from "react"
import { ensureCart } from "@/lib/cart/session"
import { countCartItems, emitCartUpdated } from "@/lib/cart/cart-events"
import { addLineItem } from "@/lib/api/cart"
import { userFacingError } from "@/lib/user-facing-error"
import { actions } from "@/lib/woodright-copy"

type Props = { roomSet: Record<string, unknown> }

function getProductType(product: Record<string, unknown>): string | undefined {
  return (
    (product.product_classification as { product_type?: string } | undefined)?.product_type ??
    (product.productType as { product_type?: string } | undefined)?.product_type ??
    (product.custom_product_type as { product_type?: string } | undefined)?.product_type
  )
}

export function RoomSetCta({ roomSet }: Props) {
  const [adding, setAdding] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const id = roomSet.id as string | undefined
  const items = (roomSet.items as Array<Record<string, unknown>>) ?? []
  const bespokeCount = items.filter((item) => {
    const product = item.product as Record<string, unknown> | undefined
    return product != null && getProductType(product) === "BESPOKE"
  }).length

  function getCartEligibleItems(): Array<{ variantId: string; quantity: number }> {
    const eligible: Array<{ variantId: string; quantity: number }> = []
    for (const item of items) {
      const product = item.product as Record<string, unknown> | undefined
      if (!product) continue
      if (getProductType(product) === "BESPOKE") continue
      const variants = (product.variants as unknown[]) ?? []
      const firstVariant = Array.isArray(variants) ? variants[0] : undefined
      const variantId = firstVariant && typeof firstVariant === "object" && "id" in firstVariant
        ? (firstVariant as { id: string }).id
        : undefined
      if (!variantId) continue
      eligible.push({ variantId, quantity: Number((item as { quantity?: number }).quantity ?? 1) })
    }
    return eligible
  }

  async function handleBuySet(e: MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    setError(null)
    setSuccess(false)
    setAdding(true)
    const eligible = getCartEligibleItems()
    if (eligible.length === 0) {
      setAdding(false)
      setError(items.length === 0
        ? "В комплекте пока нет товаров."
        : "Все товары комплекта доступны только по запросу.")
      return
    }
    try {
      const cartId = await ensureCart()
      let lastResponse: unknown
      for (const { variantId, quantity } of eligible) {
        lastResponse = await addLineItem(cartId, { variant_id: variantId, quantity })
      }
      setSuccess(true)
      emitCartUpdated({
        count: countCartItems((lastResponse as { cart?: unknown } | undefined)?.cart),
        delta: eligible.reduce((sum, item) => sum + item.quantity, 0),
        from: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      })
    } catch (e) {
      setError(userFacingError(e, "Не все товары удалось добавить. Проверьте корзину и повторите попытку."))
    } finally {
      setAdding(false)
    }
  }

  return (
    <div>
      <div className="cta-group">
        <button type="button" onClick={handleBuySet} disabled={adding} className="btn btn-primary">
          {adding ? "Добавление…" : "Купить комплект"}
        </button>
        <Link href={id ? `/bespoke/request?room_set_id=${encodeURIComponent(id)}` : "/bespoke"} className="btn btn-secondary">
          Адаптировать под мою комнату
        </Link>
      </div>
      {bespokeCount > 0 && (
        <p className="note">Часть товаров доступна только по запросу.</p>
      )}
      {success && (
        <div className="feedback">
          <span className="feedback-success">Добавлено в корзину</span>
          <Link href="/cart">{actions.toCart} →</Link>
        </div>
      )}
      {error && (
        <div className="feedback">
          <span className="feedback-error">{error}</span>
        </div>
      )}
    </div>
  )
}
