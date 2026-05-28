import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"

const APPROVAL_PACK_REL = path.join(
  "tmp",
  "legacy-site-media-approval-pack",
  "designer-approval-checklist.json"
)

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

export type RepoRootResolution = {
  repoRoot: string | null
  approvalPackPath: string | null
  seedsTried: string[]
  cwd: string
}

function hasApprovalPack(absRoot: string): boolean {
  return fs.existsSync(path.join(absRoot, APPROVAL_PACK_REL))
}

function walkUpForRoot(startAbs: string, maxDepth: number): string | null {
  let cur = path.resolve(startAbs)
  for (let i = 0; i < maxDepth; i++) {
    if (hasApprovalPack(cur)) return cur
    const parent = path.dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return null
}

export function getEmergencyFixRepoResolution(): RepoRootResolution {
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

  const env = (process.env.FURNITURE_REPO_ROOT || process.env.EMERGENCY_FIX_REPO_ROOT || "").trim()
  if (env) push(env)

  push(cwd)
  push(path.resolve(cwd, ".."))
  push(path.resolve(cwd, "..", ".."))
  push(path.resolve(cwd, "..", "..", ".."))
  if (cwd.includes("furniture-commerce-emergency-fix")) {
    push(path.resolve(cwd))
  }
  try {
    push(thisModuleDir())
  } catch {
    /* ignore */
  }

  for (const seed of seeds) {
    const found = walkUpForRoot(seed, 24)
    if (found) {
      return {
        repoRoot: found,
        approvalPackPath: path.join(found, APPROVAL_PACK_REL),
        seedsTried,
        cwd,
      }
    }
  }

  return { repoRoot: null, approvalPackPath: null, seedsTried, cwd }
}

export function approvalPackDir(repoRoot: string): string {
  return path.join(repoRoot, "tmp", "legacy-site-media-approval-pack")
}
