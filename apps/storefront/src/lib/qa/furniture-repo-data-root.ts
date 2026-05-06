import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"

/**
 * Resolve furniture-commerce repo root for reading `data/normalized/*.json`
 * from the Next storefront (cwd may be `apps/storefront`, repo root, or elsewhere).
 *
 * Markers: `docs/project/CODEMAP.md` and `data/normalized` (directory).
 *
 * Override: set `FURNITURE_REPO_ROOT` to the absolute path of the repo root when
 * auto-detection fails (Docker, custom monorepo layout, or bundled `__dirname` outside the tree).
 */
const MARKER_CODEMAP = path.join("docs", "project", "CODEMAP.md")
const MARKER_DATA_NORMALIZED = path.join("data", "normalized")

export const FURNITURE_REPO_MARKERS_DESC = "docs/project/CODEMAP.md and data/normalized/"

/**
 * Optional dev-only JSON copies under `apps/storefront/qa-data/oxford-local-mvp/`
 * when Docker (or other runtimes) cannot mount repo `data/` + `docs/` into `/app`.
 * Populate with `node apps/storefront/scripts/sync-oxford-local-mvp-qa-json.mjs` from repo root.
 */
export function oxfordLocalMvpQaSnapshotPathCandidates(relFromRepoRoot: string): string[] {
  if (!relFromRepoRoot.includes("oxford-local-mvp")) return []
  const bn = path.basename(relFromRepoRoot)
  return [path.join(process.cwd(), "qa-data", "oxford-local-mvp", bn)]
}

function dirHasRepoMarkers(absDir: string): boolean {
  return fs.existsSync(path.join(absDir, MARKER_CODEMAP)) && fs.existsSync(path.join(absDir, MARKER_DATA_NORMALIZED))
}

function walkUpForRoot(startAbs: string, maxDepth: number): string | null {
  let cur = path.resolve(startAbs)
  for (let i = 0; i < maxDepth; i++) {
    if (dirHasRepoMarkers(cur)) return cur
    const parent = path.dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return null
}

function thisModuleDir(): string {
  try {
    if (typeof import.meta !== "undefined" && import.meta.url) {
      return path.dirname(fileURLToPath(import.meta.url))
    }
  } catch {
    /* ignore */
  }
  return typeof __dirname !== "undefined" ? __dirname : process.cwd()
}

export type FurnitureRepoDataResolution = {
  repoRoot: string | null
  /** Absolute paths used as walk-up seeds */
  seedsTried: string[]
  cwd: string
}

function computeResolution(): FurnitureRepoDataResolution {
  const cwd = process.cwd()
  const seedsTried: string[] = []
  const seeds: string[] = []

  const push = (abs: string) => {
    const r = path.resolve(abs)
    if (!seeds.includes(r)) {
      seeds.push(r)
      seedsTried.push(r)
    }
  }

  const envRoot = (process.env.FURNITURE_REPO_ROOT || process.env.FURNITURE_COMMERCE_ROOT || "").trim()
  if (envRoot) {
    push(envRoot)
  }

  push(cwd)
  push(path.resolve(cwd, ".."))
  push(path.resolve(cwd, "..", ".."))
  push(path.resolve(cwd, "..", "..", ".."))

  try {
    push(thisModuleDir())
  } catch {
    /* ignore */
  }

  for (const seed of seeds) {
    const found = walkUpForRoot(seed, 28)
    if (found) return { repoRoot: found, seedsTried, cwd }
  }

  return { repoRoot: null, seedsTried, cwd }
}

let memo: FurnitureRepoDataResolution | undefined

export function getFurnitureRepoDataResolution(): FurnitureRepoDataResolution {
  if (!memo) memo = computeResolution()
  return memo
}

/** @internal tests only */
export function __resetFurnitureRepoDataResolutionMemo(): void {
  memo = undefined
}
