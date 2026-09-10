"use client"

import { systemCopy } from "@/lib/woodright-copy"
import { useRouteVeilLoading } from "@/lib/route-veil"
import { useKidsEnterOnLoadingAppear } from "@/lib/use-site-section"

/**
 * Route fallback. The visible loader is the RouteVeil (root layout): it
 * mounts when this fallback appears and stays up after the route commits
 * until the new page's above-the-fold images are loaded, so the page never
 * pops in half-painted. This fallback only holds the page height and the
 * live-region text for assistive tech.
 */
export default function Loading() {
  useRouteVeilLoading()
  /* Kids catalog → PDP: start KIDS enter with the loader's appear delay
     (not on the catalog click). */
  useKidsEnterOnLoadingAppear()

  return (
    <div className="route-loading-fallback" data-state="loading" aria-busy="true" aria-live="polite">
      <p className="sr-only">{systemCopy.loading.label}</p>
    </div>
  )
}
