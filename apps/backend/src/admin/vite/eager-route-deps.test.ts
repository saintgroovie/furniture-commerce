import { describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { woodrightAdminEagerRouteDepsChunks } from "./eager-route-deps"

function makeDistDir() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "woodright-eager-deps-"))
  const distDir = path.join(cwd, "node_modules/@medusajs/dashboard/dist")
  fs.mkdirSync(distDir, { recursive: true })
  return { cwd, distDir }
}

describe("woodrightAdminEagerRouteDepsChunks", () => {
  it("returns the absolute path of every category/collection .mjs chunk", () => {
    const { cwd, distDir } = makeDistDir()
    const wanted = [
      "categories-metadata-ZTS5U7SC.mjs",
      "category-create-FAMGO2CT.mjs",
      "category-detail-Z6JXVSK2.mjs",
      "category-edit-J3WTBDSJ.mjs",
      "category-list-ZGR6UFMW.mjs",
      "category-organize-ROASUZ4U.mjs",
      "category-products-7BZFHBYB.mjs",
      "collection-add-products-5YBDJ44K.mjs",
      "collection-create-HWE7JJGE.mjs",
      "collection-detail-ARG3NJAG.mjs",
      "collection-edit-ZNSFVC2F.mjs",
      "collection-list-26KI3WF2.mjs",
      "collection-metadata-5CQK6KBT.mjs",
    ]
    for (const name of wanted) {
      fs.writeFileSync(path.join(distDir, name), "")
    }
    // unrelated chunks and non-.mjs files must NOT be pulled in
    fs.writeFileSync(path.join(distDir, "order-list-677Z6QGZ.mjs"), "")
    fs.writeFileSync(path.join(distDir, "app.mjs"), "")
    fs.writeFileSync(path.join(distDir, "category-list-ZGR6UFMW.mjs.map"), "")

    const chunks = woodrightAdminEagerRouteDepsChunks(cwd)

    expect(chunks.sort()).toEqual(wanted.map((name) => path.join(distDir, name)).sort())
    for (const chunk of chunks) {
      expect(path.isAbsolute(chunk)).toBe(true)
    }
  })

  it("returns an empty array when @medusajs/dashboard isn't installed", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "woodright-eager-deps-missing-"))

    expect(woodrightAdminEagerRouteDepsChunks(cwd)).toEqual([])
  })

  it("does not include unrelated route chunks (e.g. orders, products)", () => {
    const { cwd, distDir } = makeDistDir()
    fs.writeFileSync(path.join(distDir, "order-list-AAAA1111.mjs"), "")
    fs.writeFileSync(path.join(distDir, "product-list-BBBB2222.mjs"), "")
    fs.writeFileSync(path.join(distDir, "category-list-CCCC3333.mjs"), "")

    const chunks = woodrightAdminEagerRouteDepsChunks(cwd)

    expect(chunks).toEqual([path.join(distDir, "category-list-CCCC3333.mjs")])
  })

  it("does not hardcode any content-hashed chunk filename", () => {
    const { cwd, distDir } = makeDistDir()
    fs.writeFileSync(path.join(distDir, "collection-list-FUTURE9999.mjs"), "")

    const chunks = woodrightAdminEagerRouteDepsChunks(cwd)

    expect(chunks).toEqual([path.join(distDir, "collection-list-FUTURE9999.mjs")])
  })
})
