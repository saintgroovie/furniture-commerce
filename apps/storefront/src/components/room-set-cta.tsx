"use client"

import Link from "next/link"
import { useState } from "react"
import { ensureCart } from "@/lib/cart/session"
import { createCart, addLineItem } from "@/lib/api/cart"

type Props = { roomSet: Record<string, unknown> }

export function RoomSetCta({ roomSet }: Props) {
  const [adding, setAdding] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const id = roomSet.id as string | undefined
  const items = (roomSet.items as Array<Record<string, unknown>>) ?? []
  const bespokeCount = items.filter((item) => {
    const product = item.product as Record<string, unknown> | undefined
    return (product?.productType as Record<string, string> | undefined)?.product_type === "BESPOKE"
  }).length

  function getCartEligibleItems(): Array<{ variantId: string; quantity: number }> {
    const eligible: Array<{ variantId: string; quantity: number }> = []
    for (const item of items) {
      const product = item.product as Record<string, unknown> | undefined
      if (!product) continue
      const productType = (product.productType as Record<string, string> | undefined)?.product_type
      if (productType === "BESPOKE") continue
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

  async function handleBuySet() {
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
      const cartId = await ensureCart(createCart)
      for (const { variantId, quantity } of eligible) {
        await addLineItem(cartId, { variant_id: variantId, quantity })
      }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2000)
    } catch (e) {
      setError("Не все товары удалось добавить. Проверьте корзину и повторите попытку.")
    } finally {
      setAdding(false)
    }
  }

  return (
    <p>
      <button type="button" onClick={handleBuySet} disabled={adding}>
        {adding ? "Добавление…" : "Купить комплект"}
      </button>
      <Link href={id ? `/bespoke?room_set_id=${id}` : "/bespoke"} style={{ marginLeft: "0.5rem" }}>
        Адаптировать под мою комнату
      </Link>
      {bespokeCount > 0 && (
        <span style={{ display: "block", marginTop: "0.5rem", fontSize: "0.9rem" }}>
          Часть товаров доступна только по запросу.
        </span>
      )}
      {success && <span style={{ color: "green", marginLeft: "0.5rem" }}>Добавлено в корзину</span>}
      {error && <span style={{ color: "red", marginLeft: "0.5rem" }}>{error}</span>}
    </p>
  )
}
