"use client"

import Link from "next/link"
import { useState } from "react"
import { ensureCart } from "@/lib/cart/session"
import { addLineItem } from "@/lib/api/cart"
import { userFacingError } from "@/lib/user-facing-error"
import {
  isRequestQuoteProduct,
  REQUEST_QUOTE_MANAGER_NOTE,
} from "@/lib/request-quote"

type Props = { product: Record<string, unknown> }

function getProductType(product: Record<string, unknown>): string | undefined {
  return (
    (product.product_classification as { product_type?: string } | undefined)?.product_type ??
    (product.custom_product_type as { product_type?: string } | undefined)?.product_type
  )
}

export function ProductCta({ product }: Props) {
  const [adding, setAdding] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const productType = getProductType(product)
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
      setError(userFacingError(e, "Не удалось добавить в корзину."))
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

  if (isRequestQuoteProduct(product)) {
    return (
      <div>
        <div className="cta-group">
          <Link
            href={productId ? `/bespoke/request?product_id=${productId}` : "/bespoke/request"}
            className="btn btn-primary"
          >
            Оставить заявку
          </Link>
        </div>
        <p className="info-text" style={{ marginTop: "0.75rem" }}>
          {REQUEST_QUOTE_MANAGER_NOTE}
        </p>
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
