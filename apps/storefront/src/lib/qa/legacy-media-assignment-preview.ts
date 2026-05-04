import * as fs from "fs"
import * as path from "path"

/** GET preview handler — keep in sync with route.ts allowlist. */
export const LEGACY_MEDIA_QA_PREVIEW_ALLOWED_REL_PREFIXES = [
  "apps/backend/static/products/",
  "data/raw/downloaded-assets/",
  "data/processed/storefront-assets/",
  "data/raw/front/",
  "data/raw/pdf-assets/",
  "data/raw/assets/",
] as const

export const LEGACY_MEDIA_QA_PREVIEW_ROUTE = "/qa/legacy-media-assignment-board/preview"

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"])

function normalizePosix(s: string): string {
  return s.trim().replace(/\\/g, "/").replace(/^\//, "")
}

export function medusaStaticOrigin(): string {
  const u = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
  return u.replace(/\/$/, "")
}

function stripDockerAppDataPrefix(p: string): string {
  if (p.startsWith("/app/data/")) return p.slice("/app/".length)
  return p
}

function safeRepoRel(repoRoot: string, relPosix: string): string | null {
  const rel = normalizePosix(relPosix)
  if (!rel || rel.includes("..")) return null
  const abs = path.normalize(path.join(repoRoot, rel))
  const rootNorm = path.normalize(repoRoot + path.sep)
  if (!abs.startsWith(rootNorm) && abs !== path.normalize(repoRoot)) return null
  return rel
}

function fileExistsUnderRepo(repoRoot: string, rel: string): boolean {
  const safe = safeRepoRel(repoRoot, rel)
  if (!safe) return false
  const abs = path.join(repoRoot, safe)
  try {
    return fs.existsSync(abs) && fs.statSync(abs).isFile()
  } catch {
    return false
  }
}

function isAllowedDataRelForProxy(rel: string): boolean {
  const n = normalizePosix(rel)
  if (!n.startsWith("data/")) return false
  if (LEGACY_MEDIA_QA_PREVIEW_ALLOWED_REL_PREFIXES.every((p) => !n.startsWith(p))) return false
  if (n.startsWith("data/raw/front/") && n.endsWith(".json")) return false
  const ext = path.extname(n).toLowerCase()
  return IMAGE_EXT.has(ext)
}

function buildProxyUrl(relFromRepo: string): string {
  const q = new URLSearchParams({ rel: normalizePosix(relFromRepo) })
  return `${LEGACY_MEDIA_QA_PREVIEW_ROUTE}?${q.toString()}`
}

export type LegacyMediaPreviewInput = {
  source_path: string | null
  repo_relative_path: string | null
  filename: string
  exists_locally?: boolean | null
  previewable?: boolean | null
  preview_reason?: string | null
}

export type LegacyMediaPreviewResult = {
  preview_url: string | null
  use_img_tag: boolean
  preview_status: string
  preview_error_reason: string | null
  debug_source_path: string
}

/**
 * Resolve a safe preview URL for QA board. Never returns arbitrary http(s) except manifest-backed (none today).
 */
export function resolveLegacyMediaBoardPreview(repoRoot: string | null, input: LegacyMediaPreviewInput): LegacyMediaPreviewResult {
  const rr0 = (input.repo_relative_path || "").trim().replace(/\\/g, "/")
  const spo0 = (input.source_path || "").trim().replace(/\\/g, "/")
  const primary = rr0 || spo0
  const fn = input.filename || "unknown"
  const debug = primary.length > 120 ? `${primary.slice(0, 60)}…` : primary || fn

  if (!primary) {
    return {
      preview_url: null,
      use_img_tag: false,
      preview_status: "no_source",
      preview_error_reason: "No path.",
      debug_source_path: fn,
    }
  }

  if (primary.startsWith("http://") || primary.startsWith("https://")) {
    return {
      preview_url: primary,
      use_img_tag: true,
      preview_status: "remote_http",
      preview_error_reason: null,
      debug_source_path: debug,
    }
  }

  const origin = medusaStaticOrigin()

  if (primary.startsWith("/static/")) {
    return {
      preview_url: `${origin}${primary}`,
      use_img_tag: true,
      preview_status: "backend_static_url",
      preview_error_reason: null,
      debug_source_path: debug,
    }
  }

  const relHub = (() => {
    const r = stripDockerAppDataPrefix(rr0)
    const s = stripDockerAppDataPrefix(spo0)
    if (r.startsWith("data/") || r.startsWith("apps/")) return normalizePosix(r)
    if (s.startsWith("data/") || s.startsWith("apps/")) return normalizePosix(s)
    return ""
  })()

  if (relHub.startsWith("apps/backend/static/")) {
    const suffix = relHub.replace(/^apps\/backend\/static\//, "")
    return {
      preview_url: `${origin}/static/${suffix}`,
      use_img_tag: true,
      preview_status: "backend_static_mapped",
      preview_error_reason: null,
      debug_source_path: debug,
    }
  }

  if (relHub.startsWith("data/") && isAllowedDataRelForProxy(relHub)) {
    if (!repoRoot) {
      return {
        preview_url: null,
        use_img_tag: false,
        preview_status: "repo_unresolved",
        preview_error_reason: "Repo root not resolved.",
        debug_source_path: debug,
      }
    }
    if (fileExistsUnderRepo(repoRoot, relHub)) {
      return {
        preview_url: buildProxyUrl(relHub),
        use_img_tag: true,
        preview_status: "local_proxy",
        preview_error_reason: null,
        debug_source_path: debug,
      }
    }
    return {
      preview_url: null,
      use_img_tag: false,
      preview_status: "file_missing",
      preview_error_reason: "Allowlisted data path not on disk.",
      debug_source_path: debug,
    }
  }

  if (primary.startsWith("/WOODRIGHT") || primary.startsWith("/Users") || primary.startsWith("/Volumes")) {
    return {
      preview_url: null,
      use_img_tag: false,
      preview_status: "unpreviewable_external_ref",
      preview_error_reason: input.preview_reason || "External or Yandex path — no local binary in repo.",
      debug_source_path: debug,
    }
  }

  if (input.previewable === false || input.exists_locally === false) {
    return {
      preview_url: null,
      use_img_tag: false,
      preview_status: "unpreviewable",
      preview_error_reason: input.preview_reason || "No local preview for this reference.",
      debug_source_path: debug,
    }
  }

  return {
    preview_url: null,
    use_img_tag: false,
    preview_status: "unsupported",
    preview_error_reason: "No preview rule matched.",
    debug_source_path: debug,
  }
}

export function legacyMediaBoardImageContentType(filePath: string): string {
  const e = path.extname(filePath).toLowerCase()
  if (e === ".png") return "image/png"
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg"
  if (e === ".webp") return "image/webp"
  if (e === ".gif") return "image/gif"
  if (e === ".avif") return "image/avif"
  return "application/octet-stream"
}
