/**
 * Phase F / recovery: strip Image() probe helpers (no DOM Image required).
 * Run from apps/storefront:
 *   ../backend/node_modules/.bin/tsx src/lib/client/extra-image-url-verify.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  CARD_STRIP_IMAGE_PROBE_LIMIT,
  DEFAULT_STRIP_IMAGE_PROBE_LIMIT,
  STRIP_IMAGE_PROBE_TIMEOUT_MS,
  selectUrlsToProbe,
} from "./extra-image-url-verify"

{
  const urls = Array.from({ length: 20 }, (_, i) => `https://example.test/${i}.jpg`)
  assert.equal(selectUrlsToProbe(urls).length, DEFAULT_STRIP_IMAGE_PROBE_LIMIT)
  assert.equal(
    selectUrlsToProbe(urls, CARD_STRIP_IMAGE_PROBE_LIMIT).length,
    CARD_STRIP_IMAGE_PROBE_LIMIT
  )
  assert.deepEqual(
    selectUrlsToProbe(urls, CARD_STRIP_IMAGE_PROBE_LIMIT),
    urls.slice(0, 4)
  )
}

{
  assert.deepEqual(
    selectUrlsToProbe(["", "  ", "a.jpg", "b.jpg"], 4),
    ["a.jpg", "b.jpg"]
  )
  assert.deepEqual(selectUrlsToProbe(["a.jpg"], 0), [])
  assert.equal(CARD_STRIP_IMAGE_PROBE_LIMIT, 4)
  assert.equal(DEFAULT_STRIP_IMAGE_PROBE_LIMIT, 12)
  assert.ok(
    STRIP_IMAGE_PROBE_TIMEOUT_MS >= 1000 && STRIP_IMAGE_PROBE_TIMEOUT_MS <= 8000,
    "PDP probe timeout must be bounded"
  )
}

{
  const here = path.dirname(fileURLToPath(import.meta.url))
  const verifySrc = readFileSync(
    path.join(here, "extra-image-url-verify.ts"),
    "utf8"
  )
  assert.equal(
    /probeGate|STRIP_IMAGE_PROBE_MAX_CONCURRENT|acquireProbeSlot/.test(verifySrc),
    false,
    "no process-wide probe gate (catalog stampede regression)"
  )
  const hookSrc = readFileSync(
    path.resolve(here, "../../components/use-verified-strip-extras.ts"),
    "utf8"
  )
  assert.equal(
    /setTimeout\(\s*\([^)]*\)\s*=>\s*\{\s*\},\s*400\)|setTimeout\([^,]+,\s*400\)/.test(
      hookSrc
    ),
    false,
    "no 400ms probe retry wave"
  )
  assert.match(hookSrc, /mode === "optimistic"/)
  const coreSrc = readFileSync(
    path.resolve(here, "../../components/product-card-media-gallery-core.tsx"),
    "utf8"
  )
  assert.match(
    coreSrc,
    /mode:\s*"optimistic"/,
    "catalog strip must use optimistic mode"
  )
}

console.log("extra-image-url-verify.fidelity.test.ts: ok")
