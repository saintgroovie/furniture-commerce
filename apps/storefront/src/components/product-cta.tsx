"use client"

import Link from "next/link"
import { useState } from "react"
import { ensureCart } from "@/lib/cart/session"
import { createCart, addLineItem } from "@/lib/api/cart"

type Props = { product: Record<string, unknown> }

export function ProductCta({ product }: Props) {
  const [adding, setAdding] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const productType = (product.productType as Record<string, string> | undefined)?.product_type
  const variants = (product.variants as unknown[]) ?? []
  const firstVariant = Array.isArray(variants) ? variants[0] : undefined
  const variantId = firstVariant && typeof firstVariant === "object" && "id" in firstVariant
    ? (firstVariant as { id: string }).id
    : undefined
  const productId = product.id as string | undefined

  async function handleAddToCart() {
    if (!variantId) return
    setError(null)
    setSuccess(false)
    setAdding(true)
    try {
      const cartId = await ensureCart(createCart)
      await addLineItem(cartId, { variant_id: variantId, quantity: 1 })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка")
    } finally {
      setAdding(false)
    }
  }

  if (productType === "BESPOKE") {
    return (
      <p>
        <Link href={productId ? `/bespoke?product_id=${productId}` : "/bespoke"} style={{ marginRight: "0.5rem" }}>
          Получить расчёт
        </Link>
      </p>
    )
  }

  if (productType === "CONFIGURABLE") {
    return (
      <p>
        {variantId ? (
          <button type="button" onClick={handleAddToCart} disabled={adding}>
            {adding ? "Добавление…" : "Добавить в корзину"}
          </button>
        ) : (
          <span style={{ fontSize: "0.9rem" }}>Нет варианта для заказа.</span>
        )}
        <Link href={productId ? `/bespoke?product_id=${productId}` : "/bespoke"} style={{ marginLeft: "0.5rem" }}>
          Сделать по моим размерам
        </Link>
        {success && (
          <>
            <span style={{ color: "green", marginLeft: "0.5rem" }}>Добавлено</span>
            <Link href="/cart" style={{ marginLeft: "0.5rem" }}>В корзину</Link>
          </>
        )}
        {error && <span style={{ color: "red", marginLeft: "0.5rem" }}>{error}</span>}
      </p>
    )
  }

  return (
    <p>
      {variantId ? (
        <button type="button" onClick={handleAddToCart} disabled={adding}>
          {adding ? "Добавление…" : "Добавить в корзину"}
        </button>
      ) : (
        <span style={{ fontSize: "0.9rem" }}>Нет варианта для заказа.</span>
      )}
      {success && (
        <>
          <span style={{ color: "green", marginLeft: "0.5rem" }}>Добавлено</span>
          <Link href="/cart" style={{ marginLeft: "0.5rem" }}>В корзину</Link>
        </>
      )}
      {error && <span style={{ color: "red", marginLeft: "0.5rem" }}>{error}</span>}
    </p>
  )
}
