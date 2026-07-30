/**
 * Fidelity: v2 board persistence must expose a null server snapshot so
 * useSyncExternalStore does not read localStorage during SSR/hydration.
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
  assert.match(src, /notifyV2PersistedListeners/)
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

test("orphan overlay persistence is hydration-safe", () => {
  const src = readFileSync(join(root, "orphan-p0-overlay-persistence.ts"), "utf8")
  assert.match(src, /export function getOrphanP0OverlayServerSnapshot\(\): null/)
  assert.match(src, /export function subscribeOrphanP0OverlayState/)
})
