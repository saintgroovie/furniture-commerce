"use client"

import { useEffect } from "react"

/**
 * Scroll-reveal for `[data-reveal]` sections. Content is visible by default;
 * this effect hides only the sections still below the fold at hydration time
 * (`will-reveal`), then plays them in on intersection (`is-revealed`). No JS,
 * late hydration, or reduced motion ⇒ everything simply stays visible.
 */
export function HomeRevealObserver() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".hp [data-reveal]"))
    if (els.length === 0) return

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduce || !("IntersectionObserver" in window)) return

    const foldLine = window.innerHeight * 0.9
    const pending: HTMLElement[] = []
    for (const el of els) {
      if (el.getBoundingClientRect().top > foldLine) {
        el.classList.add("will-reveal")
        pending.push(el)
      }
    }
    if (pending.length === 0) return

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
    pending.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return null
}
