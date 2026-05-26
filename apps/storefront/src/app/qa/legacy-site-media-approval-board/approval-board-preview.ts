import type { ChecklistItem, PoolMediaRef } from "./approval-board-types"

const API_BASE = "/qa/legacy-site-media-approval-board/api"

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
    if (ref.preview_url.startsWith("http://localhost") || ref.preview_url.startsWith("https://woodright.ru")) {
      return `${API_BASE}/preview?url=${encodeURIComponent(ref.preview_url)}`
    }
    return ref.preview_url
  }
  return null
}
