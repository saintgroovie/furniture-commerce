/**
 * One passive scroll listener for presentation stages.
 * Writes --p (0–1) on each [data-pin] while it crosses the viewport.
 * No listener when the operator prefers reduced motion.
 */
export function bindPinProgress(root: ParentNode = document): () => void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  if (reduce) return () => {}

  const nodes = () => Array.from(root.querySelectorAll<HTMLElement>("[data-pin]"))
  let frame = 0

  const measure = () => {
    frame = 0
    const vh = window.innerHeight
    for (const node of nodes()) {
      const rect = node.getBoundingClientRect()
      if (rect.bottom < -40 || rect.top > vh + 40) continue
      const travel = node.offsetHeight - vh
      const next = travel <= 0 ? 0 : Math.min(1, Math.max(0, -rect.top / travel))
      node.style.setProperty("--p", next.toFixed(4))
    }
  }

  const onScroll = () => {
    if (frame) return
    frame = window.requestAnimationFrame(measure)
  }

  measure()
  window.addEventListener("scroll", onScroll, { passive: true })
  window.addEventListener("resize", onScroll, { passive: true })
  return () => {
    window.removeEventListener("scroll", onScroll)
    window.removeEventListener("resize", onScroll)
    if (frame) window.cancelAnimationFrame(frame)
  }
}
