import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildAttachPayload,
  buildGalleryView,
  buildImagesReplacementPayload,
  buildUnlinkPayload,
  filterGalleryCards,
  mediaFingerprint,
  moveId,
  validateUploadFile,
} from "./gallery-model.ts"
import { mediaUrlIdentityKey, toRelativeMediaPath } from "./media-url.ts"

describe("media url", () => {
  it("strips host but preserves path case", () => {
    assert.equal(
      toRelativeMediaPath("http://localhost:9000/static/FooBar.PNG"),
      "/static/FooBar.PNG"
    )
    assert.equal(mediaUrlIdentityKey("http://x/static/A.jpg"), "/static/A.jpg")
    assert.notEqual(
      mediaUrlIdentityKey("/static/A.jpg"),
      mediaUrlIdentityKey("/static/a.jpg")
    )
  })
})

describe("gallery view", () => {
  it("marks thumbnail outside images and exact duplicates", () => {
    const view = buildGalleryView({
      product: {
        id: "p1",
        updated_at: "t1",
        thumbnail: "https://cdn/main.jpg",
        images: [
          { id: "i1", url: "https://cdn/a.jpg" },
          { id: "i2", url: "https://cdn/a.jpg" },
          { id: "i3", url: "https://cdn/b.jpg" },
        ],
      },
      stockAdminPath: (id) => `/app/products/${id}`,
    })
    assert.equal(view.image_count, 3)
    assert.equal(view.thumbnail_outside_images, true)
    assert.equal(view.exact_duplicate_count, 2)
    assert.ok(view.warnings.some((w) => /вне списка/i.test(w)))
  })

  it("filters and fingerprints", () => {
    const product = {
      id: "p1",
      updated_at: "t1",
      thumbnail: "https://cdn/a.jpg",
      images: [
        { id: "i1", url: "https://cdn/a.jpg" },
        { id: "i2", url: "https://cdn/b.jpg" },
      ],
    }
    const view = buildGalleryView({
      product,
      stockAdminPath: () => "/x",
    })
    assert.equal(filterGalleryCards(view.cards, "main", "").length, 1)
    assert.equal(mediaFingerprint(product), view.fingerprint)
  })
})

describe("payloads", () => {
  const snap = [
    { id: "i1", url: "https://h/static/a.jpg" },
    { id: "i2", url: "https://h/static/b.jpg" },
  ]

  it("reorder keeps all ids", () => {
    const built = buildImagesReplacementPayload({
      snapshot: snap,
      nextOrderedIds: ["i2", "i1"],
    })
    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.deepEqual(
      built.images.map((i) => i.id),
      ["i2", "i1"]
    )
  })

  it("blocks last-image unlink and empty", () => {
    assert.deepEqual(buildUnlinkPayload({ snapshot: [snap[0]], removeId: "i1" }), {
      ok: false,
      code: "last_image",
    })
    assert.equal(
      buildImagesReplacementPayload({ snapshot: snap, nextOrderedIds: [] }).ok,
      false
    )
    const unlink = buildUnlinkPayload({ snapshot: snap, removeId: "i1" })
    assert.equal(unlink.ok, true)
    if (!unlink.ok) return
    assert.equal(unlink.images.length, 1)
    assert.equal(unlink.nextThumbnailUrl, "/static/b.jpg")
  })

  it("rejects snapshot rows without id", () => {
    const bad = buildAttachPayload({
      snapshot: [{ url: "/static/x.jpg" }],
      newUrls: ["/static/y.jpg"],
    })
    assert.deepEqual(bad, { ok: false, code: "snapshot_invalid" })
  })

  it("attach appends relative urls", () => {
    const built = buildAttachPayload({
      snapshot: snap,
      newUrls: ["http://localhost:9001/static/new.png"],
    })
    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.images.length, 3)
    assert.equal(built.images[2].url, "/static/new.png")
  })

  it("moveId and upload validation", () => {
    assert.deepEqual(moveId(["a", "b", "c"], "c", "start"), ["c", "a", "b"])
    assert.equal(validateUploadFile({ name: "x.png", type: "image/png", size: 10 }).ok, true)
    assert.equal(validateUploadFile({ name: "x.png", type: "image/png", size: 0 }).ok, false)
    assert.equal(
      validateUploadFile({ name: "x.txt", type: "text/plain", size: 10 }).ok,
      false
    )
  })
})
