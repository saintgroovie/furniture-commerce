/**
 * Governed SEO mode for Woodright storefront surfaces.
 *
 * Prefer explicit WOODRIGHT_SEO_MODE when it is the only populated control.
 * When multiple SEO/launch/indexing controls are populated they must agree;
 * any unknown or contradictory value fails closed to private_noindex.
 * Never treat hostname or missing vars as indexable.
 *
 * Modes:
 * - demo_noindex
 * - private_noindex
 * - public_indexable
 *
 * `public_indexable` requires BOTH:
 * 1) unanimous indexable request from every populated SEO/launch/indexing control
 * 2) exact public_production runtime identity (role and/or image build profile)
 *
 * Demo identity never becomes indexable even if env vars are mis-set.
 */
import {
  isPublicDemoRuntime,
  isPublicProductionRuntime,
} from "./launch-contract"
import { parseLaunchModeLenient } from "./launch-mode"
import {
  isProductionBuyerHost,
  isProductionSiteApexHost,
  PRODUCTION_SITE_APEX_HOST,
} from "./production-hosts"

export type SeoMode = "demo_noindex" | "private_noindex" | "public_indexable"

/** Vote from one populated control: index request, explicit noindex, or invalid. */
type ControlVote = "indexable" | "noindex" | "invalid"

/**
 * Production site origin for public_indexable SEO surfaces.
 * Requires an explicit SITE_URL whose host is a production buyer host.
 * Never hardcodes a scheme-qualified production apex (bundlers fold it into
 * public_demo server chunks - see failed bake 31082069745).
 */
export function productionSiteOrigin(
  siteUrl: string | undefined | null = process.env.NEXT_PUBLIC_SITE_URL
): string {
  return resolvePublicIndexableOrigin(siteUrl)
}

export function productionSitemapUrl(
  siteUrl: string | undefined | null = process.env.NEXT_PUBLIC_SITE_URL
): string {
  return `${productionSiteOrigin(siteUrl)}/sitemap.xml`
}

/** True when origin is the governed production apex (hostname check only). */
export function isGovernedProductionSiteOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    return (
      url.protocol === "https:" && isProductionSiteApexHost(url.hostname)
    )
  } catch {
    return false
  }
}

export function parseSeoModeLenient(
  raw: string | undefined | null
): SeoMode | undefined {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase()
  if (
    value === "demo_noindex" ||
    value === "private_noindex" ||
    value === "public_indexable"
  ) {
    return value
  }
  return undefined
}

function rawOrEnv(
  override: string | null | undefined,
  envKey: string
): string {
  if (override !== undefined && override !== null) {
    return String(override).trim()
  }
  return String(process.env[envKey] ?? "").trim()
}

function voteSeoMode(raw: string): ControlVote | undefined {
  if (!raw) return undefined
  const parsed = parseSeoModeLenient(raw)
  if (parsed === "public_indexable") return "indexable"
  if (parsed === "private_noindex" || parsed === "demo_noindex") return "noindex"
  return "invalid"
}

function voteLaunchMode(raw: string): ControlVote | undefined {
  if (!raw) return undefined
  const parsed = parseLaunchModeLenient(raw)
  if (parsed === "public_indexable") return "indexable"
  if (parsed === "private_noindex") return "noindex"
  return "invalid"
}

function voteIndexingMode(raw: string): ControlVote | undefined {
  if (!raw) return undefined
  const value = raw.toLowerCase()
  // Runtime indexing accepts only "index" as indexable (public_indexable is template-only).
  if (value === "index") return "indexable"
  if (
    value === "noindex" ||
    value === "private_noindex" ||
    value === "demo_noindex"
  ) {
    return "noindex"
  }
  return "invalid"
}

/**
 * Collect votes from populated SEO controls.
 * Empty / unset controls abstain. Invalid or contradictory votes fail closed.
 */
