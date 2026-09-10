"use client"

import { useEffect } from "react"

/**
 * Very light parallax for the hero photo: the image drifts ~12% of scroll
 * while the first screen leaves the viewport. Off for reduced motion and
 * touch-first viewports; both are re-evaluated live, so toggling the system
 * setting mid-session detaches the scroll handler and clears the transform.
 */
export function WpHeroParallax() {
  useEffect(() => {
    const img = document.querySelector<HTMLElement>(".wp-hero-img[data-wp-parallax]")
    if (!img) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)")
    const wide = window.matchMedia("(min-width: 768px)")

    let raf = 0
    let attached = false

    const update = () => {
      raf = 0
      const y = window.scrollY
      const limit = img.parentElement?.offsetHeight ?? 800
      if (y > limit) return
      img.style.transform = `translate3d(0, ${Math.round(y * 0.12)}px, 0) scale(1.06)`
    }
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(update)
    }
    const detach = () => {
      if (!attached) return
      attached = false
      window.removeEventListener("scroll", onScroll)
      if (raf) window.cancelAnimationFrame(raf)
      raf = 0
      img.style.transform = ""
    }
    const attach = () => {
      if (attached) return
      attached = true
      update()
      window.addEventListener("scroll", onScroll, { passive: true })
    }
    const sync = () => {
      if (reduce.matches || !wide.matches) detach()
      else attach()
    }

    sync()
    reduce.addEventListener("change", sync)
    wide.addEventListener("change", sync)
    return () => {
      reduce.removeEventListener("change", sync)
      wide.removeEventListener("change", sync)
      detach()
    }
  }, [])

  return null
}
