import {
  assertProductionLikeSiteUrl,
  isProductionLikeRuntime,
} from "@/lib/launch-contract"

/**
 * Medusa API base URL.
 * - Server: Docker-internal / loopback from server-only env (never NEXT_PUBLIC).
 * - Browser: same-origin empty base so `/store/...` hits Next rewrites → backend.
 *
 * No localhost:9000 / host.docker.internal string literals here — this module is
 * imported by Client Components (cart/checkout) and must not embed :9000 hosts.
 */
export function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    return ""
  }

  const raw =
    process.env.MEDUSA_BACKEND_INTERNAL_URL ||
    process.env.MEDUSA_BACKEND_URL_INTERNAL ||
    process.env.MEDUSA_BACKEND_URL ||
    ""
  const trimmed = String(raw).trim().replace(/\/$/, "")

  if (!trimmed) {
    throw new Error(
      "Missing MEDUSA_BACKEND_INTERNAL_URL (or MEDUSA_BACKEND_URL) for server-side Medusa fetches"
    )
  }

  return trimmed
}

/**
 * Base URL of the storefront for metadataBase, canonical, OG.
 *
 * Fail-closed for production-like processes (see `@/lib/launch-contract`):
 * - `WOODRIGHT_RUNTIME_ROLE` production/production_candidate, OR
 * - `WOODRIGHT_LAUNCH_MODE` set, OR
 * - `NODE_ENV=production` (covers plain `next build`/`next start`)
 * require `NEXT_PUBLIC_SITE_URL` with no `localhost:8000` fallback.
 *
 * The stricter demo/loopback rejection (`assertProductionLikeSiteUrl`) only
 * fires when a launch mode is explicitly set or the runtime role is
 * production-like - a bare `NODE_ENV=production` build (e.g. CI's
 * `https://woodright-demo.ru` build check) still passes, unchanged.
 *
 * Local/dev without a production-like role keeps the `localhost:8000`
 * fallback for DX.
 */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL
  const runtimeRole = process.env.WOODRIGHT_RUNTIME_ROLE
  const launchModeRaw = process.env.WOODRIGHT_LAUNCH_MODE
  const nodeEnv = process.env.NODE_ENV

  const roleIsProductionLike = isProductionLikeRuntime(runtimeRole)
  const launchModeIsSet = Boolean(launchModeRaw && String(launchModeRaw).trim())
  const requireExplicit = roleIsProductionLike || launchModeIsSet || nodeEnv === "production"

  if (!requireExplicit) {
    const trimmed = String(raw ?? "").trim()
    return trimmed ? trimmed.replace(/\/$/, "") : "http://localhost:8000"
  }

  const trimmed = String(raw ?? "").trim()
  if (!trimmed) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL is required (WOODRIGHT_RUNTIME_ROLE production-like / WOODRIGHT_LAUNCH_MODE set / NODE_ENV=production) - no localhost fallback"
    )
  }

  if (launchModeIsSet || roleIsProductionLike) {
    return assertProductionLikeSiteUrl(trimmed)
  }

  return trimmed.replace(/\/$/, "")
}

function getPublishableKey(): string {
  // Prefer server-only override so standalone/runtime can inject without rebuild.
  // NEXT_PUBLIC_* is inlined at build time and may be empty in local QA images.
  return (
    process.env.MEDUSA_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
    ""
  )
}

/** Default server-side Medusa fetch budget (build/SSR without a live backend). */
const DEFAULT_MEDUSA_FETCH_TIMEOUT_MS = 8_000

function medusaFetchTimeoutMs(): number {
  const raw = process.env.MEDUSA_FETCH_TIMEOUT_MS
  if (raw === undefined || raw === "") return DEFAULT_MEDUSA_FETCH_TIMEOUT_MS
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MEDUSA_FETCH_TIMEOUT_MS
}

/**
 * Next.js 16 patches `fetch` with streaming transforms. Attaching abort signals
 * to that patched fetch can throw
 * `TypeError: controller[kState].transformAlgorithm is not a function` during SSR
 * and leave catalog/PDP on the empty shell.
 *
 * Bound the wait with an outer `Promise.race` timer instead of attaching a signal
 * to the patched fetch. Callers that pass an explicit `signal` own lifecycle and
 * bypass the default race budget.
 */
async function fetchWithMedusaTimeout(
  url: string,
  init?: RequestInit
): Promise<Response> {
  if (init?.signal) {
    return fetch(url, init)
  }
  const { signal: _ignored, ...rest } = init ?? {}
  const timeoutMs = medusaFetchTimeoutMs()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      fetch(url, rest),
      new Promise<Response>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(`Medusa fetch timed out after ${timeoutMs}ms: ${url}`)
          )
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** Fetch wrapper that adds the publishable API key header. */
export function medusaFetch(url: string, init?: RequestInit): Promise<Response> {
  const key = getPublishableKey()
  const headers = new Headers(init?.headers)
  if (key) {
    headers.set("x-publishable-api-key", key)
  }
  // Cart / checkout / mutations must never be served from Next Data Cache.
  return fetchWithMedusaTimeout(url, { ...init, headers, cache: "no-store" })
}

/**
 * Read-only catalog / RoomSet membership fetches.
 * Uses a short Next.js revalidate window so repeat SSR of /catalog does not
 * wait on Medusa every time. Cart and mutations stay on `medusaFetch`.
 *
 * Override TTL with `MEDUSA_CATALOG_REVALIDATE_SECONDS` (default 60).
 * Set to `0` to force no-store (debug / emergency stale-price bypass).
 */
export function medusaCatalogFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const key = getPublishableKey()
  const headers = new Headers(init?.headers)
  if (key) {
    headers.set("x-publishable-api-key", key)
  }

  const raw = process.env.MEDUSA_CATALOG_REVALIDATE_SECONDS
  const parsed =
    raw === undefined || raw === "" ? 60 : Number.parseInt(raw, 10)
  const revalidate = Number.isFinite(parsed) ? parsed : 60

  if (revalidate <= 0) {
    return fetchWithMedusaTimeout(url, { ...init, headers, cache: "no-store" })
  }

  return fetchWithMedusaTimeout(url, {
    ...init,
    headers,
    next: { revalidate },
  })
}
