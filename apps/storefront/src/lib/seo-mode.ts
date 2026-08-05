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

export type SeoMode = "demo_noindex" | "private_noindex" | "public_indexable"

/** Vote from one populated control: index request, explicit noindex, or invalid. */
type ControlVote = "indexable" | "noindex" | "invalid"

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
