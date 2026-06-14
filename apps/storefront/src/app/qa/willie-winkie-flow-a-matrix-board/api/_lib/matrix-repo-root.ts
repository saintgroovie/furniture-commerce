import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"

export const MATRIX_TEMPLATE_REL = path.join(
  "tmp",
  "willie-winkie-flow-a-matrix-template"
)
export const FILLED_CSV = "vv-painting-sku-matrix-filled.csv"
export const TEMPLATE_JSON = "vv-painting-sku-matrix-template.json"
export const AFFECTED_HANDLES_REL = path.join(
  "tmp",
  "legacy-site-media-product-apply-dry-run-latest",
  "affected-handles.json"
)

const MARKER = path.join(MATRIX_TEMPLATE_REL, FILLED_CSV)

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

export type MatrixRepoResolution = {
  repoRoot: string | null
  matrixDir: string | null
  seedsTried: string[]
  cwd: string
}

function hasMatrixDir(absRoot: string): boolean {
  return fs.existsSync(path.join(absRoot, MARKER))
}

function walkUp(startAbs: string, maxDepth: number): string | null {
  let cur = path.resolve(startAbs)
  for (let i = 0; i < maxDepth; i++) {
    if (hasMatrixDir(cur)) return cur
    const parent = path.dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return null
}

export function getMatrixRepoResolution(): MatrixRepoResolution {
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
    const found = walkUp(seed, 28)
    if (found) {
      return {
        repoRoot: found,
        matrixDir: path.join(found, MATRIX_TEMPLATE_REL),
        seedsTried,
        cwd,
      }
    }
  }

  return { repoRoot: null, matrixDir: null, seedsTried, cwd }
}

export function matrixFile(repoRoot: string, ...parts: string[]): string {
  return path.join(repoRoot, MATRIX_TEMPLATE_REL, ...parts)
}

export function assertWritePath(absPath: string, repoRoot: string): void {
  const matrixDir = path.join(repoRoot, MATRIX_TEMPLATE_REL)
  const resolved = path.resolve(absPath)
  if (!resolved.startsWith(path.resolve(matrixDir))) {
    throw new Error("write_path_outside_matrix_template_dir")
  }
}
