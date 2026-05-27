import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"

const AUDIT_REL = path.join("tmp", "source-media-completeness-audit-full-legacy-cache")

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

export type AuditRepoResolution = {
  repoRoot: string | null
  auditDir: string | null
  seedsTried: string[]
  cwd: string
}

function hasAuditDir(absRoot: string): boolean {
  return fs.existsSync(
    path.join(absRoot, AUDIT_REL, "source-orphan-priority-queue.json")
  )
}

function walkUpForRoot(startAbs: string, maxDepth: number): string | null {
  let cur = path.resolve(startAbs)
  for (let i = 0; i < maxDepth; i++) {
    if (hasAuditDir(cur)) return cur
    const parent = path.dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return null
}

export function getAuditRepoResolution(): AuditRepoResolution {
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
        auditDir: path.join(found, AUDIT_REL),
        seedsTried,
        cwd,
      }
    }
  }

  return { repoRoot: null, auditDir: null, seedsTried, cwd }
}

export function auditFile(repoRoot: string, ...parts: string[]): string {
  return path.join(repoRoot, AUDIT_REL, ...parts)
}
