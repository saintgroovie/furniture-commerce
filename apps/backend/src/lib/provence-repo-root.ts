import * as fs from "fs"
import * as path from "path"

// Medusa ProductModule — keep loose for script callers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProductListClient = { listProducts: (...args: any[]) => Promise<any[]> }

/** Paginate published catalog and return all `pv-*` products. */
export async function listPublishedProvenceProducts(
  productModule: ProductListClient,
  relations: string[] = ["images"]
) {
  const pageSize = 100
  let skip = 0
  const out: any[] = []
  for (;;) {
    const page = await productModule.listProducts(
      { status: "published" },
      { take: pageSize, skip, relations }
    )
    for (const p of page ?? []) {
      if (String(p.handle ?? "").toLowerCase().startsWith("pv-")) out.push(p)
    }
    if (!page || page.length < pageSize) break
    skip += pageSize
  }
  return out
}

/** Paginate full catalog and return all `pv-*` products. */
export async function listAllProvenceProducts(
  productModule: ProductListClient,
  relations: string[] = ["images"]
) {
  const pageSize = 100
  let skip = 0
  const out: any[] = []
  for (;;) {
    const page = await productModule.listProducts({}, { take: pageSize, skip, relations })
    for (const p of page ?? []) {
      if (String(p.handle ?? "").toLowerCase().startsWith("pv-")) out.push(p)
    }
    if (!page || page.length < pageSize) break
    skip += pageSize
  }
  return out
}

/** Server/scripts only — do not import from storefront client bundles. */
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
