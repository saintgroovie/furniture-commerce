import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"

/**
 * v2-local repo root resolution for reading `data/normalized/*.json`.
 * Mirrors v1 QA board logic without importing `@/lib/qa/**`.
 */
const MARKER_CODEMAP = path.join("docs", "project", "CODEMAP.md")
const MARKER_DATA_NORMALIZED = path.join("data", "normalized")

export const FURNITURE_REPO_MARKERS_DESC = "docs/project/CODEMAP.md and data/normalized/"

export const FURNITURE_REPO_EXPECTED_MARKER_RELPATHS = [MARKER_CODEMAP, MARKER_DATA_NORMALIZED] as const

export function legacyMediaQaRepoRootFailurePayload(resolution: FurnitureRepoDataResolution): Record<string, unknown> {
  const dockerish =
    resolution.cwd === "/app" ||
    resolution.seedsTried.some((p) => p === "/app" || p.startsWith("/app/"))
  const hintDocker =
    "Docker storefront: bind-mount repo ./data -> /app/data and ./docs -> /app/docs, then recreate storefront."
  const hintGeneral =
    "Set FURNITURE_REPO_ROOT to the absolute furniture-commerce repo path with docs/project/CODEMAP.md and data/normalized/, or run from a full checkout."
  return {
    error: "repo_root_not_resolved",
    cwd: resolution.cwd,
    checked_paths: resolution.seedsTried,
    expected_markers: [...FURNITURE_REPO_EXPECTED_MARKER_RELPATHS],
    hint: dockerish ? `${hintGeneral} ${hintDocker}` : hintGeneral,
  }
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
  if (envRoot) push(envRoot)

  const initCwd = (process.env.INIT_CWD || "").trim()
  if (initCwd) push(initCwd)

  push(cwd)
  push(path.resolve(cwd, ".."))
  push(path.resolve(cwd, "..", ".."))
  push(path.resolve(cwd, "..", "..", ".."))

  // Dev: emergency-fix checkout often lacks data/normalized; sibling furniture-commerce may have it.
  if (cwd.includes("furniture-commerce-emergency-fix")) {
    push(path.resolve(cwd, "../../../furniture-commerce"))
    push(path.resolve(cwd, "../../furniture-commerce"))
  }

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
