"use client"

/**
 * Compatibility re-exports. New code should import from `@/lib/use-site-section`.
 * Kids PDP bridge and boolean helpers stay on these names so existing
 * `kids-product-section` / header callers do not fork.
 */
export {
  KidsSectionProvider,
  LOADING_APPEAR_DELAY_MS,
  SiteSectionProvider,
  useBespokeSection,
  useChromeVisual,
  useKidsChromeVisual,
  useKidsEnterOnLoadingAppear,
  useKidsProductSection,
  useKidsSection,
  useKidsSectionTransition,
  useSiteSection,
  useSiteSectionTransition,
} from "@/lib/use-site-section"
export type { SiteSection } from "@/lib/use-site-section"
