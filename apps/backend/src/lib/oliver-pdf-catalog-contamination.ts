/**
 * Oliver PDF catalog page extracts (`Oliver_p##_i*.png`) must not replace SKU main images.
 * Example: `ol-00-1` (шкаф) got page-10 shelf crops instead of `OL-00-1_main.jpg`.
 */
import * as fs from "fs"
import * as path from "path"

const PDF_CATALOG_RE = /\/Oliver_p\d+_/i

export function isOliverPdfCatalogExtractUrl(url: string): boolean {
  return PDF_CATALOG_RE.test(url)
}

/** `ol-00-1` → `OL-00-1`; skips mirror derivative handles. */
export function oliverHandleToSkuCode(handle: string): string | null {
  const h = handle.toLowerCase()
  if (!/^ol-\d/.test(h)) return null
  if (h.includes("-mirror")) return null
  return `OL-${h.slice(3).toUpperCase()}`
}

export function oliverCanonicalMainBasename(handle: string): string | null {
  const code = oliverHandleToSkuCode(handle)
  return code ? `${code}_main.jpg` : null
}

export function oliverCanonicalMainStaticRel(handle: string): string | null {
  const basename = oliverCanonicalMainBasename(handle)
  return basename ? `/static/products/oliver/${basename}` : null
}

export function oliverCanonicalMainExistsOnDisk(repoRoot: string, handle: string): boolean {
  const rel = oliverCanonicalMainStaticRel(handle)
  if (!rel) return false
  return fs.existsSync(path.join(repoRoot, "apps/backend", rel.replace(/^\//, "")))
}

export function oliverPdfCatalogContaminationNeedsRepair(
  handle: string,
  imageUrls: string[],
  repoRoot: string
): boolean {
  if (!/^ol-/.test(handle.toLowerCase())) return false
  const hasPdf = imageUrls.some(isOliverPdfCatalogExtractUrl)
  if (!hasPdf) return false
  if (!oliverCanonicalMainExistsOnDisk(repoRoot, handle)) return false
  const staticRel = oliverCanonicalMainStaticRel(handle)
  const basename = oliverCanonicalMainBasename(handle)?.toLowerCase()
  if (!staticRel || !basename) return false
  const singleCanonical =
    imageUrls.length === 1 &&
    imageUrls[0]!.toLowerCase().includes(staticRel.toLowerCase()) &&
    (imageUrls[0]!.split("/").pop() ?? "").toLowerCase() === basename
  return !singleCanonical
}

export function repoRootFromCwd(): string {
  let dir = process.cwd()
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, "apps", "backend", "static"))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  const cwd = process.cwd()
  if (path.basename(cwd) === "backend" && path.basename(path.dirname(cwd)) === "apps") {
    return path.resolve(cwd, "../..")
  }
  return cwd
}
