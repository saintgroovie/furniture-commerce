import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { medusaBaseUrl, previewAllowed } from "./runtime-boundary.ts"

describe("previewAllowed", () => {
  it("stays closed unless both local flags are set", () => {
    assert.equal(previewAllowed({}), false)
    assert.equal(previewAllowed({ WOODRIGHT_WORKSPACE_FIXTURES: "1" }), false)
    assert.equal(
      previewAllowed({
        WOODRIGHT_WORKSPACE_FIXTURES: "1",
        WOODRIGHT_WORKSPACE_RUNTIME: "local-preview",
      }),
      true
    )
  })
})

describe("medusaBaseUrl", () => {
  it("returns an origin and refuses junk", () => {
    assert.equal(medusaBaseUrl({ MEDUSA_BACKEND_INTERNAL_URL: "http://127.0.0.1:9000/app" }), "http://127.0.0.1:9000")
    assert.equal(medusaBaseUrl({ MEDUSA_BACKEND_URL: "not a url" }), null)
  })
})
