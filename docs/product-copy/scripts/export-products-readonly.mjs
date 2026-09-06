/**
 * Read-only export of the full product catalog from the local Medusa
 * admin API (drafts included) for the product-copy editorial pass.
 *
 * Writes docs/product-copy/export/products-export.json.
 * Performs GET requests only — no mutations of any kind.
 *
 * Run: node docs/product-copy/scripts/export-products-readonly.mjs
 * Requires a locally running backend at :9000 (operator's own dev DB).
 */
import { writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const API = process.env.MEDUSA_API ?? "http://localhost:9000"
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "export")

function requireEnv(name) {
  const v = process.env[name]
  if (!v) throw new Error(`missing env var ${name} (local dev admin credentials; never commit values)`)
  return v
}

const login = await fetch(`${API}/auth/user/emailpass`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: requireEnv("MEDUSA_ADMIN_EMAIL"),
    password: requireEnv("MEDUSA_ADMIN_PASSWORD"),
  }),
})
if (!login.ok) throw new Error(`admin login failed: ${login.status}`)
const { token } = await login.json()
const headers = { authorization: `Bearer ${token}` }

const fields = [
  "id",
  "handle",
  "title",
  "subtitle",
  "description",
  "status",
  "metadata",
  "*collection",
  "*type",
  "*categories",
  "*options",
  "*options.values",
  "*variants",
  "*variants.options",
].join(",")

const products = []
let offset = 0
for (;;) {
  const res = await fetch(
    `${API}/admin/products?limit=100&offset=${offset}&fields=${encodeURIComponent(fields)}`,
    { headers }
  )
  if (!res.ok) throw new Error(`products fetch failed: ${res.status}`)
  const data = await res.json()
  products.push(...data.products)
  offset += data.products.length
  if (offset >= data.count || data.products.length === 0) break
}

/* product_classification is a linked entity not expandable via fields on
   this setup — fetch classification per product via the store API list
   which includes it (see storefront usage). */
const pubKey = process.env.MEDUSA_PUBLISHABLE_KEY ?? ""
const classByProduct = new Map()
for (let storeOffset = 0; ; storeOffset += 100) {
  const storeRes = await fetch(
    `${API}/store/products?limit=100&offset=${storeOffset}&fields=${encodeURIComponent("id,*product_classification")}`,
    { headers: pubKey ? { "x-publishable-api-key": pubKey } : {} }
  )
  if (!storeRes.ok) {
    console.warn(`store products fetch failed: ${storeRes.status} (classification will be null)`)
    break
  }
  const storeData = await storeRes.json()
  for (const p of storeData.products ?? []) {
    if (p.product_classification) classByProduct.set(p.id, p.product_classification.product_type)
  }
  if (storeOffset + 100 >= (storeData.count ?? 0)) break
}
for (const p of products) {
  p._classification = classByProduct.get(p.id) ?? null
}

await mkdir(OUT_DIR, { recursive: true })
await writeFile(
  path.join(OUT_DIR, "products-export.json"),
  JSON.stringify({ exported_at: new Date().toISOString(), count: products.length, products }, null, 2)
)
console.log(`exported ${products.length} products -> docs/product-copy/export/products-export.json`)
