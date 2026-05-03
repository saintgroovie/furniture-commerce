import * as fs from "fs"
import * as path from "path"

/**
 * Resolve furniture-commerce repo root for reading `data/normalized/*.json`
 * from the Next storefront (cwd may be `apps/storefront`, repo root, or elsewhere).
 *
 * Markers: `docs/project/CODEMAP.md` and `data/normalized` (directory).
 */
const MARKER_CODEMAP = path.join("docs", "project", "CODEMAP.md")
const MARKER_DATA_NORMALIZED = path.join("data", "normalized")

export const FURNITURE_REPO_MARKERS_DESC = "docs/project/CODEMAP.md and data/normalized/"

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

export type FurnitureRepoDataResolution = {
  repoRoot: string | null
  /** Absolute paths used as walk-up seeds */
  seedsTried: string[]
  cwd: string
}

function computeResolution(): FurnitureRepoDataResolution {
  const cwd = process.cwd()
  const seedsTried: string[] = []
  const seeds = new Set<string>()

  const absCwd = path.resolve(cwd)
  seeds.add(absCwd)
  seedsTried.push(absCwd)

  try {
    const fromFile = path.resolve(__dirname)
    if (!seeds.has(fromFile)) {
      seeds.add(fromFile)
      seedsTried.push(fromFile)
    }
  } catch {
    /* ignore */
  }

  for (const seed of Array.from(seeds)) {
    const found = walkUpForRoot(seed, 24)
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
