/**
 * Server-controlled Woodright indexing policy (demo/staging fail-closed).
 *
 * Env: WOODRIGHT_INDEXING_MODE =
 *   "noindex" | "private_noindex" | "index"
 * - empty / unknown / anything else → noindex (fail-closed)
 * - "index" requires explicit env + separate owner approval + readiness gates
 * - alias "public_indexable" is NOT accepted at runtime (templates only) to prevent
 *   accidental indexing before legal/Admin/DNS gates pass
 *
 * Do not use NEXT_PUBLIC_* for this decision. Browser must not own SEO policy.
 * Do not derive policy solely from hostname.
 *
 * `WOODRIGHT_LAUNCH_MODE` (see `@/lib/launch-contract`) is the newer typed
 * public-launch contract. When it is set, it wins over legacy
 * `WOODRIGHT_INDEXING_MODE` for the *default* (no-arg) resolution below -
 * this keeps one indexing decision instead of two env vars disagreeing.
 * Explicit callers that pass their own `raw` value (as the fidelity test
 * does) are unaffected; only the default-parameter env read changes.
 */
import { DEMO_HOSTS, LOOPBACK_HOST_RE } from "./demo-hosts"
import { parseLaunchModeLenient } from "./launch-mode"
import {
  resolvePublicIndexableOrigin,
  resolveSeoMode,
  seoModeToIndexingRaw,
} from "./seo-mode"
export type IndexingMode = "noindex" | "index"

export const X_ROBOTS_TAG_NOINDEX = "noindex, nofollow, noarchive"

/**
 * Default raw indexing source: governed by resolveSeoMode() when any SEO /
 * launch / indexing / runtime identity env is present. When none are set,
 * return undefined so local development skips noisy X-Robots-Tag headers
 * (legacy fidelity contract).
 */
function defaultIndexingRaw(): string | undefined {
  const hasGovernedInput = [
    process.env.WOODRIGHT_SEO_MODE,
    process.env.WOODRIGHT_LAUNCH_MODE,
    process.env.WOODRIGHT_INDEXING_MODE,
    process.env.WOODRIGHT_RUNTIME_ROLE,
    process.env.WOODRIGHT_IMAGE_BUILD_PROFILE,
  ].some((v) => String(v ?? "").trim() !== "")
  if (!hasGovernedInput) return undefined
  return seoModeToIndexingRaw(resolveSeoMode())
}

/** Resolve mode from a raw env string (tests pass explicit values). */
export function resolveIndexingMode(
  raw: string | undefined | null = defaultIndexingRaw()
): IndexingMode {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase()
  // Intentionally do NOT accept public_indexable here - see launch-config aliases.
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
 * Canonical link:
 * - When `WOODRIGHT_LAUNCH_MODE` is set: always emit production-safe self-canonical
 *   via `launchCanonical` (private_noindex still uses real host; robots stay noindex).
 * - Legacy (no launch mode): omit in noindex; emit in index (demo-safe fail-closed).
 */
export function indexingCanonical(
  absoluteUrl: string,
  raw?: string | null
): { canonical: string } | undefined {
  if (parseLaunchModeLenient(process.env.WOODRIGHT_LAUNCH_MODE)) {
    return launchCanonical(absoluteUrl)
  }
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
  raw: string | undefined | null = defaultIndexingRaw(),
  nodeEnv: string | undefined = process.env.NODE_ENV
): boolean {
  if (isIndexingAllowed(raw)) return false
  if (nodeEnv !== "production" && (raw == null || String(raw).trim() === "")) {
    return false
  }
  return true
}

/**
 * Public-launch canonical: unlike `indexingCanonical`, this always emits a
 * canonical when `absoluteUrl` is a production-safe (https, non-demo,
 * non-loopback) URL - regardless of indexing mode. Robots stays gated
 * separately (`indexingRobotsMetadata` / `shouldEmitXRobotsTag`).
 *
 * Rationale: a `private_noindex` production candidate still wants a stable
 * self-canonical for metadata QA (built from `getSiteUrl()`, which resolves
 * to the real production host once a launch mode / production-like role is
 * set) - only the robots directive should say noindex, not the canonical
 * link. Kept separate from `indexingCanonical` (legacy demo-mode gate used
 * by existing indexed/noindex page wiring + its fidelity assertions) so
 * existing callers are not silently changed - do not merge the two without
 * re-auditing every `indexingCanonical` call site.
 */
export function launchCanonical(absoluteUrl: string): { canonical: string } | undefined {
  let url: URL
  try {
    url = new URL(absoluteUrl)
  } catch {
    return undefined
  }
  if (url.protocol !== "https:") return undefined
  if (LOOPBACK_HOST_RE.test(url.hostname) || LOOPBACK_HOST_RE.test(url.host)) return undefined
  const host = url.hostname.toLowerCase()
  if (DEMO_HOSTS.some((demo) => host === demo || host.endsWith(`.${demo}`))) return undefined
  return { canonical: absoluteUrl }
}

/** robots.txt body for current mode. Sitemap line only for public_indexable. */
export function robotsTxtBody(raw?: string | null): string {
  if (isIndexingAllowed(raw)) {
    const origin = resolvePublicIndexableOrigin()
    return ["User-agent: *", "Allow: /", `Sitemap: ${origin}/sitemap.xml`, ""].join(
      "\n"
    )
  }
  return ["User-agent: *", "Disallow: /", ""].join("\n")
}