function resolveControlVotes(env: {
  seoMode?: string | null
  launchMode?: string | null
  indexingMode?: string | null
}): { ok: boolean; wantsIndexable: boolean } {
  const votes: ControlVote[] = []
  const seoVote = voteSeoMode(rawOrEnv(env.seoMode, "WOODRIGHT_SEO_MODE"))
  const launchVote = voteLaunchMode(
    rawOrEnv(env.launchMode, "WOODRIGHT_LAUNCH_MODE")
  )
  const indexingVote = voteIndexingMode(
    rawOrEnv(env.indexingMode, "WOODRIGHT_INDEXING_MODE")
  )
  if (seoVote) votes.push(seoVote)
  if (launchVote) votes.push(launchVote)
  if (indexingVote) votes.push(indexingVote)

  if (votes.length === 0) {
    return { ok: true, wantsIndexable: false }
  }
  if (votes.some((v) => v === "invalid")) {
    return { ok: false, wantsIndexable: false }
  }
  const wantsIndex = votes.some((v) => v === "indexable")
  const wantsNoindex = votes.some((v) => v === "noindex")
  if (wantsIndex && wantsNoindex) {
    return { ok: false, wantsIndexable: false }
  }
  return { ok: true, wantsIndexable: wantsIndex }
}

/**
 * Resolve SEO mode (fail-closed away from public_indexable).
 * Indexable only when public_production identity AND unanimous indexable request.
 */
export function resolveSeoMode(env: {
  seoMode?: string | null
  launchMode?: string | null
  indexingMode?: string | null
  runtimeRole?: string | null
  imageBuildProfile?: string | null
} = {}): SeoMode {
  const runtimeRole = env.runtimeRole ?? process.env.WOODRIGHT_RUNTIME_ROLE
  const imageBuildProfile =
    env.imageBuildProfile ?? process.env.WOODRIGHT_IMAGE_BUILD_PROFILE

  if (isPublicDemoRuntime(runtimeRole, imageBuildProfile)) {
    return "demo_noindex"
  }

  const controls = resolveControlVotes(env)
  // Unknown / contradictory populated controls never unlock indexing.
  if (!controls.ok) {
    return "private_noindex"
  }

  const explicit = parseSeoModeLenient(
    rawOrEnv(env.seoMode, "WOODRIGHT_SEO_MODE")
  )
  const launch = parseLaunchModeLenient(
    rawOrEnv(env.launchMode, "WOODRIGHT_LAUNCH_MODE")
  )

  if (
    controls.wantsIndexable &&
    isPublicProductionRuntime(runtimeRole, imageBuildProfile)
  ) {
    return "public_indexable"
  }

  // Indexable was requested without public_production identity → fail closed.
  if (controls.wantsIndexable) {
    return "private_noindex"
  }

  if (explicit === "demo_noindex") return "demo_noindex"
  if (explicit === "private_noindex" || launch === "private_noindex") {
    return "private_noindex"
  }

  return "private_noindex"
}

export function seoModeToIndexingRaw(mode: SeoMode): "index" | "noindex" {
  return mode === "public_indexable" ? "index" : "noindex"
}

/** Convenience: SEO mode → indexing raw used by indexing-policy helpers. */
export function currentIndexingRawFromSeo(): string {
  return seoModeToIndexingRaw(resolveSeoMode())
}

/**
 * Absolute production-safe origin for sitemap/robots Sitemap: line.
 *
 * Fail-closed: requires an explicit https SITE_URL on a production buyer host.
 * No hardcoded production-apex fallback (that string must not exist in
 * public_demo compilation inputs). www is normalized to apex via URL mutation
 * so the returned value comes from the URL object, not a source literal.
 */
export function resolvePublicIndexableOrigin(
  siteUrl: string | undefined | null = process.env.NEXT_PUBLIC_SITE_URL
): string {
  const trimmed = String(siteUrl ?? "").trim().replace(/\/$/, "")
  if (!trimmed) {
    throw new Error(
      "resolvePublicIndexableOrigin requires NEXT_PUBLIC_SITE_URL (production buyer https origin) - no hardcoded apex fallback"
    )
  }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error(
      `resolvePublicIndexableOrigin: SITE_URL is not a valid absolute URL: "${trimmed}"`
    )
  }
  if (url.protocol !== "https:") {
    throw new Error(
      `resolvePublicIndexableOrigin: SITE_URL must be https, got: "${trimmed}"`
    )
  }
  const host = url.hostname.toLowerCase()
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".localhost") ||
    host.includes("woodright-demo.ru")
  ) {
    throw new Error(
      `resolvePublicIndexableOrigin rejects demo/loopback SITE_URL: "${trimmed}"`
    )
  }
  if (!isProductionBuyerHost(host)) {
    throw new Error(
      `resolvePublicIndexableOrigin: SITE_URL host must be ${PRODUCTION_SITE_APEX_HOST} (or www), got: "${host}"`
    )
  }
  if (!isProductionSiteApexHost(host)) {
    url.hostname = PRODUCTION_SITE_APEX_HOST
  }
  return url.origin
}
