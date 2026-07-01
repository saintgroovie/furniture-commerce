import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, it } from "node:test"
import { finalizeOrPruneViteCache } from "./finalize-vite-cache.mjs"

const tmpRoots = []

function makeCacheDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "woodright-vite-cache-"))
  tmpRoots.push(dir)
  return dir
}

// Orphan fixtures represent a temp dir abandoned by an already-dead process —
// age its mtime so the liveness check (fresh-mtime = "still being written")
// doesn't mistake a test fixture for an in-progress optimize-deps run.
function ageDir(dirPath) {
  const old = new Date(Date.now() - 5 * 60 * 1000)
  for (const entry of fs.readdirSync(dirPath)) {
    fs.utimesSync(path.join(dirPath, entry), old, old)
  }
  fs.utimesSync(dirPath, old, old)
}

afterEach(() => {
  while (tmpRoots.length) {
    fs.rmSync(tmpRoots.pop(), { recursive: true, force: true })
  }
})

describe("finalizeOrPruneViteCache", () => {
  it("renames single deps_temp into deps", () => {
    const cacheDir = makeCacheDir()
    const tempDir = path.join(cacheDir, "deps_temp_abc")
    fs.mkdirSync(tempDir, { recursive: true })
    fs.writeFileSync(path.join(tempDir, "chunk.js"), "ok")
    ageDir(tempDir)

    finalizeOrPruneViteCache(cacheDir)

    assert.equal(fs.existsSync(path.join(cacheDir, "deps", "chunk.js")), true)
    assert.equal(fs.existsSync(tempDir), false)
  })

  it("prunes orphan temps when deps already exists", () => {
    const cacheDir = makeCacheDir()
    const depsDir = path.join(cacheDir, "deps")
    fs.mkdirSync(depsDir, { recursive: true })
    fs.writeFileSync(path.join(depsDir, "keep.js"), "keep")
    const orphan = path.join(cacheDir, "deps_temp_orphan")
    fs.mkdirSync(orphan)
    ageDir(orphan)

    finalizeOrPruneViteCache(cacheDir)

    assert.equal(fs.existsSync(orphan), false)
    assert.equal(fs.readFileSync(path.join(depsDir, "keep.js"), "utf8"), "keep")
  })

  it("removes multiple temps when deps is missing", () => {
    const cacheDir = makeCacheDir()
    const a = path.join(cacheDir, "deps_temp_a")
    const b = path.join(cacheDir, "deps_temp_b")
    fs.mkdirSync(a)
    fs.mkdirSync(b)
    ageDir(a)
    ageDir(b)

    finalizeOrPruneViteCache(cacheDir)

    assert.equal(fs.existsSync(path.join(cacheDir, "deps")), false)
    assert.equal(
      fs.readdirSync(cacheDir).filter((e) => e.startsWith("deps_temp_")).length,
      0,
    )
  })

  it("removes duplicate deps folders like deps 2", () => {
    const cacheDir = makeCacheDir()
    const depsDir = path.join(cacheDir, "deps")
    fs.mkdirSync(depsDir, { recursive: true })
    fs.writeFileSync(path.join(depsDir, "keep.js"), "keep")
    const dup = path.join(cacheDir, "deps 2")
    fs.mkdirSync(dup)

    finalizeOrPruneViteCache(cacheDir)

    assert.equal(fs.existsSync(dup), false)
    assert.equal(fs.readFileSync(path.join(depsDir, "keep.js"), "utf8"), "keep")
  })

  it("REGRESSION GUARD: a second call for the same cacheDir is a no-op (does not touch a live, in-progress optimize-deps)", () => {
    // `medusa-config.ts` calls this at module top-level; backend HMR (MEDUSA_FF_BACKEND_HMR)
    // can re-import that module on every restart, which would otherwise re-run this prune
    // mid-session and corrupt a live Vite deps cache that the still-running Vite middleware
    // is actively writing to (deps_temp_* from an in-progress, not-yet-finished optimize-deps).
    const cacheDir = makeCacheDir()
    const tempDir1 = path.join(cacheDir, "deps_temp_first")
    fs.mkdirSync(tempDir1, { recursive: true })
    fs.writeFileSync(path.join(tempDir1, "chunk.js"), "ok")
    ageDir(tempDir1)

    finalizeOrPruneViteCache(cacheDir)
    assert.equal(fs.existsSync(path.join(cacheDir, "deps", "chunk.js")), true)

    // Simulates a live optimize-deps started by the still-running Vite middleware
    // AFTER the first finalize call (i.e. mid Vite-session, not at cold start).
    const tempDir2 = path.join(cacheDir, "deps_temp_inflight")
    fs.mkdirSync(tempDir2, { recursive: true })
    fs.writeFileSync(path.join(tempDir2, "still-writing.js"), "in-progress")

    finalizeOrPruneViteCache(cacheDir)

    assert.equal(
      fs.existsSync(tempDir2),
      true,
      "second call for the same cacheDir must not touch an in-flight deps_temp_*"
    )
  })

  it("REGRESSION GUARD: a freshly-touched deps_temp_* survives even from a brand-new JS realm (no globalThis guard)", () => {
    // Reproduces the Categories/Collections incident (2026-07-01): Medusa's
    // "restart on file change" watcher re-runs medusa-config.ts in a context whose
    // globalThis guard never fired, while the *previous* realm's Vite optimize-deps
    // is still actively writing into deps_temp_*. Simulated here by calling the
    // function for the FIRST time (fresh guard state) against a temp dir that was
    // just touched — it must be left alone regardless of any in-memory guard.
    const cacheDir = makeCacheDir()
    const liveTemp = path.join(cacheDir, "deps_temp_live")
    fs.mkdirSync(liveTemp, { recursive: true })
    fs.writeFileSync(path.join(liveTemp, "chunk.js"), "still-optimizing")

    finalizeOrPruneViteCache(cacheDir)

    assert.equal(
      fs.existsSync(liveTemp),
      true,
      "a deps_temp_* modified moments ago must never be pruned or renamed, even on the very first call"
    )
    assert.equal(fs.existsSync(path.join(cacheDir, "deps")), false)
  })

  it("still cleans up a genuinely stale/abandoned deps_temp_* (old mtime)", () => {
    const cacheDir = makeCacheDir()
    const staleTemp = path.join(cacheDir, "deps_temp_stale")
    fs.mkdirSync(staleTemp, { recursive: true })
    const chunkPath = path.join(staleTemp, "chunk.js")
    fs.writeFileSync(chunkPath, "abandoned")
    const old = new Date(Date.now() - 5 * 60 * 1000)
    fs.utimesSync(chunkPath, old, old)
    fs.utimesSync(staleTemp, old, old)

    finalizeOrPruneViteCache(cacheDir)

    assert.equal(fs.existsSync(path.join(cacheDir, "deps", "chunk.js")), true)
    assert.equal(fs.existsSync(staleTemp), false)
  })
})
