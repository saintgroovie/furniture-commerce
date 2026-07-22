/**
 * Server-controlled Woodright indexing policy (demo/staging fail-closed).
 *
 * Env: WOODRIGHT_INDEXING_MODE = "noindex" | "index"
 * - empty / unknown / anything else → noindex (fail-closed)
 * - "index" requires an explicit env change + separate production release
 *
 * Do not use NEXT_PUBLIC_* for this decision. Browser must not own SEO policy.
 * Do not derive policy solely from hostname (legacy woodright.ru is out of scope).
 */

export type IndexingMode = "noindex" | "index"

export const X_ROBOTS_TAG_NOINDEX = "noindex, nofollow, noarchive"

/** Resolve mode from a raw env string (tests pass explicit values). */
export function resolveIndexingMode(
  raw: string | undefined | null = process.env.WOODRIGHT_INDEXING_MODE
): IndexingMode {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase()
  if (v === "index") return "index"
  return "noindex"
}

export function isIndexingAllowed(
  raw?: string | null
): boolean {
  return resolveIndexingMode(raw) === "index"
}

/** Next.js Metadata `robots` for HTML pages. */
export function indexingRobotsMetadata(raw?: string | null): {
  index: boolean
  follow: boolean
  noarchive?: boolean
} {
  if (isIndexingAllowed(raw)) {
    return { index: true, follow: true }
  }
  return { index: false, follow: false, noarchive: true }
}

/**
 * Canonical link in noindex mode: omit (prefer no false link to legacy production).
 * In index mode: self-canonical absolute URL.
 */
export function indexingCanonical(
  absoluteUrl: string,
  raw?: string | null
): { canonical: string } | undefined {
  if (!isIndexingAllowed(raw)) return undefined
  return { canonical: absoluteUrl }
}

/**
 * X-Robots-Tag on buyer responses.
 * Skip in local development when mode is unset (avoid noisy local headers);
 * production/staging always emit when noindex; explicit WOODRIGHT_INDEXING_MODE=noindex
 * also emits in development.
 */
export function shouldEmitXRobotsTag(
  raw: string | undefined | null = process.env.WOODRIGHT_INDEXING_MODE,
  nodeEnv: string | undefined = process.env.NODE_ENV
): boolean {
  if (isIndexingAllowed(raw)) return false
  if (nodeEnv !== "production" && (raw == null || String(raw).trim() === "")) {
    return false
  }
  return true
}

/** robots.txt body for current mode. No Sitemap line in noindex. */
export function robotsTxtBody(raw?: string | null): string {
  if (isIndexingAllowed(raw)) {
    // Production cutover will supply a real Sitemap URL in a dedicated release.
    return ["User-agent: *", "Allow: /", ""].join("\n")
  }
  return ["User-agent: *", "Disallow: /", ""].join("\n")
}
