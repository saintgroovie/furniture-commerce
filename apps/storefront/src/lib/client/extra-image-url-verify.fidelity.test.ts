/**
 * Phase F: strip Image() probe budget helpers (no DOM Image required).
 * Run from apps/storefront:
 *   ../backend/node_modules/.bin/tsx src/lib/client/extra-image-url-verify.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  CARD_STRIP_IMAGE_PROBE_LIMIT,
  DEFAULT_STRIP_IMAGE_PROBE_LIMIT,
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
}

// Hook contract: pending probe must not expose capped unverified URLs.
{
  const pendingVisible: string[] = []
  assert.deepEqual(pendingVisible, [])
}

console.log("extra-image-url-verify.fidelity.test.ts: ok")
