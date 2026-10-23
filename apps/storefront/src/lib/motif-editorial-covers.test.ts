import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { editorialMotifCover, MOTIF_EDITORIAL_COVERS } from "./motif-editorial-covers"
const saved = process.env.WOODRIGHT_MOTIF_EDITORIAL_COVERS
try {
  delete process.env.WOODRIGHT_MOTIF_EDITORIAL_COVERS
  assert.equal(editorialMotifCover("fairies"), null)
  process.env.WOODRIGHT_MOTIF_EDITORIAL_COVERS = "1"
  assert.equal(Object.keys(MOTIF_EDITORIAL_COVERS).length, 15)
  for (const [slug, url] of Object.entries(MOTIF_EDITORIAL_COVERS)) {
    assert.equal(editorialMotifCover(slug), url)
    assert.ok(existsSync(resolve(process.cwd(), "public", url.slice(1))), url)
  }
  for (const slug of ["brigantine-ivory", "royal-guardsmen", "sweet-home", "__proto__", "unknown"]) assert.equal(editorialMotifCover(slug), null)
} finally {
  if (saved == null) delete process.env.WOODRIGHT_MOTIF_EDITORIAL_COVERS
  else process.env.WOODRIGHT_MOTIF_EDITORIAL_COVERS = saved
}
console.log("motif-editorial-covers.test.ts: ok")
