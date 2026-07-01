import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))

describe("link-admin-build.mjs", () => {
  it("symlinks dist/public/admin to public/admin", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wr-admin-link-"))
    const distAdmin = path.join(tmp, "dist/public/admin")
    fs.mkdirSync(distAdmin, { recursive: true })
    fs.writeFileSync(path.join(distAdmin, "index.html"), "<html>ok</html>")

    const script = path.join(scriptsDir, "link-admin-build.mjs")
    const result = spawnSync(process.execPath, [script], {
      cwd: tmp,
      env: { ...process.env },
      encoding: "utf8",
    })

    assert.equal(result.status, 0)
    assert.equal(fs.existsSync(path.join(tmp, "public/admin/index.html")), true)
    const linked = fs.readlinkSync(path.join(tmp, "public/admin"))
    assert.ok(linked.includes("dist/public/admin"))
  })
})
