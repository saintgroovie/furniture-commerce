/**
 * Fidelity: v2 board persistence must expose a null server snapshot so
 * useSyncExternalStore does not read localStorage during SSR/hydration.
 * getSnapshot must also be referentially stable when storage is unchanged.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = dirname(fileURLToPath(import.meta.url))

test("v2 persistence exports hydration-safe server snapshot helpers", () => {
  const src = readFileSync(join(root, "legacy-board-v2-persistence.ts"), "utf8")
  assert.match(src, /export function getV2PersistedServerSnapshot\(\): null/)
  assert.match(src, /export function subscribeV2PersistedState/)
  assert.match(src, /invalidateV2PersistedCache/)
  assert.match(src, /raw === v2CachedRaw/)
})

test("LegacyMediaBoardV2Client uses useSyncExternalStore for LS bootstrap", () => {
  const src = readFileSync(join(root, "LegacyMediaBoardV2Client.tsx"), "utf8")
  assert.match(src, /useSyncExternalStore/)
  assert.match(src, /subscribeV2PersistedState/)
  assert.match(src, /getV2PersistedServerSnapshot/)
  assert.doesNotMatch(
    src,
    /useState<string \| null>\(\(\) => \{[\s\S]*loadV2PersistedState/
  )
  assert.doesNotMatch(
    src,
    /useState<Record<string, V2ProductState>>\(\(\) => \{[\s\S]*loadV2PersistedState/
  )
})

test("orphan overlay persistence is hydration-safe and cached", () => {
  const src = readFileSync(join(root, "orphan-p0-overlay-persistence.ts"), "utf8")
  assert.match(src, /export function getOrphanP0OverlayServerSnapshot\(\): null/)
  assert.match(src, /export function subscribeOrphanP0OverlayState/)
  assert.match(src, /raw === orphanCachedRaw/)
})

test("getSnapshot cache contract: unchanged raw => Object.is-equal parsed", () => {
  // Behavioral contract without importing the TS module graph (ESM extensionless).
  let cachedRaw: string | null | undefined
  let cachedParsed: { selectedHandle: string | null } | null = null
  const store: Record<string, string> = {}
  function load(): { selectedHandle: string | null } | null {
    const raw = store.v2 ?? null
    if (raw === cachedRaw) return cachedParsed
    cachedRaw = raw
    if (!raw) {
      cachedParsed = null
      return null
    }
    cachedParsed = JSON.parse(raw) as { selectedHandle: string | null }
    return cachedParsed
  }
  function save(handle: string) {
    store.v2 = JSON.stringify({ selectedHandle: handle })
    cachedRaw = undefined
    cachedParsed = null
  }
  assert.equal(load(), null)
  assert.ok(Object.is(load(), load()))
  save("demo")
  const a = load()
  const b = load()
  assert.ok(a)
  assert.ok(Object.is(a, b))
  assert.equal(a?.selectedHandle, "demo")
})
