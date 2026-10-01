import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (name === "route.ts") out.push(path)
  }
  return out
}

describe("desk write routes", () => {
  it("gates every woodright admin write handler", () => {
    const root = join(import.meta.dirname, "../../api/admin/woodright")
    const missing: string[] = []
    for (const path of walk(root)) {
      const source = readFileSync(path, "utf8")
      const writes = /export async function (POST|PUT|DELETE)/.test(source)
      if (writes && !source.includes("requireDeskWrite")) missing.push(path)
    }
    assert.deepEqual(missing, [])
  })
})
