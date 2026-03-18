"use client"

import Link from "next/link"
import { useState } from "react"
import { ensureCart } from "@/lib/cart/session"
import { addLineItem } from "@/lib/api/cart"

type Props = { product: Record<string, unknown> }

export function ProductCta({ product }: Props) {
  const [adding, setAdding] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const productType = (product.product_classification as Record<string, string> | undefined)?.product_type
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
      const cartId = await ensureCart()
      await addLineItem(cartId, { variant_id: variantId, quantity: 1 })
      setSuccess(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка")
    } finally {
      setAdding(false)
    }
  }

  if (productType === "BESPOKE") {
    return (
      <div className="cta-group">
        <Link href={productId ? `/bespoke/request?product_id=${productId}` : "/bespoke/request"} className="btn btn-primary">
          Получить расчёт
        </Link>
      </div>
    )
  }

  if (productType === "CONFIGURABLE") {
    return (
      <div>
        <div className="cta-group">
          {variantId ? (
            <button type="button" onClick={handleAddToCart} disabled={adding} className="btn btn-primary">
              {adding ? "Добавление…" : "Добавить в корзину"}
            </button>
          ) : (
            <span className="info-text">Нет варианта для заказа.</span>
          )}
          <Link href={productId ? `/bespoke/request?product_id=${productId}` : "/bespoke/request"} className="btn btn-secondary">
            Сделать по моим размерам
          </Link>
        </div>
        {success && (
          <div className="feedback">
            <span className="feedback-success">Добавлено</span>
            <Link href="/cart">В корзину →</Link>
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

  return (
    <div>
      <div className="cta-group">
        {variantId ? (
          <button type="button" onClick={handleAddToCart} disabled={adding} className="btn btn-primary">
            {adding ? "Добавление…" : "Добавить в корзину"}
          </button>
        ) : (
          <span className="info-text">Нет варианта для заказа.</span>
        )}
      </div>
      {success && (
        <div className="feedback">
          <span className="feedback-success">Добавлено</span>
          <Link href="/cart">В корзину →</Link>
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
