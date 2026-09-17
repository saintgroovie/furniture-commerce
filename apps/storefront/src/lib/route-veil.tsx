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
 * Hard load: the cover is in the SSR HTML (`phase=loading`) so the first
 * paint is the loader, not a half-assembled page. Client navigations still
 * start from `loading.tsx`. The veil stays until:
 *   - the route has committed (fallback unmounted, nested Suspense settled),
 *   - marked first-screen images (`img[data-veil-atf]`) are decoded
 *     (bounded by VEIL_IMAGE_WAIT_CAP_MS),
 *   - and at least VEIL_MIN_VISIBLE_MS have passed since it appeared,
 * then fades out over the finished first screen.
 *
 * The section recolor (main ↔ kids ↔ bespoke) and pill pop live in the
 * loading visual; the veil only owns timing and the cover.
 */

/** Minimum time the veil is up, counted from the loader mount. */
export const VEIL_MIN_VISIBLE_MS = 500
/** How long after commit we keep waiting for first-screen images. */
export const VEIL_IMAGE_WAIT_CAP_MS = 8000
/** Fade-out length - must match `route-veil-out` in globals.css. */
export const VEIL_FADE_OUT_MS = 480
/**
 * Loader mounts in the colour of the section being left and flips to the
 * destination once its own fade-in has finished (0.15s delay + 0.35s).
 */
const SECTION_FLIP_MS = 550
const IMAGE_POLL_MS = 120
/** Wait for layout / nested Suspense before treating "no imgs" as ready. */
const LAYOUT_GRACE_MS = 800

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

function pageStillStreaming(root: ParentNode): boolean {
  return Boolean(root.querySelector("[data-home-showcase-pending]"))
}

/**
 * Images the reader will see first: eager ones within ~1.6 viewports,
 * lazy ones only when already inside the viewport (a covered lazy image
 * further down will not start loading, so it must not block the veil).
 * Eager images with no layout yet still count - skipping them made the
 * veil lift over an empty catalog grid.
 */
function pendingImages(root: ParentNode): HTMLImageElement[] {
  const vh = window.innerHeight || 800
  const out: HTMLImageElement[] = []
  root.querySelectorAll("img").forEach((img) => {
    if (img.complete) return
    const src = img.currentSrc || img.getAttribute("src")
    if (!src) return
    const r = img.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) {
      if (img.loading === "lazy") return
      out.push(img)
      return
    }
    const limit = img.loading === "lazy" ? vh : vh * 1.6
    if (r.top > limit || r.bottom < -vh * 0.5) return
    out.push(img)
  })
  return out
}

function firstScreenImages(root: ParentNode): HTMLImageElement[] {
  const marked = Array.from(
    root.querySelectorAll<HTMLImageElement>("img[data-veil-atf]")
  )
  return marked.length > 0 ? marked : pendingImages(root)
}

/** Consecutive empty polls (~480ms) before we trust that no image is coming. */
const IMAGE_CLEAR_POLLS = 4

/**
 * Resolves when nested Suspense is gone and IMAGE_CLEAR_POLLS consecutive
 * polls find no pending first-screen image (download + decode), or at the
 * deadline. Failed images (complete, natural size 0) are treated as settled.
 */
