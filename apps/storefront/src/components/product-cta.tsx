"use client"

import Link from "next/link"
import type { MouseEvent } from "react"
import { useState } from "react"
import { ensureCart } from "@/lib/cart/session"
import { countCartItems, emitCartUpdated } from "@/lib/cart/cart-events"
import { readPdpExecutionSelection } from "@/lib/cart/pdp-selection"
import { addLineItem } from "@/lib/api/cart"
import { userFacingError } from "@/lib/user-facing-error"
import { isRequestQuoteProduct } from "@/lib/request-quote"
import { actions, productCta as copy } from "@/lib/woodright-copy"

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

  async function handleAddToCart(e: MouseEvent<HTMLButtonElement>) {
    if (!variantId) return
    /* Captured before the awaits: the flight dot launches from the CTA's
       center, and currentTarget is only valid synchronously. */
    const rect = e.currentTarget.getBoundingClientRect()
    setError(null)
    setSuccess(false)
    setAdding(true)
    try {
      const cartId = await ensureCart()
      /* Выбранное на PDP исполнение (цвет/отделка) — не Medusa-вариант, поэтому
         едет в line item metadata: корзина рендерит из него миниатюру и спеку. */
      const selection = readPdpExecutionSelection()
      const metadata =
        selection && (selection.imageSrc || selection.specs.length > 0)
          ? {
              ...(selection.imageSrc ? { execution_image: selection.imageSrc } : {}),
              ...(selection.specs.length > 0 ? { execution_specs: selection.specs } : {}),
            }
          : undefined
      const data = await addLineItem(cartId, {
        variant_id: variantId,
        quantity: 1,
        ...(metadata ? { metadata } : {}),
      })
      setSuccess(true)
      emitCartUpdated({
        count: countCartItems((data as { cart?: unknown }).cart),
        delta: 1,
        from: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      })
    } catch (e) {
      setError(userFacingError(e, copy.addToCartFailed))
    } finally {
      setAdding(false)
    }
  }

  if (productType === "BESPOKE") {
    return (
      <div className="cta-group">
        <Link href={productId ? `/bespoke/request?product_id=${productId}` : "/bespoke/request"} className="btn btn-primary">
          {copy.bespokeCtaLabel}
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
            {copy.requestQuoteCtaLabel}
          </Link>
        </div>
        <p className="info-text" style={{ marginTop: "0.75rem" }}>
          {copy.requestQuoteManagerNote}
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
              {adding ? copy.addingInProgress : actions.addToCart}
            </button>
          ) : (
            <span className="info-text">{copy.noVariant}</span>
          )}
          <Link href={productId ? `/bespoke/request?product_id=${productId}` : "/bespoke/request"} className="btn btn-secondary">
            {copy.configureBespoke}
          </Link>
        </div>
        {success && (
          <div className="feedback">
            <span className="feedback-success">{copy.addedTitle}</span>
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

  return (
    <div>
      <div className="cta-group">
        {variantId ? (
          <button type="button" onClick={handleAddToCart} disabled={adding} className="btn btn-primary">
            {adding ? copy.addingInProgress : actions.addToCart}
          </button>
        ) : (
          <span className="info-text">{copy.noVariant}</span>
        )}
      </div>
      {success && (
        <div className="feedback">
          <span className="feedback-success">{copy.addedTitle}</span>
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
