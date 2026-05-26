import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"

const MARKER = path.join("data", "normalized", "legacy-media-inventory.json")

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

export type DataRepoResolution = {
  dataRepoRoot: string | null
  seedsTried: string[]
  cwd: string
}

function hasMarker(abs: string): boolean {
  return fs.existsSync(path.join(abs, MARKER))
}

function walkUp(start: string, max = 28): string | null {
  let cur = path.resolve(start)
  for (let i = 0; i < max; i++) {
    if (hasMarker(cur)) return cur
    const parent = path.dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return null
}

export function getDataRepoRoot(): DataRepoResolution {
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

  const env = (process.env.FURNITURE_REPO_ROOT || process.env.FURNITURE_COMMERCE_ROOT || "").trim()
  if (env) push(env)

  push(cwd)
  push(path.resolve(cwd, ".."))
  push(path.resolve(cwd, "..", ".."))
  push(path.resolve(cwd, "..", "..", ".."))
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
    const found = walkUp(seed)
    if (found) return { dataRepoRoot: found, seedsTried, cwd }
  }

  return { dataRepoRoot: null, seedsTried, cwd }
}

export function readJsonFile<T>(repoRoot: string, rel: string): T | null {
  const abs = path.join(repoRoot, rel)
  if (!fs.existsSync(abs)) return null
  return JSON.parse(fs.readFileSync(abs, "utf8")) as T
}
