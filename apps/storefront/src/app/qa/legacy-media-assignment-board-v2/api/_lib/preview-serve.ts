import * as fs from "fs"
import * as path from "path"
import { getFurnitureRepoDataResolution } from "./furniture-repo-data-root"

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
}

/** Allowed repo-relative prefixes for QA board image proxy. */
const ALLOWED_REL_PREFIXES = ["data/", "apps/backend/static/"] as const

export function normalizePreviewRel(raw: string | null | undefined): string | null {
  if (!raw) return null
  const rel = raw.trim().replace(/\\/g, "/").replace(/^\//, "")
  if (!rel || rel.includes("..")) return null
  if (!ALLOWED_REL_PREFIXES.some((p) => rel.startsWith(p))) return null
  return rel
}

export type PreviewServeResult =
  | { ok: true; body: Buffer; contentType: string; absPath: string }
  | { ok: false; status: 400 | 404 | 500; error: string; detail?: Record<string, unknown> }

export function readRepoPreviewFile(rel: string): PreviewServeResult {
  const resolution = getFurnitureRepoDataResolution()
  const repoRoot = resolution.repoRoot
  if (!repoRoot) {
    return {
      ok: false,
      status: 500,
      error: "repo_root_not_resolved",
      detail: { cwd: resolution.cwd, checked_paths: resolution.seedsTried },
    }
  }

  const abs = path.resolve(path.join(repoRoot, rel))
  const allowedRoot = path.resolve(repoRoot)
  if (!abs.startsWith(allowedRoot + path.sep) && abs !== allowedRoot) {
    return { ok: false, status: 400, error: "path_escape" }
  }

  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return { ok: false, status: 404, error: "file_not_found", detail: { rel, abs } }
  }

  const ext = path.extname(abs).toLowerCase()
  return {
    ok: true,
    body: fs.readFileSync(abs),
    contentType: MIME[ext] || "application/octet-stream",
    absPath: abs,
  }
}
