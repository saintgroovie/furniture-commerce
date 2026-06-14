import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"

export const PACKET_REL = path.join("tmp", "willie-winkie-flow-a-business-gate-packet")
export const MATRIX_JSON = "operator-fill-matrix.json"
export const FLOW_A_MEDIA_REL = path.join(
  "tmp",
  "flow-a-product-media-assignment-preflight-2026-06-12-1232",
  "flow-a-media-rows.json"
)

const MARKER = path.join(PACKET_REL, MATRIX_JSON)

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

export type GateRepoResolution = {
  repoRoot: string | null
  packetDir: string | null
  seedsTried: string[]
  cwd: string
}

function hasPacket(absRoot: string): boolean {
  return fs.existsSync(path.join(absRoot, MARKER))
}

function walkUp(startAbs: string, maxDepth: number): string | null {
  let cur = path.resolve(startAbs)
  for (let i = 0; i < maxDepth; i++) {
    if (hasPacket(cur)) return cur
    const parent = path.dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return null
}

export function getGateRepoResolution(): GateRepoResolution {
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
        packetDir: path.join(found, PACKET_REL),
        seedsTried,
        cwd,
      }
    }
  }

  return { repoRoot: null, packetDir: null, seedsTried, cwd }
}

export function packetFile(repoRoot: string, ...parts: string[]): string {
  return path.join(repoRoot, PACKET_REL, ...parts)
}
