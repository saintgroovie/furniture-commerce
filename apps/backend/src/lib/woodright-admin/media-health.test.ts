import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { partitionSellerMedia } from "./media-health.ts"

describe("partitionSellerMedia", () => {
  it("keeps general gallery photos separate from execution urls", () => {
    const product = {
      images: [{ url: "/static/products/co-05-1/main.jpg" }, { url: "/static/products/co-05-1/side.jpg" }],
      metadata: {
        finish_color_executions: [
          {
            key: "cream",
            label: "Молочный",
            urls: ["/static/products/co-05-1/cream-1.jpg", "/static/products/co-05-1/cream-2.jpg"],
          },
          {
            key: "blue",
            label: "Голубой",
            urls: ["/static/products/co-05-1/blue-1.jpg", "/static/products/co-05-1/blue-2.jpg"],
          },
          {
            key: "olive",
            label: "Оливковый",
            urls: ["/static/products/co-05-1/olive-1.jpg", "/static/products/co-05-1/olive-2.jpg"],
          },
          {
            key: "grey",
            label: "Серый",
            urls: ["/static/products/co-05-1/grey-1.jpg", "/static/products/co-05-1/grey-2.jpg"],
          },
        ],
      },
    }
    const imageUrls = [
      "/static/products/co-05-1/main.jpg",
      "/static/products/co-05-1/side.jpg",
      "/static/products/co-05-1/cream-1.jpg",
    ]
    const partitioned = partitionSellerMedia(imageUrls, product)
    assert.deepEqual(partitioned.general_image_urls, [
      "/static/products/co-05-1/main.jpg",
      "/static/products/co-05-1/side.jpg",
    ])
    assert.equal(partitioned.execution_photo_count, 8)
    assert.equal(partitioned.execution_finishes.length, 4)
    assert.equal(partitioned.execution_finishes[0]?.label, "Молочный")
    assert.equal(partitioned.execution_finishes[0]?.photo_count, 2)
  })
})
