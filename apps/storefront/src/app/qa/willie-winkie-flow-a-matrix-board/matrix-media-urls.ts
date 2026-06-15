const MATRIX_PREVIEW_API = "/qa/willie-winkie-flow-a-matrix-board/api/preview"

const STATIC_PRODUCTS_PREFIX = "/static/products/"

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "")
}

/** Rewrite Docker-only hostnames to localhost for host-browser / host-Next fetches. */
export function rewriteDockerHostForBrowser(baseUrl: string): string {
  try {
    const u = new URL(baseUrl)
    if (u.hostname === "medusa" || u.hostname.endsWith(".medusa")) {
      u.hostname = "localhost"
    }
    return stripTrailingSlash(u.toString())
  } catch {
    return "http://localhost:9000"
  }
}

/** Base URL for browser-openable static files (never `medusa:9000`). */
export function resolveBrowserStaticBase(): string {
  const fromPublic =
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_MEDUSA_URL?.trim()
  if (fromPublic) return rewriteDockerHostForBrowser(fromPublic)

  const fromServer = process.env.MEDUSA_BACKEND_URL?.trim()
  if (fromServer) return rewriteDockerHostForBrowser(fromServer)

  return "http://localhost:9000"
}

/** Base URL for server-side proxy fetch to backend static (host-safe). */
export function resolveInternalStaticBase(): string {
  return resolveBrowserStaticBase()
}

export function staticProductPath(collection: string, filename: string): string {
  const safeCollection = collection.replace(/[^a-z0-9-]/gi, "")
  const safeFilename = filename.replace(/[/\\]/g, "")
  return `${STATIC_PRODUCTS_PREFIX}${safeCollection}/${safeFilename}`
}

export function isAllowedStaticProductPath(path: string): boolean {
  if (!path.startsWith(STATIC_PRODUCTS_PREFIX)) return false
  if (path.includes("..")) return false
  if (path.includes("://")) return false
  return true
}

/** Same-origin QA proxy URL — safe for `<img>` and “open in tab”. */
export function toQaPreviewProxyUrl(staticPath: string): string {
  if (!isAllowedStaticProductPath(staticPath)) {
    throw new Error("invalid_static_product_path")
  }
  return `${MATRIX_PREVIEW_API}?path=${encodeURIComponent(staticPath)}`
}

/** Direct browser URL on localhost:9000 (fallback / open link). */
export function toBrowserDirectStaticUrl(staticPath: string): string {
  if (!isAllowedStaticProductPath(staticPath)) {
    throw new Error("invalid_static_product_path")
  }
  return `${resolveBrowserStaticBase()}${staticPath}`
}

export function buildMediaPreviewUrls(collection: string, filenames: string[]): {
  media_static_paths: string[]
  media_preview_urls: string[]
  media_open_urls: string[]
} {
  const media_static_paths = filenames.map((f) => staticProductPath(collection, f))
  const media_preview_urls = media_static_paths.map((p) => toQaPreviewProxyUrl(p))
  const media_open_urls = media_static_paths.map((p) => toBrowserDirectStaticUrl(p))
  return { media_static_paths, media_preview_urls, media_open_urls }
}

/** Client-side guard for any legacy API payload still containing docker host. */
export function sanitizeMediaUrlForBrowser(url: string): string {
  if (!url) return url
  if (!/medusa(?::|\/)/i.test(url)) return url
  try {
    const u = new URL(url)
    if (isAllowedStaticProductPath(u.pathname)) {
      return toQaPreviewProxyUrl(u.pathname)
    }
    u.hostname = "localhost"
    return u.toString()
  } catch {
    return url
  }
}
