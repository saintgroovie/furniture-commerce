import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { sniffImage, validateUpload } from "./media-bytes.ts"

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
)

describe("validateUpload", () => {
  it("accepts a decodable PNG and ignores the client name", async () => {
    assert.equal(sniffImage(PNG), "png")
    const result = await validateUpload(PNG)
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.ext, "png")
  })

  it("rejects HEIC and executables", async () => {
    const heic = Buffer.alloc(16)
    heic.write("ftypheic", 4, "ascii")
    const heicResult = await validateUpload(heic)
    assert.equal(heicResult.ok, false)
    if (!heicResult.ok) assert.match(heicResult.message, /HEIC/)
    const exe = Buffer.from([0x4d, 0x5a, 0x00, 0x00])
    const exeResult = await validateUpload(exe)
    assert.equal(exeResult.ok, false)
  })
})
