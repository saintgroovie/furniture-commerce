"use client"

import { useEffect } from "react"

/**
 * Scroll-reveal for `[data-reveal]` sections. Content is visible by default;
 * this effect hides only the sections still below the fold when first seen
 * (`will-reveal`), then plays them in on intersection (`is-revealed`). No JS,
 * late hydration, or reduced motion ⇒ everything simply stays visible.
 *
 * A MutationObserver picks up sections that stream in after the homepage
 * shell (Suspense around the catalog showcase).
 */
export function HomeRevealObserver() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduce || !("IntersectionObserver" in window)) return

    const foldLine = window.innerHeight * 0.9
    const seen = new WeakSet<HTMLElement>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed")
            io.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" }
    )

    const scan = () => {
      const els = document.querySelectorAll<HTMLElement>(
        ".hp [data-reveal], .ed [data-reveal]"
      )
      for (const el of els) {
        if (seen.has(el)) continue
        seen.add(el)
        if (el.getBoundingClientRect().top > foldLine) {
          el.classList.add("will-reveal")
          io.observe(el)
        }
      }
    }

    scan()
    const roots = Array.from(document.querySelectorAll(".hp, .ed"))
    const mo =
      typeof MutationObserver !== "undefined" && roots.length > 0
        ? new MutationObserver(scan)
        : null
    roots.forEach((root) => {
      mo?.observe(root, { childList: true, subtree: true })
    })
    return () => {
      io.disconnect()
      mo?.disconnect()
    }
  }, [])

  return null
}
