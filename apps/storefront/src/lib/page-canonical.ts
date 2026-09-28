import type { Metadata } from "next"
import { getSiteUrl } from "@/lib/api/base"
import { indexingCanonical } from "@/lib/indexing-policy"

/**
 * Self-canonical for a path with no query string.
 * Filter/sort/utm URLs must keep calling this with the base path only.
 */
export function canonicalAlternates(
  pathname: string
): Pick<Metadata, "alternates"> | Record<string, never> {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`
  const canonical = indexingCanonical(`${getSiteUrl()}${path}`)
  return canonical ? { alternates: canonical } : {}
}
