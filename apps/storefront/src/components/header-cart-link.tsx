"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { getCart } from "@/lib/api/cart"
import {
  CART_UPDATED_EVENT,
  type CartUpdatedDetail,
} from "@/lib/cart/cart-events"
import { getCartIdFromSession } from "@/lib/cart/session"
import { nav as navCopy } from "@/lib/woodright-copy"

/**
 * «Корзина» in the header with a live item counter and the fly-to-cart
 * animation target. Listens for CART_UPDATED_EVENT from anywhere on the
 * page (PDP CTA, room sets, cart page removals): when the event carries a
 * launch point, a small dot arcs from there into the counter, and only on
 * arrival does the number change — with a soft pop. Counter state lives
 * here alone; on mount it hydrates itself from the cart API.
 */
export function HeaderCartLink() {
  const [count, setCount] = useState(0)
  /* Changing the key remounts the badge span, restarting its pop animation
     even when two adds land back-to-back. 0 = initial hydration, no pop. */
  const [bumpKey, setBumpKey] = useState(0)
  const linkRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    const cartId = getCartIdFromSession()
    if (!cartId) return
    let cancelled = false
    getCart(cartId)
      .then((data: { cart?: { items?: Array<{ quantity?: number }> } }) => {
        if (cancelled) return
        const items = data.cart?.items
        if (!Array.isArray(items)) return
        setCount(items.reduce((sum, it) => sum + (Number(it?.quantity) || 0), 0))
      })
      .catch(() => {
        /* No cart / backend hiccup — keep the quiet default (no badge). */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<CartUpdatedDetail>).detail ?? {}
      const apply = () => {
        setCount((prev) =>
          typeof detail.count === "number"
            ? detail.count
            : Math.max(0, prev + (detail.delta ?? 0))
        )
        setBumpKey((k) => k + 1)
      }

      const target = linkRef.current
      const reduceMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      /* offsetParent === null → the desktop header link is hidden (mobile
         layout); nowhere visible to fly to, so just update the number. */
      if (!detail.from || !target || !target.offsetParent || reduceMotion) {
        apply()
        return
      }

      const rect = target.getBoundingClientRect()
      const dx = rect.left + rect.width / 2 - detail.from.x
      const dy = rect.top + rect.height / 2 - detail.from.y

      const dot = document.createElement("span")
      dot.className = "cart-fly-dot"
      dot.style.left = `${detail.from.x}px`
      dot.style.top = `${detail.from.y}px`
      document.body.appendChild(dot)

      /* Arc: the mid keyframe lifts the dot above the straight line to the
         target, so it flies in a gentle curve instead of a laser line. */
      const animation = dot.animate(
        [
          { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
          {
            transform: `translate(calc(-50% + ${dx * 0.55}px), calc(-50% + ${dy * 0.55 - 48}px) ) scale(0.8)`,
            opacity: 0.95,
            offset: 0.55,
          },
          {
            transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.3)`,
            opacity: 0.25,
          },
        ],
        { duration: 800, easing: "cubic-bezier(0.3, 0.05, 0.25, 1)" }
      )
      animation.onfinish = () => {
        dot.remove()
        apply()
      }
    }
    window.addEventListener(CART_UPDATED_EVENT, onUpdate)
    return () => window.removeEventListener(CART_UPDATED_EVENT, onUpdate)
  }, [])

  return (
    <Link
      href="/cart"
      className="header-cart-link"
      aria-label={count > 0 ? `Корзина, товаров: ${count}` : "Корзина"}
      ref={linkRef}
    >
      {navCopy.cart}
      <span
        key={bumpKey}
        className={`header-cart-count${count > 0 ? " is-visible" : ""}${bumpKey > 0 ? " is-bumped" : ""}`}
        aria-hidden="true"
      >
        {count}
      </span>
    </Link>
  )
}
