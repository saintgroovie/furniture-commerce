/**
 * Fidelity: QA board preview proxy uses relative API paths + hostname
 * classification (Contract A). Must not hardcode scheme-qualified production apex.
 */
import assert from "node:assert/strict"
import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import {
  candidatePreviewSrc,
  poolMediaPreviewSrc,
  shouldProxyRemotePreviewUrl,
} from "./approval-board-preview"
import type { ChecklistItem, PoolMediaRef } from "./approval-board-types"

const here = path.dirname(fileURLToPath(import.meta.url))

const FORBIDDEN_APEX = "https://" + "woodright.ru"
const FORBIDDEN_WWW = "https://" + "www.woodright.ru"
const FORBIDDEN_API = "https://" + "api.woodright.ru"

function assertSourceHasNoSchemeQualifiedProductionApex(rel: string) {
  const abs = path.join(here, rel)
  const text = fs.readFileSync(abs, "utf8")
  assert.ok(!text.includes(FORBIDDEN_APEX), `${rel} must not contain scheme-qualified production apex`)
  assert.ok(!text.includes(FORBIDDEN_WWW), `${rel} must not contain www production apex`)
  assert.ok(!text.includes(FORBIDDEN_API), `${rel} must not contain production API apex`)
}

assertSourceHasNoSchemeQualifiedProductionApex("approval-board-preview.ts")
assertSourceHasNoSchemeQualifiedProductionApex("api/preview/route.ts")

assert.equal(shouldProxyRemotePreviewUrl("http://localhost:3002/x.jpg"), true)
assert.equal(shouldProxyRemotePreviewUrl("http://127.0.0.1:9000/x.jpg"), true)
assert.equal(shouldProxyRemotePreviewUrl(FORBIDDEN_APEX + "/images/a.jpg"), true)
assert.equal(shouldProxyRemotePreviewUrl(FORBIDDEN_WWW + "/images/a.jpg"), true)
assert.equal(shouldProxyRemotePreviewUrl("https://cdn.example.com/a.jpg"), false)
assert.equal(shouldProxyRemotePreviewUrl("https://woodright-demo.ru/a.jpg"), false)
assert.equal(shouldProxyRemotePreviewUrl("not-a-url"), false)

function poolRef(partial: Partial<PoolMediaRef>): PoolMediaRef {
  return {
    id: "t1",
    kind: "inventory",
    label: "t",
    filename: null,
    preview_repo_rel: null,
    preview_url: null,
    source_type: null,
    ...partial,
  }
}

const proxied = poolMediaPreviewSrc(poolRef({ preview_url: FORBIDDEN_APEX + "/images/a.jpg" }))
assert.ok(proxied)
assert.ok(proxied!.startsWith("/qa/legacy-site-media-approval-board/api/preview?url="))
assert.ok(!proxied!.startsWith("http"))

const passthrough = poolMediaPreviewSrc(poolRef({ preview_url: "https://cdn.example.com/a.jpg" }))
assert.equal(passthrough, "https://cdn.example.com/a.jpg")

const local = poolMediaPreviewSrc(poolRef({ preview_repo_rel: "tmp/x.jpg" }))
assert.equal(
  local,
  "/qa/legacy-site-media-approval-board/api/preview?repoRel=" + encodeURIComponent("tmp/x.jpg")
)

const candidate = candidatePreviewSrc({
  candidate_id: "c1",
  handle: "x",
  filename: "a.jpg",
  url: FORBIDDEN_APEX + "/images/b.jpg",
  source_page: "",
  collection: "",
  role_guess: "",
  color_guess: "",
  confidence: 0,
  designer_decision: "pending",
  notes: "",
  local_preview: null,
} as ChecklistItem)
assert.ok(candidate.startsWith("/qa/legacy-site-media-approval-board/api/preview?url="))

console.log("PASS approval-board-preview fidelity (Contract A relative proxy)")
