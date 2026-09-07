import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { resolveAdminImageSrc } from "./site-status-labels.ts"

describe("resolveAdminImageSrc", () => {
  it("rewrites localhost:9000/static to a same-origin path", () => {
    assert.equal(
      resolveAdminImageSrc(
        "http://localhost:9000/static/1788522107457-qa-aw-50174ba.png"
      ),
      "/static/1788522107457-qa-aw-50174ba.png"
    )
    assert.equal(
      resolveAdminImageSrc(
        "HTTP://localhost:9000/static/1788522107457-qa-aw-50174ba.png"
      ),
      "/static/1788522107457-qa-aw-50174ba.png"
    )
  })

  it("rewrites 127.0.0.1:9000/static to a same-origin path", () => {
    assert.equal(
      resolveAdminImageSrc(
        "http://127.0.0.1:9000/static/products/oliver/ol-01-1.png"
      ),
      "/static/products/oliver/ol-01-1.png"
    )
  })

  it("rewrites loopback /uploads and keeps query + hash", () => {
    assert.equal(
      resolveAdminImageSrc("http://localhost:9143/uploads/x.png?v=1#frag"),
      "/uploads/x.png?v=1#frag"
    )
  })

  it("rewrites IPv6 loopback static when the URL parser yields ::1", () => {
    assert.equal(
      resolveAdminImageSrc("http://[::1]:9000/static/foo.png"),
      "/static/foo.png"
    )
  })

  it("leaves external HTTPS static/upload URLs unchanged", () => {
    assert.equal(
      resolveAdminImageSrc("https://cdn.example.com/static/foo.png"),
      "https://cdn.example.com/static/foo.png"
    )
    assert.equal(
      resolveAdminImageSrc("https://storage.example.com/uploads/foo.png"),
      "https://storage.example.com/uploads/foo.png"
    )
    assert.equal(
      resolveAdminImageSrc("https://woodright.ru/image.jpg"),
      "https://woodright.ru/image.jpg"
    )
  })

  it("does not rewrite unrelated localhost API URLs", () => {
    assert.equal(
      resolveAdminImageSrc("http://localhost:9000/admin/products"),
      "http://localhost:9000/admin/products"
    )
    assert.equal(
      resolveAdminImageSrc("http://localhost:9000/store/products"),
      "http://localhost:9000/store/products"
    )
    assert.equal(
      resolveAdminImageSrc("http://localhost:9000/health"),
      "http://localhost:9000/health"
    )
  })

  it("leaves existing relative media paths unchanged", () => {
    assert.equal(resolveAdminImageSrc("/static/a.png"), "/static/a.png")
    assert.equal(resolveAdminImageSrc("/uploads/a.png"), "/uploads/a.png")
    assert.equal(
      resolveAdminImageSrc("/product-static/foo.png"),
      "/product-static/foo.png"
    )
    assert.equal(resolveAdminImageSrc("static/a.png"), "/static/a.png")
  })

  it("does not crash on empty or malformed strings", () => {
    assert.equal(resolveAdminImageSrc(""), "")
    assert.equal(resolveAdminImageSrc("   "), "")
    assert.equal(resolveAdminImageSrc("http://"), "http://")
    assert.equal(resolveAdminImageSrc("not a url"), "not a url")
  })
})
