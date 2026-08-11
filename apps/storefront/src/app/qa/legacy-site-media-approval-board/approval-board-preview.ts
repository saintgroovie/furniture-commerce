import type { ChecklistItem, PoolMediaRef } from "./approval-board-types"

const API_BASE = "/qa/legacy-site-media-approval-board/api"

/**
 * Whether a remote preview URL should be loaded via the same-origin relative
 * preview proxy (not as a direct browser fetch).
 *
 * Uses hostname classification only - never bake a scheme-qualified production
 * buyer apex into client bundles (forbidden by the public_demo contamination gate).
 */
export function shouldProxyRemotePreviewUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false
  const host = url.hostname.toLowerCase()
  if (host === "localhost" || host === "127.0.0.1") return true
  // Legacy CMS media host (operator QA). Hostname only - not site authority URL.
  return host === "woodright.ru" || host === "www.woodright.ru"
}

export function candidatePreviewSrc(item: ChecklistItem): string {
  if (item.local_preview) {
    return `${API_BASE}/preview?path=${encodeURIComponent(item.local_preview)}`
  }
  return `${API_BASE}/preview?url=${encodeURIComponent(item.url)}`
}

export function poolMediaPreviewSrc(ref: PoolMediaRef): string | null {
  if (ref.preview_repo_rel) {
    return `${API_BASE}/preview?repoRel=${encodeURIComponent(ref.preview_repo_rel)}`
  }
  if (ref.preview_url) {
    if (shouldProxyRemotePreviewUrl(ref.preview_url)) {
      return `${API_BASE}/preview?url=${encodeURIComponent(ref.preview_url)}`
    }
    return ref.preview_url
  }
  return null
}
