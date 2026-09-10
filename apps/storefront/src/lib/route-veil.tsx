"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { LoadingVisualStack } from "@/components/loading-visual"
import { systemCopy } from "@/lib/woodright-copy"
import { useSiteSectionTransition, type SiteSection } from "@/lib/use-site-section"

/**
 * Route transition veil.
 *
 * Next only shows `loading.tsx` while the RSC payload streams; the moment
 * the destination commits the fallback is gone and the page paints with
 * its images still downloading - the loader is barely seen and the page
 * "pops" in piece by piece. The veil is a fixed cover under the header that
 * mounts with the route fallback and stays up until:
 *   - the route has committed (fallback unmounted),
 *   - the above-the-fold images (+ fonts) of the new page are loaded
 *     (bounded by VEIL_IMAGE_WAIT_CAP_MS),
 *   - and at least VEIL_MIN_VISIBLE_MS have passed since it appeared,
 * then fades out over the finished page.
 *
 * The section recolor (main ↔ kids ↔ bespoke) and pill pop live in the
 * loading visual; the veil only owns timing and the cover.
 */

/** Minimum time the veil is up, counted from the loader mount. */
export const VEIL_MIN_VISIBLE_MS = 1500
/** How long after commit we keep waiting for images before giving up. */
export const VEIL_IMAGE_WAIT_CAP_MS = 3500
/** Fade-out length - must match `route-veil-out` in globals.css. */
export const VEIL_FADE_OUT_MS = 480
/**
 * Loader mounts in the colour of the section being left and flips to the
 * destination once its own fade-in has finished (0.15s delay + 0.35s).
 */
const SECTION_FLIP_MS = 550
const IMAGE_POLL_MS = 120

type Phase = "idle" | "loading" | "settling" | "closing"

type RouteVeilContextValue = {
  start: () => void
  commit: () => void
}

const RouteVeilContext = createContext<RouteVeilContextValue>({
  start: () => {},
  commit: () => {},
})

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

/**
 * Images the reader will see first: eager ones within ~1.6 viewports,
 * lazy ones only when already inside the viewport (a covered lazy image
 * further down will not start loading, so it must not block the veil).
 */
function pendingImages(root: ParentNode): HTMLImageElement[] {
  const vh = window.innerHeight || 800
  const out: HTMLImageElement[] = []
  root.querySelectorAll("img").forEach((img) => {
    if (img.complete) return
    const r = img.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return
    const limit = img.loading === "lazy" ? vh : vh * 1.6
    if (r.top > limit || r.bottom < -vh * 0.5) return
    out.push(img)
  })
  return out
}

/** Consecutive empty polls (~360ms) before we trust that no image is coming. */
const IMAGE_CLEAR_POLLS = 3

/**
 * Resolves when IMAGE_CLEAR_POLLS consecutive polls find no pending image
 * (the extra polls catch images a client component or nested Suspense
 * boundary appends right after commit), or at the deadline. Polling is
 * bounded by the deadline, so no cleanup handle.
 */
function waitForImages(root: ParentNode, deadline: number): Promise<void> {
  return new Promise((resolve) => {
    let clearPolls = 0
    const tick = () => {
      if (Date.now() >= deadline) return resolve()
      if (pendingImages(root).length === 0) {
        clearPolls += 1
        if (clearPolls >= IMAGE_CLEAR_POLLS) return resolve()
      } else {
        clearPolls = 0
      }
      window.setTimeout(tick, IMAGE_POLL_MS)
    }
    tick()
  })
}

function waitForFonts(deadline: number): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return Promise.resolve()
  return Promise.race([
    document.fonts.ready.then(() => undefined),
    new Promise<void>((r) => window.setTimeout(r, Math.max(0, deadline - Date.now()))),
  ])
}

function readChromeSection(): SiteSection {
  const s = document.querySelector(".site-header")?.getAttribute("data-section")
  return s === "kids" || s === "bespoke" ? s : "main"
}