function waitForImages(root: ParentNode, deadline: number): Promise<void> {
  return new Promise((resolve) => {
    const decodedSrcs = new Set<string>()
    let clearPolls = 0
    let seenAtf = false
    const started = Date.now()
    const currentSrc = (img: HTMLImageElement) =>
      img.currentSrc || img.getAttribute("src") || ""
    const tick = () => {
      if (Date.now() >= deadline) return resolve()
      if (pageStillStreaming(root)) {
        clearPolls = 0
        window.setTimeout(tick, IMAGE_POLL_MS)
        return
      }
      if (root.querySelector("img[data-veil-atf]")) seenAtf = true
      const candidates = firstScreenImages(root)
      const pending: HTMLImageElement[] = []
      for (const img of candidates) {
        const src = currentSrc(img)
        if (!src) {
          pending.push(img)
          continue
        }
        if (decodedSrcs.has(src)) continue
        if (img.complete && img.naturalWidth === 0 && img.naturalHeight === 0) {
          decodedSrcs.add(src)
          continue
        }
        pending.push(img)
      }
      if (pending.length === 0) {
        const canTrustEmpty = seenAtf || Date.now() - started >= LAYOUT_GRACE_MS
        if (canTrustEmpty) {
          clearPolls += 1
          if (clearPolls >= IMAGE_CLEAR_POLLS) return resolve()
        }
        window.setTimeout(tick, IMAGE_POLL_MS)
        return
      }
      clearPolls = 0
      const cap = Math.max(0, Math.min(IMAGE_POLL_MS, deadline - Date.now()))
      const decodeWait = Promise.all(
        pending.slice(0, 12).map((img) => {
          const src = currentSrc(img)
          if (typeof img.decode !== "function") {
            if (img.complete && src) decodedSrcs.add(src)
            return Promise.resolve()
          }
          return img.decode().then(
            () => {
              if (src && currentSrc(img) === src) decodedSrcs.add(src)
            },
            () => {
              if (
                src &&
                currentSrc(img) === src &&
                img.complete &&
                img.naturalWidth === 0
              ) {
                decodedSrcs.add(src)
              }
            }
          )
        })
      ).then(() => undefined)
      void Promise.race([
        decodeWait,
        new Promise<void>((r) => window.setTimeout(r, cap)),
      ]).then(() => {
        if (Date.now() >= deadline) return resolve()
        window.setTimeout(tick, IMAGE_POLL_MS)
      })
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
  const [phase, setPhase] = useState<Phase>("loading")
  const [from, setFrom] = useState<SiteSection>("main")
  const [bootCover, setBootCover] = useState(true)
  const phaseRef = useRef<Phase>("loading")
  const startedAt = useRef(0)
  const run = useRef(0)
  /* Section the chrome shows at the moment of the click - by the time the
     fallback mounts, usePathname() and the header have already flipped to
     the destination, so "from" must be captured here. Null = no click or
     popstate since the last run (hard load, router.push): read the header. */
  const clickedFrom = useRef<SiteSection | null>(null)

  useLayoutEffect(() => {
    if (startedAt.current === 0) startedAt.current = Date.now()
  }, [])

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
    if (startedAt.current === 0 || phaseRef.current !== "loading") {
      startedAt.current = Date.now()
    }
    phaseRef.current = "loading"
    setPhase("loading")
    setFrom(clickedFrom.current ?? readChromeSection())
    clickedFrom.current = null
  }, [])

  const commit = useCallback(() => {
    if (phaseRef.current !== "loading") return
    const myRun = run.current
    phaseRef.current = "settling"
    setPhase("settling")
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
        phaseRef.current = "closing"
        setPhase("closing")
        window.setTimeout(() => {
          if (run.current !== myRun) return
          phaseRef.current = "idle"
          setPhase("idle")
          setBootCover(false)
        }, prefersReducedMotion() ? 0 : VEIL_FADE_OUT_MS)
      })
  }, [])

  /* First visit: loading.tsx may never mount (page already in the tree) or
     it may own commit via unmount. Keep polling while the fallback exists;
     if it is replaced before hydrating, we still settle instead of sticking. */
  useEffect(() => {
    let cancelled = false
    let frames = 0
    const tick = () => {
      if (cancelled) return
      if (document.querySelector(".route-loading-fallback")) {
        window.setTimeout(tick, 50)
        return
      }
      frames += 1
      if (frames < 3) {
        window.requestAnimationFrame(tick)
        return
      }
      commit()
    }
    window.requestAnimationFrame(tick)
    const bootRun = run.current
    const stuck = window.setTimeout(() => {
      if (cancelled) return
      if (run.current !== bootRun) return
      if (phaseRef.current !== "loading") return
      commit()
    }, VEIL_IMAGE_WAIT_CAP_MS + 2000)
    return () => {
      cancelled = true
      window.clearTimeout(stuck)
    }
  }, [commit])

  const value = useMemo(() => ({ start, commit }), [start, commit])

  return (
    <RouteVeilContext.Provider value={value}>
      {children}
      <RouteVeil phase={phase} from={from} bootCover={bootCover} />
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

function RouteVeil({
  phase,
  from,
  bootCover,
}: {
  phase: Phase
  from: SiteSection
  bootCover: boolean
}) {
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
     with the veil over the header. First document load keeps top=0 in SSR
     so the loader covers the assembling page including chrome. */
  useLayoutEffect(() => {
    if (!visible) return
    if (bootCover) {
      setTop(0)
      return
    }
    const header = document.querySelector<HTMLElement>(".site-header")
    if (!header) return
    const apply = () => setTop(Math.round(header.getBoundingClientRect().bottom))
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(header)
    return () => ro.disconnect()
  }, [visible, bootCover])

  if (!visible) return null

  return (
    <div
      className={`route-veil route-veil-${phase}${bootCover ? " route-veil-boot" : ""}`}
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
