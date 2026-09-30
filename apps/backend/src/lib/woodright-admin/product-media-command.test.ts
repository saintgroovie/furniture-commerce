import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { decideHeroThumbnail } from "./product-media-command.ts"

describe("decideHeroThumbnail", () => {
  it("sets hero only from an image already on the product", () => {
    const decision = decideHeroThumbnail(
      [{ id: "img_1", url: "https://cdn.example/a.jpg" }],
      null,
      "https://cdn.example/a.jpg"
    )
    assert.equal(decision.ok, true)
    if (decision.ok) assert.equal(decision.thumbnail, "https://cdn.example/a.jpg")
  })

  it("refuses a candidate that is not already attached", () => {
    const decision = decideHeroThumbnail([], null, "https://cdn.example/candidate.jpg")
    assert.equal(decision.ok, false)
  })
})
