/**
 * Governed SEO mode for Woodright storefront surfaces.
 *
 * Prefer explicit WOODRIGHT_SEO_MODE. Otherwise derive from launch mode /
 * runtime role. Never treat hostname or missing vars as indexable.
 *
 * Modes:
 * - demo_noindex
 * - private_noindex
 * - public_indexable
 *
 * `public_indexable` requires BOTH:
 * 1) explicit SEO/launch (or legacy INDEXING_MODE=index) request for indexable
 * 2) exact public_production runtime identity (role and/or image build profile)
 *
 * Demo identity never becomes indexable even if env vars are mis-set.
 */
import {
  isPublicDemoRuntime,
  isPublicProductionRuntime,
} from "./launch-contract"
import { parseLaunchModeLenient } from "./launch-mode"

export type SeoMode = "demo_noindex" | "private_noindex" | "public_indexable"

const PRODUCTION_SITE_ORIGIN = "https://woodright.ru"
const PRODUCTION_SITEMAP_URL = `${PRODUCTION_SITE_ORIGIN}/sitemap.xml`

export function productionSiteOrigin(): string {
  return PRODUCTION_SITE_ORIGIN
}

export function productionSitemapUrl(): string {
  return PRODUCTION_SITEMAP_URL
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

function requestsIndexable(env: {
  seoMode?: string | null
  launchMode?: string | null
  indexingMode?: string | null
}): boolean {
  const explicit = parseSeoModeLenient(
    env.seoMode ?? process.env.WOODRIGHT_SEO_MODE
  )
  if (explicit === "public_indexable") return true
  const launch = parseLaunchModeLenient(
    env.launchMode ?? process.env.WOODRIGHT_LAUNCH_MODE
  )
  if (launch === "public_indexable") return true
  const indexing = String(
    env.indexingMode ?? process.env.WOODRIGHT_INDEXING_MODE ?? ""
  )
    .trim()
    .toLowerCase()
  return indexing === "index"
}

/**
 * Resolve SEO mode (fail-closed away from public_indexable).
 * Indexable only when public_production identity AND explicit indexable request.
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

  const explicit = parseSeoModeLenient(
    env.seoMode ?? process.env.WOODRIGHT_SEO_MODE
  )
  const launch = parseLaunchModeLenient(
    env.launchMode ?? process.env.WOODRIGHT_LAUNCH_MODE
  )

  if (
    requestsIndexable(env) &&
    isPublicProductionRuntime(runtimeRole, imageBuildProfile)
  ) {
    return "public_indexable"
  }

  // Indexable was requested without public_production identity → fail closed.
  if (requestsIndexable(env)) {
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
 * Rejects demo/loopback; defaults to apex https://woodright.ru when SITE_URL
 * is unset in pure unit fixtures for public_indexable.
 */
export function resolvePublicIndexableOrigin(
  siteUrl: string | undefined | null = process.env.NEXT_PUBLIC_SITE_URL
): string {
  const trimmed = String(siteUrl ?? "").trim().replace(/\/$/, "")
  if (!trimmed) return PRODUCTION_SITE_ORIGIN
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return PRODUCTION_SITE_ORIGIN
  }
  if (url.protocol !== "https:") return PRODUCTION_SITE_ORIGIN
  const host = url.hostname.toLowerCase()
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".localhost") ||
    host.includes("woodright-demo.ru")
  ) {
    return PRODUCTION_SITE_ORIGIN
  }
  // Always apex for canonical SEO surfaces.
  if (host === "www.woodright.ru") return PRODUCTION_SITE_ORIGIN
  if (host === "woodright.ru") return PRODUCTION_SITE_ORIGIN
  // Unknown non-demo https host is refused - stay on governed apex.
  return PRODUCTION_SITE_ORIGIN
}
