"use client"

import Link from "next/link"
import type { MouseEvent } from "react"
import { useState } from "react"
import { ensureCart } from "@/lib/cart/session"
import { countCartItems, emitCartUpdated } from "@/lib/cart/cart-events"
import {
  readPdpExecutionSelection,
  usePdpPurchaseGate,
  gateMatchesProduct,
} from "@/lib/cart/pdp-selection"
import {
  materialCodeForProduct,
  readPdpMaterialSelection,
  usePdpMaterialSelection,
} from "@/lib/cart/pdp-material-selection"
import type { MaterialTierOption } from "@/lib/material-tiers"
import { addLineItem } from "@/lib/api/cart"
import { userFacingError } from "@/lib/user-facing-error"
import { isRequestQuoteProduct } from "@/lib/request-quote"
import { isKidsMetadataStorefrontProduct } from "@/lib/kids"
import { isOliverKidsCollectionProduct } from "@/lib/catalog-scope"
import { actions, pdpCopy, productCta as copy } from "@/lib/woodright-copy"
import { flatCopy } from "@/lib/format-ru-copy"

type Props = {
  product: Record<string, unknown>
  /** Server-known: product has buyer execution controls that must be confirmed. */
  requiresBuyerSelection?: boolean
  /** Ordered material tier options (position 0 = default) from metadata. */
  materialTiers?: MaterialTierOption[] | null
}

function getProductType(product: Record<string, unknown>): string | undefined {
  return (
    (product.product_classification as { product_type?: string } | undefined)?.product_type ??
    (product.custom_product_type as { product_type?: string } | undefined)?.product_type
  )
}

function productKeyOf(product: Record<string, unknown>): string {
  const handle = typeof product.handle === "string" ? product.handle.trim() : ""
  if (handle) return handle
  return typeof product.id === "string" ? product.id : ""
}

export function ProductCta({
  product,
  requiresBuyerSelection = false,
  materialTiers = null,
}: Props) {
  const [adding, setAdding] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const gate = usePdpPurchaseGate()
  const materialSelection = usePdpMaterialSelection()
  const productKey = productKeyOf(product)
  const gateOk = gateMatchesProduct(gate, productKey)

  /* Selected material execution. When the buyer has not changed the dropdown
     yet, use the first tier (LDSP) — the same default the select publishes. */
  function selectedMaterialTier(live = false): MaterialTierOption | null {
    if (!materialTiers || materialTiers.length === 0) return null
    const selection = live ? readPdpMaterialSelection() : materialSelection
    const code = materialCodeForProduct(selection, productKey)
    return materialTiers.find((t) => t.code === code) ?? materialTiers[0]
  }

  /* Selected execution rides into the bespoke/request-quote form. */
  function bespokeRequestHref(productId: string | undefined): string {
    const params = new URLSearchParams()
    if (productId) params.set("product_id", productId)
    const tier = selectedMaterialTier()
    if (tier) params.set("material", tier.label)
    const qs = params.toString()
    return qs ? `/bespoke/request?${qs}` : "/bespoke/request"
  }

  const productType = getProductType(product)
  const variants = (product.variants as unknown[]) ?? []
  const firstVariant = Array.isArray(variants) ? variants[0] : undefined
  const variantId =
    firstVariant && typeof firstVariant === "object" && "id" in firstVariant
      ? (firstVariant as { id: string }).id
      : undefined
  const productId = product.id as string | undefined

  /* Defaults publish after mount; until then allow CTA. Add-to-cart always
     sends material_execution_code when tiers exist (first tier if unset) and
     omits finish_execution_key when no finish was chosen (server color ×1). */
  const selectionBlocked =
    gateOk &&
    gate.requiresSelection &&
    (!gate.complete || !gate.combinationAvailable)
  const canAdd = Boolean(variantId) && !selectionBlocked && !adding

  async function handleAddToCart(e: MouseEvent<HTMLButtonElement>) {
    if (!variantId) return
    if (requiresBuyerSelection) {
      const live = readPdpExecutionSelection()?.gate
      if (
        live &&
        gateMatchesProduct(live, productKey) &&
        live.requiresSelection &&
        (!live.complete || !live.combinationAvailable)
      ) {
        return
      }
    }
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
      const selectionRaw = readPdpExecutionSelection()
      const selection =
        selectionRaw &&
        gateMatchesProduct(selectionRaw.gate, productKey)
          ? selectionRaw
          : null
      const isKids =
        isKidsMetadataStorefrontProduct(product) ||
        isOliverKidsCollectionProduct(product)
      /* Материальное исполнение: на сервер уходит только код — label, multiplier
         и итоговую цену backend пересчитывает сам из product metadata. */
      const materialTier = selectedMaterialTier(true)
      const specs = [
        ...(materialTier
          ? [{ label: pdpCopy.materialTierLabel, value: materialTier.label }]
          : []),
        ...(selection?.specs ?? []),
      ]
      const finishKey =
        selection?.finishKey?.trim() ||
        selection?.gate.finishKey?.trim() ||
        null
      const metadata: Record<string, unknown> = {
        ...(selection?.imageSrc ? { execution_image: selection.imageSrc } : {}),
        ...(specs.length > 0 ? { execution_specs: specs } : {}),
        ...(materialTier ? { material_execution_code: materialTier.code } : {}),
        ...(finishKey ? { finish_execution_key: finishKey } : {}),
        ...(isKids ? { storefront_section: "kids" } : {}),
      }
      const data = await addLineItem(cartId, {
        variant_id: variantId,
        quantity: 1,
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      })
      setSuccess(true)
      emitCartUpdated({
        count: countCartItems((data as { cart?: unknown }).cart),
        delta: 1,
        from: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      })
    } catch (e) {
      setError(userFacingError(e, flatCopy(copy.addToCartFailed)))
    } finally {
      setAdding(false)
    }
  }

  if (productType === "BESPOKE") {
    return (
      <div className="cta-group">
        <Link href={bespokeRequestHref(productId)} className="btn btn-primary">
          {copy.bespokeCtaLabel}
        </Link>
      </div>
    )
  }

  if (isRequestQuoteProduct(product)) {
    return (
      <div>
        <div className="cta-group">
          <Link href={bespokeRequestHref(productId)} className="btn btn-primary">
            {copy.requestQuoteCtaLabel}
          </Link>
        </div>
        <p className="info-text" style={{ marginTop: "0.75rem" }}>
          {copy.requestQuoteManagerNote}
        </p>
      </div>
    )
  }

  const primaryLabel = adding
    ? copy.addingInProgress
    : selectionBlocked
      ? actions.chooseParameters
      : !variantId
        ? copy.noVariant
        : actions.addToCart

  const primaryButton = variantId ? (
    <button
      type="button"
      onClick={handleAddToCart}
      disabled={!canAdd}
      className="btn btn-primary"
      aria-disabled={!canAdd}
    >
      {primaryLabel}
    </button>
  ) : (
    <span className="info-text">{copy.noVariant}</span>
  )

  if (productType === "CONFIGURABLE") {
    return (
      <div>
        <div className="cta-group">
          {primaryButton}
          <Link href={bespokeRequestHref(productId)} className="btn btn-secondary">
            {copy.configureBespoke}
          </Link>
        </div>
        {success && (
          <div className="feedback">
            <span className="feedback-success">{copy.addedTitle}</span>
            <Link href="/cart">
              {actions.toCart} →
            </Link>
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
      <div className="cta-group">{primaryButton}</div>
      {success && (
        <div className="feedback">
          <span className="feedback-success">{copy.addedTitle}</span>
          <Link href="/cart">
            {actions.toCart} →
          </Link>
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
