import * as fs from "fs"
import * as path from "path"

/**
 * Allowlisted access to the private, out-of-repo Woodright legacy export root.
 *
 * READ-ONLY QA loader. Never writes, never used outside `/qa/legacy-media-public-crawl-board`.
 * Does not import anything from `legacy-media-assignment-board-v2` — that board's data model
 * (already-resolved Medusa handles) is not compatible with this unresolved public-crawl pack.
 *
 * Default path matches the 2026-07-07 public-crawl export produced by
 * `tools/legacy-media-census` + the public-crawl fallback scripts (see
 * candidate-pack README). Override with WOODRIGHT_PUBLIC_CRAWL_EXPORT_ROOT for a
 * different dated export without touching code.
 */
const DEFAULT_EXPORT_ROOT =
  "/Users/leonidmbp/Documents/woodright-legacy-private-export/2026-07-07"

export const PUBLIC_CRAWL_SITES = ["woodright-kids.ru", "woodright.ru"] as const
export type PublicCrawlSite = (typeof PUBLIC_CRAWL_SITES)[number]

export function isPublicCrawlSite(value: string | null | undefined): value is PublicCrawlSite {
  return !!value && (PUBLIC_CRAWL_SITES as readonly string[]).includes(value)
}

/** Mirrors `legacyMediaQaProdBlocked` pattern from the v2 board — duplicated intentionally
 * so this route has zero import coupling to the v2 board's code/data model. */
export function publicCrawlBoardProdBlocked(): boolean {
  return process.env.NODE_ENV === "production" && process.env.PUBLIC_CRAWL_BOARD_ALLOW_PROD !== "1"
}

function resolveExportRoot(): string {
  const envRoot = (process.env.WOODRIGHT_PUBLIC_CRAWL_EXPORT_ROOT || "").trim()
  return path.resolve(envRoot || DEFAULT_EXPORT_ROOT)
}

export type ExportRootResolution = {
  exportRoot: string
  exists: boolean
  candidatePackDir: string
  candidatePackExists: boolean
}

export function getExportRootResolution(): ExportRootResolution {
  const exportRoot = resolveExportRoot()
  const candidatePackDir = path.join(exportRoot, "candidate-pack", "public-crawl-v1")
  return {
    exportRoot,
    exists: fs.existsSync(exportRoot),
    candidatePackDir,
    candidatePackExists: fs.existsSync(candidatePackDir),
  }
}

/** Path-escape guard: resolved absolute path must stay within the allowlisted root. */
export function isWithinRoot(root: string, absTarget: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(absTarget)
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(resolvedRoot + path.sep)
}

/**
 * Defense-in-depth against symlink escape: resolves both `root` and `absTarget`
 * through the real filesystem (following any symlinks) and re-checks
 * containment on the resolved paths. Use in addition to `isWithinRoot`, right
 * before reading file bytes, once the target is known to exist.
 *
 * Returns `false` (fail closed) if either path cannot be resolved (e.g. does
 * not exist, permission error, broken symlink).
 */
export function isWithinRootRealpath(root: string, absTarget: string): boolean {
  try {
    const realRoot = fs.realpathSync(root)
    const realTarget = fs.realpathSync(absTarget)
    return realTarget === realRoot || realTarget.startsWith(realRoot + path.sep)
  } catch {
    return false
  }
}

export function candidateCsvPath(exportRoot: string, file: "kids" | "woodright" | "products-summary"): string {
  const dir = path.join(exportRoot, "candidate-pack", "public-crawl-v1")
  const name =
    file === "kids"
      ? "candidate-images-kids.csv"
      : file === "woodright"
        ? "candidate-images-woodright.csv"
        : "candidate-products-summary.csv"
  return path.join(dir, name)
}

export function suspiciousImagesCsvPath(exportRoot: string): string {
  return path.join(exportRoot, "reports", "public-crawl-suspicious-images.csv")
}

export function siteImagesRoot(exportRoot: string, site: PublicCrawlSite): string {
  return path.join(exportRoot, "raw", "public-crawl", site, "images")
}
