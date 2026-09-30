import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"

const ROOT = path.resolve(import.meta.dirname, "..")

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) out.push(full)
  }
  return out
}

describe("browser boundary", () => {
  it("keeps mailbox and admin secrets out of client modules", () => {
    const files = walk(ROOT).filter((file) => readFileSync(file, "utf8").includes('"use client"'))
    assert.ok(files.length > 0)
    const forbidden = [
      "SMTP",
      "IMAP",
      "APP_PASSWORD",
      "WOODRIGHT_WORKSPACE_FIXTURES",
      "MEDUSA_BACKEND",
      "localStorage",
      "wr_desk",
    ]
    for (const file of files) {
      const source = readFileSync(file, "utf8")
      for (const token of forbidden) {
        assert.equal(source.includes(token), false, `${file} contains ${token}`)
      }
    }
  })
})