export function RouteVeilProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [from, setFrom] = useState<SiteSection>("main")
  const startedAt = useRef(0)
  const run = useRef(0)
  /* Section the chrome shows at the moment of the click - by the time the
     fallback mounts, usePathname() and the header have already flipped to
     the destination, so "from" must be captured here. Null = no click or
     popstate since the last run (hard load, router.push): read the header. */
  const clickedFrom = useRef<SiteSection | null>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return
      const el = e.target
      if (!(el instanceof Element) || !el.closest("a[href]")) return
      clickedFrom.current = readChromeSection()
    }
    const onPop = () => {
      clickedFrom.current = readChromeSection()
    }
    document.addEventListener("click", onClick, true)
    window.addEventListener("popstate", onPop)
    return () => {
      document.removeEventListener("click", onClick, true)
      window.removeEventListener("popstate", onPop)
    }
  }, [])

  const start = useCallback(() => {
    run.current += 1
    setPhase((prev) => {
      if (prev === "loading") return prev
      startedAt.current = Date.now()
      return "loading"
    })
    setFrom(clickedFrom.current ?? readChromeSection())
    clickedFrom.current = null
  }, [])

  const commit = useCallback(() => {
    const myRun = run.current
    setPhase((prev) => (prev === "loading" ? "settling" : prev))
    const now = Date.now()
    const deadline = now + VEIL_IMAGE_WAIT_CAP_MS
    const minEnd = startedAt.current + VEIL_MIN_VISIBLE_MS
    const root = document.getElementById("main-content") ?? document.body
    /* Let the committed page paint one frame before we look for its images. */
    const frame = new Promise<void>((r) => window.requestAnimationFrame(() => r()))
    frame
      .then(() => Promise.all([waitForImages(root, deadline), waitForFonts(deadline)]))
      .then(
        () =>
          new Promise<void>((r) => window.setTimeout(r, Math.max(0, minEnd - Date.now())))
      )
      .then(() => {
        if (run.current !== myRun) return
        setPhase((prev) => (prev === "settling" ? "closing" : prev))
        window.setTimeout(() => {
          if (run.current !== myRun) return
          setPhase((prev) => (prev === "closing" ? "idle" : prev))
        }, prefersReducedMotion() ? 0 : VEIL_FADE_OUT_MS)
      })
  }, [])

  const value = useMemo(() => ({ start, commit }), [start, commit])

  return (
    <RouteVeilContext.Provider value={value}>
      {children}
      <RouteVeil phase={phase} from={from} />
    </RouteVeilContext.Provider>
  )
}

/**
 * Route `loading.tsx` hook: the fallback mounting means the navigation is
 * slow enough to show the loader; its unmount means the route committed.
 */
export function useRouteVeilLoading(): void {
  const { start, commit } = useContext(RouteVeilContext)
  useEffect(() => {
    start()
    return () => commit()
  }, [start, commit])
}

function RouteVeil({ phase, from }: { phase: Phase; from: SiteSection }) {
  const { target } = useSiteSectionTransition()
  const [section, setSection] = useState<SiteSection>(from)
  const [top, setTop] = useState(0)
  const visible = phase !== "idle"

  /* Mount in the colour of the section being left, flip to the destination
     after the fade-in. Same-section navigations mount settled. */
  const [seenPhase, setSeenPhase] = useState<Phase>("idle")
  if (phase !== seenPhase) {
    setSeenPhase(phase)
    if (phase === "loading" && seenPhase !== "loading") setSection(from)
  }
  useEffect(() => {
    if (!visible || section === target) return
    const timer = window.setTimeout(() => setSection(target), SECTION_FLIP_MS)
    return () => window.clearTimeout(timer)
  }, [visible, section, target])

  /* Cover starts under the sticky header (54+46 desktop, logo+burger rows
     on phones), whatever its current height. Layout effect: no first frame
     with the veil over the header. */
  useLayoutEffect(() => {
    if (!visible) return
    const header = document.querySelector<HTMLElement>(".site-header")
    if (!header) return
    const apply = () => setTop(Math.round(header.getBoundingClientRect().bottom))
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(header)
    return () => ro.disconnect()
  }, [visible])

  if (!visible) return null

  return (
    <div
      className={`route-veil route-veil-${phase}`}
      data-section={section}
      style={{ top }}
      aria-hidden="true"
    >
      <div className="route-veil-body">
        <LoadingVisualStack />
        <p className="system-state-loading-text">{systemCopy.loading.label}</p>
      </div>
    </div>
  )
}
