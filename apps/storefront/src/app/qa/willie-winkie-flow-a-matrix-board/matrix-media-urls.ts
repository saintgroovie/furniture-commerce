import * as path from "path"

const MATRIX_PREVIEW_API = "/qa/willie-winkie-flow-a-matrix-board/api/preview"

const STATIC_PRODUCTS_PREFIX = "/static/products/"
const BACKEND_STATIC_REL = path.join("apps", "backend", "static")

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

export function isAllowedStaticProductPath(staticPath: string): boolean {
  if (!staticPath.startsWith(STATIC_PRODUCTS_PREFIX)) return false
  if (staticPath.includes("..")) return false
  if (staticPath.includes("://")) return false
  const rest = staticPath.slice(STATIC_PRODUCTS_PREFIX.length)
  if (!rest || rest.startsWith("/")) return false
  return true
}

/** Map `/static/products/...` to repo-relative disk path under `apps/backend/static/products/...`. */
export function staticPathToDiskRelative(staticPath: string): string | null {
  if (!isAllowedStaticProductPath(staticPath)) return null
  const underProducts = staticPath.slice(STATIC_PRODUCTS_PREFIX.length)
  return path.join(BACKEND_STATIC_REL, "products", ...underProducts.split("/"))
}

export function contentTypeForStaticPath(staticPath: string): string {
  const ext = path.extname(staticPath).toLowerCase()
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg"
  if (ext === ".png") return "image/png"
  if (ext === ".webp") return "image/webp"
  if (ext === ".gif") return "image/gif"
  return "application/octet-stream"
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

/** Client-side guard: rewrite docker host or bare `/static/products/...` to QA proxy. */
export function sanitizeMediaUrlForBrowser(url: string): string {
  if (!url) return url
  if (url.startsWith(STATIC_PRODUCTS_PREFIX) && isAllowedStaticProductPath(url)) {
    return toQaPreviewProxyUrl(url)
  }
  if (!/medusa(?::|\/)/i.test(url) && !url.includes("://")) return url
  try {
    const u = new URL(url, "http://localhost")
    if (isAllowedStaticProductPath(u.pathname)) {
      return toQaPreviewProxyUrl(u.pathname)
    }
    if (/medusa/i.test(u.hostname)) {
      u.hostname = "localhost"
      return u.toString()
    }
    return url
  } catch {
    return url
  }
}
