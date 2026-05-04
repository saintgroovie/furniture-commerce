import "server-only"
import * as fs from "fs"
import * as path from "path"
import type { OxfordPreviewStatus, OxfordReviewMediaItem } from "@/lib/qa/oxford-local-mvp-media-review-types"

/** GET handler imports this list — keep in sync. */
export const OXFORD_QA_PREVIEW_ALLOWED_REL_PREFIXES = [
  "data/raw/pdf-assets/extracted/Oxford_full/",
  "data/raw/assets/",
  "data/raw/downloaded-assets/",
  "data/processed/storefront-assets/",
  "data/raw/front/",
] as const

export const OXFORD_QA_PREVIEW_ROUTE = "/qa/oxford-local-mvp-media-review/preview"

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"])

export function medusaStaticOrigin(): string {
  const u = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
  return u.replace(/\/$/, "")
}

function normalizePosix(s: string): string {
  return s.trim().replace(/\\/g, "/").replace(/^\//, "")
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
  if (OXFORD_QA_PREVIEW_ALLOWED_REL_PREFIXES.every((p) => !n.startsWith(p))) return false
  if (n.startsWith("data/raw/front/") && n.endsWith(".json")) return false
  const ext = path.extname(n).toLowerCase()
  return IMAGE_EXT.has(ext)
}

function buildProxyUrl(relFromRepo: string): string {
  const q = new URLSearchParams({ rel: normalizePosix(relFromRepo) })
  return `${OXFORD_QA_PREVIEW_ROUTE}?${q.toString()}`
}

export type PreviewEnrichInput = {
  source_path_or_url: string
  repo_relative_path: string | null
  filename: string
  repoRoot: string | null
  exists_locally?: boolean | null
  local_binary_status?: string | null
  source_kind?: string | null
  /** Optional legacy HTTP URL from manifest row (if present in future inventory). */
  manifest_http_url?: string | null
}

function stripDockerAppDataPrefix(p: string): string {
  if (p.startsWith("/app/data/")) return p.slice("/app/".length)
  return p
}

export function enrichOxfordMediaPreview(input: PreviewEnrichInput): Pick<
  OxfordReviewMediaItem,
  "preview_url" | "preview_status" | "preview_error_reason" | "debug_source_path" | "manifest_http_url"
> {
  const rr0 = (input.repo_relative_path || "").trim().replace(/\\/g, "/")
  const spo0 = (input.source_path_or_url || "").trim().replace(/\\/g, "/")
  const primary = rr0 || spo0

  const debug =
    (rr0.length > 100 ? `${rr0.slice(0, 50)}…` : rr0) ||
    (spo0.length > 100 ? `${spo0.slice(0, 50)}…` : spo0) ||
    input.filename

  const manifestHttp =
    input.manifest_http_url && /^https?:\/\//i.test(input.manifest_http_url.trim())
      ? input.manifest_http_url.trim()
      : null

  if (!primary && !manifestHttp) {
    return {
      preview_url: null,
      preview_status: "unsupported_path",
      preview_error_reason: "No source path or URL.",
      debug_source_path: input.filename,
      manifest_http_url: null,
    }
  }

  // A — full HTTP(S)
  if (primary.startsWith("http://") || primary.startsWith("https://")) {
    return {
      preview_url: primary,
      preview_status: "preview_url_ready",
      preview_error_reason: null,
      debug_source_path: debug,
      manifest_http_url: manifestHttp,
    }
  }

  const origin = medusaStaticOrigin()

  // B — path starts with /static/
  if (primary.startsWith("/static/")) {
    return {
      preview_url: `${origin}${primary}`,
      preview_status: "backend_static_preview_ready",
      preview_error_reason: null,
      debug_source_path: debug,
      manifest_http_url: manifestHttp,
    }
  }

  // Repo-relative hub: prefer repo_relative_path when it looks like repo data / backend static
  const relHub = (() => {
    const r = stripDockerAppDataPrefix(rr0)
    const s = stripDockerAppDataPrefix(spo0)
    if (r.startsWith("data/") || r.startsWith("apps/")) return normalizePosix(r)
    if (s.startsWith("data/") || s.startsWith("apps/")) return normalizePosix(s)
    return ""
  })()

  // C — apps/backend/static/...
  if (relHub.startsWith("apps/backend/static/")) {
    const suffix = relHub.replace(/^apps\/backend\/static\//, "")
    return {
      preview_url: `${origin}/static/${suffix}`,
      preview_status: "backend_static_preview_ready",
      preview_error_reason: null,
      debug_source_path: debug,
      manifest_http_url: manifestHttp,
    }
  }

  // D — repo data/* image file → dev-only proxy URL
  if (relHub.startsWith("data/") && isAllowedDataRelForProxy(relHub)) {
    if (!input.repoRoot) {
      return {
        preview_url: null,
        preview_status: "file_missing",
        preview_error_reason: "Repo root not resolved — cannot read data/ images (check Docker mounts).",
        debug_source_path: debug,
        manifest_http_url: manifestHttp,
      }
    }
    if (fileExistsUnderRepo(input.repoRoot, relHub)) {
      return {
        preview_url: buildProxyUrl(relHub),
        preview_status: "local_file_preview_ready",
        preview_error_reason: null,
        debug_source_path: debug,
        manifest_http_url: manifestHttp,
      }
    }
    return {
      preview_url: null,
      preview_status: "file_missing",
      preview_error_reason: "Expected image under data/ is not on disk for this environment.",
      debug_source_path: debug,
      manifest_http_url: manifestHttp,
    }
  }

  // E — manifest-only HTTP (no local file)
  if (manifestHttp) {
    return {
      preview_url: manifestHttp,
      preview_status: "preview_url_ready",
      preview_error_reason: null,
      debug_source_path: debug,
      manifest_http_url: manifestHttp,
    }
  }

  // F — Yandex / external disk paths, front-manifest without file
  if (primary.startsWith("/WOODRIGHT") || primary.startsWith("/Users") || primary.startsWith("/Volumes")) {
    const st = input.local_binary_status || ""
    const reason =
      input.exists_locally === false && (st.includes("not_mounted") || st.includes("external"))
        ? "source_not_mounted"
        : input.exists_locally === false
          ? "manifest_only_no_local_file"
          : "unsupported_path"
    const status: OxfordPreviewStatus =
      reason === "source_not_mounted"
        ? "source_not_mounted"
        : reason === "manifest_only_no_local_file"
          ? "manifest_only_no_local_file"
          : "unsupported_path"
    return {
      preview_url: null,
      preview_status: status,
      preview_error_reason:
        status === "manifest_only_no_local_file"
          ? "Manifest reference only — no file in repo (mount Yandex mirror or use PDF/static copies)."
          : status === "source_not_mounted"
            ? "External or Yandex path — not mounted in this runtime."
            : "Path cannot be previewed from this QA page.",
      debug_source_path: debug,
      manifest_http_url: null,
    }
  }

  if (input.exists_locally === false && (input.source_kind === "legacy_front" || input.source_kind === "manifest_only")) {
    return {
      preview_url: null,
      preview_status: "manifest_only_no_local_file",
      preview_error_reason: "No local binary for this catalog reference.",
      debug_source_path: debug,
      manifest_http_url: null,
    }
  }

  return {
    preview_url: null,
    preview_status: "unsupported_path",
    preview_error_reason: "No preview rule matched this source.",
    debug_source_path: debug,
    manifest_http_url: null,
  }
}

export function oxfordQaImageContentType(filePath: string): string {
  const e = path.extname(filePath).toLowerCase()
  if (e === ".png") return "image/png"
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg"
  if (e === ".webp") return "image/webp"
  if (e === ".gif") return "image/gif"
  if (e === ".avif") return "image/avif"
  return "application/octet-stream"
}
