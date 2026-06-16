import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"

/**
 * v2-local repo root resolution for reading `data/normalized/*.json`.
 * Mirrors v1 QA board logic without importing `@/lib/qa/**`.
 */
const MARKER_CODEMAP = path.join("docs", "project", "CODEMAP.md")
const MARKER_DATA_NORMALIZED = path.join("data", "normalized")

export const ORPHAN_P0_OVERLAY_DATA_REL =
  "tmp/orphan-p0-refresh-2026-06-11/operator-decisions-top-50/assignment-board-candidate-pack/v2-overlay/orphan-p0-v2-overlay-data.json"

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

/** emergency-fix and similar checkouts may have normalized data without CODEMAP */
function dirHasNormalizedData(absDir: string): boolean {
  return fs.existsSync(path.join(absDir, MARKER_DATA_NORMALIZED))
}

function isUsableQaRepoRoot(absDir: string): boolean {
  return dirHasRepoMarkers(absDir) || dirHasNormalizedData(absDir)
}

export function hasOrphanP0OverlayArtifact(absDir: string): boolean {
  return fs.existsSync(path.join(absDir, ORPHAN_P0_OVERLAY_DATA_REL))
}

function resolveEnvRepoRoot(seedsTried: string[], cwd: string): FurnitureRepoDataResolution | null {
  const envRoot = (process.env.FURNITURE_REPO_ROOT || process.env.FURNITURE_COMMERCE_ROOT || "").trim()
  if (!envRoot) return null

  const abs = path.resolve(envRoot)
  seedsTried.push(abs)

  if (isUsableQaRepoRoot(abs) || hasOrphanP0OverlayArtifact(abs)) {
    return { repoRoot: abs, seedsTried, cwd }
  }

  return null
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

  const envResolved = resolveEnvRepoRoot(seedsTried, cwd)
  if (envResolved) return envResolved

  const push = (abs: string) => {
    const r = path.resolve(abs)
    if (!seeds.includes(r)) {
      seeds.push(r)
      seedsTried.push(r)
    }
  }

  const initCwd = (process.env.INIT_CWD || "").trim()
  if (initCwd) push(initCwd)

  push(cwd)
  push(path.resolve(cwd, ".."))
  push(path.resolve(cwd, "..", ".."))
  push(path.resolve(cwd, "..", "..", ".."))

  const envRoot = (process.env.FURNITURE_REPO_ROOT || process.env.FURNITURE_COMMERCE_ROOT || "").trim()
  // Sibling clone fallback only when env root is not set — avoid reading primary clone tmp.
  if (!envRoot && cwd.includes("furniture-commerce-emergency-fix")) {
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
    if (isUsableQaRepoRoot(seed) || hasOrphanP0OverlayArtifact(seed)) {
      return { repoRoot: path.resolve(seed), seedsTried, cwd }
    }
  }

  return { repoRoot: null, seedsTried, cwd }
}

let memo: FurnitureRepoDataResolution | undefined

export function getFurnitureRepoDataResolution(): FurnitureRepoDataResolution {
  if (!memo) memo = computeResolution()
  return memo
}
