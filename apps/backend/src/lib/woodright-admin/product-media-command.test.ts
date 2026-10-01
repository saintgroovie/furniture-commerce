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

describe("decideMove and decideDetach", () => {
  const images = [
    { id: "img_1", url: "https://cdn.example/a.jpg" },
    { id: "img_2", url: "https://cdn.example/b.jpg" },
  ]

  it("swaps only the chosen frame", async () => {
    const { decideMove, decideDetach } = await import("./product-media-command.ts")
    const moved = decideMove(images, images[1]!.url, "up")
    assert.equal(moved.ok, true)
    if (moved.ok) assert.deepEqual(moved.images.map((image) => image.id), ["img_2", "img_1"])
    const detached = decideDetach(images, images[0]!.url, images[0]!.url)
    assert.equal(detached.ok, true)
    if (detached.ok) {
      assert.equal(detached.thumbnail, null)
      assert.deepEqual(detached.images.map((image) => image.id), ["img_2"])
    }
  })
})
