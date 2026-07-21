#!/usr/bin/env node
/**
 * Compare buyer Store list DTO vs catalog-products projection (read-only).
 * Separates not_exposed_by_endpoint from missing_in_source.
 */
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const https = require("https")
const http = require("http")

function getJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const lib = u.protocol === "https:" ? https : http
    const req = lib.request(
      u,
      { method: "GET", headers: { Accept: "application/json", ...headers }, timeout: 90000 },
      (res) => {
        const chunks = []
        res.on("data", (c) => chunks.push(c))
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8")
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}`))
            return
          }
          resolve({ headers: res.headers, json: JSON.parse(body) })
        })
      }
    )
    req.on("error", reject)
    req.on("timeout", () => {
      req.destroy()
      reject(new Error("timeout"))
    })
    req.end()
  })
}

function catOfList(p) {
  const md = p.metadata || {}
  return p.category_handle || md.category_handle || p.categories?.[0]?.handle || null
}

function colOfList(p) {
  const md = p.metadata || {}
  if (typeof p.collection === "object" && p.collection?.handle) return p.collection.handle
  if (typeof p.collection === "string") return p.collection
  return md.collection || md.collection_label || null
}

/** Authoritative fields come only from catalog-products metadata paths. */
function authMeta(p, key) {
  const md = p.metadata && typeof p.metadata === "object" ? p.metadata : null
  if (!md || !(key in md)) return { kind: "missing", value: null }
  if (md[key] == null || md[key] === "") return { kind: "null", value: null }
  return { kind: "present", value: md[key] }
}

function fieldState({ listHas, auth }) {
  if (auth.kind === "present") {
    if (!listHas) return "not_exposed_by_endpoint"
    return "present_structured"
  }
  if (auth.kind === "null") return "null_in_source"
  return "missing_in_source"
}

function analyze(listProducts, authProducts) {
  const byId = new Map(authProducts.map((p) => [p.id, p]))
  const rows = []
  let matched = 0
  const unmatched = []
  const counts = {
    category_not_exposed: 0,
    category_missing_source: 0,
    category_null_source: 0,
    category_present_auth: 0,
    collection_not_exposed: 0,
    collection_missing_source: 0,
    collection_null_source: 0,
    collection_present_auth: 0,
    title_fallback_auth: 0,
  }
  for (const lp of listProducts) {
    const ap = byId.get(lp.id)
    if (!ap) {
      unmatched.push(lp.id)
      continue
    }
    matched++
    const listCat = catOfList(lp)
    const listCol = colOfList(lp)
    const authCat = authMeta(ap, "category_handle")
    const authCol = authMeta(ap, "collection")
    const catState = fieldState({ listHas: Boolean(listCat), auth: authCat })
    const colState = fieldState({ listHas: Boolean(listCol), auth: authCol })
    if (catState === "not_exposed_by_endpoint") counts.category_not_exposed++
    if (catState === "missing_in_source") counts.category_missing_source++
    if (catState === "null_in_source") counts.category_null_source++
    if (authCat.kind === "present") counts.category_present_auth++
    if (colState === "not_exposed_by_endpoint") counts.collection_not_exposed++
    if (colState === "missing_in_source") counts.collection_missing_source++
    if (colState === "null_in_source") counts.collection_null_source++
    if (authCol.kind === "present") counts.collection_present_auth++
    if (authCat.kind !== "present") counts.title_fallback_auth++
    rows.push({
      id: lp.id,
      handle: lp.handle || ap.handle,
      title: lp.title || ap.title,
      list_category: listCat,
      auth_category: authCat.value,
      category_state: catState,
      list_collection: listCol,
      auth_collection: authCol.value,
      collection_state: colState,
      automatic_apply: false,
      mutation_status: "none",
    })
  }
  return { matched, unmatched, counts, rows }
}

async function main() {
  const args = process.argv.slice(2)
  let listUrl = null
  let authUrl = null
  let outDir = null
  let listFixture = null
  let authFixture = null
  const meta = {}
  const headers = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--list-api") listUrl = args[++i]
    if (args[i] === "--auth-api") authUrl = args[++i]
    if (args[i] === "--list-fixture") listFixture = args[++i]
    if (args[i] === "--auth-fixture") authFixture = args[++i]
    if (args[i] === "--out") outDir = args[++i]
    if (args[i] === "--bundle-id") meta.bundle_id = args[++i]
    if (args[i] === "--backend-revision") meta.backend_revision = args[++i]
    if (args[i] === "--storefront-revision") meta.storefront_revision = args[++i]
    if (args[i] === "--backend-digest") meta.backend_digest = args[++i]
    if (args[i] === "--storefront-digest") meta.storefront_digest = args[++i]
    if (args[i] === "--publishable-key-env") {
      const v = process.env[args[++i]]
      if (v) headers["x-publishable-api-key"] = v
    }
  }
  if (!outDir) {
    console.error("usage: compare-catalog-sources.cjs --out <dir> (--list-api + --auth-api | fixtures)")
    process.exit(2)
  }
  let listProducts
  let authProducts
  let marker = null
  if (listFixture) {
    const d = JSON.parse(fs.readFileSync(listFixture, "utf8"))
    listProducts = d.products || d
  } else {
    const r = await getJson(listUrl, headers)
    listProducts = r.json.products || r.json
    marker = r.headers["x-woodright-catalog-order"] || null
  }
  if (authFixture) {
    const d = JSON.parse(fs.readFileSync(authFixture, "utf8"))
    authProducts = d.products || d
    marker = marker || d.marker || null
  } else {
    const r = await getJson(authUrl, headers)
    authProducts = r.json.products || r.json.items || r.json
    marker = marker || r.headers["x-woodright-catalog-order"] || null
  }
  const result = analyze(listProducts, authProducts)
  fs.mkdirSync(outDir, { recursive: true })
  const field_source_matrix = [
    {
      field: "category_handle",
      authoritative_source: "/store/catalog-products metadata.category_handle",
      store_products: "often not_exposed at top-level; metadata may omit",
      catalog_products: "metadata.category_handle",
      audit_usage: "authoritative for source-data gap",
    },
    {
      field: "collection",
      authoritative_source: "/store/catalog-products metadata.collection",
      store_products: "collection relation often null",
      catalog_products: "metadata.collection string",
      audit_usage: "authoritative for source-data gap",
    },
  ]
  const payload = {
    generated_at: new Date().toISOString(),
    mode: "compare",
    marker,
    mutations: false,
    automatic_apply: false,
    ...meta,
    buyer_visible_count: listProducts.length,
    structured_source_count: authProducts.length,
    matched_count: result.matched,
    unmatched_ids: result.unmatched,
    counts: result.counts,
    field_source_matrix,
    note_prior_155_155:
      "Prior audit counting missing category_handle on /store/products top-level fields is potentially invalid; use catalog-products metadata paths.",
  }
  const inventoryPath = path.join(outDir, "endpoint-comparison.json")
  fs.writeFileSync(inventoryPath, JSON.stringify({ ...payload, rows: result.rows }, null, 2))
  fs.writeFileSync(path.join(outDir, "field-source-matrix.json"), JSON.stringify(field_source_matrix, null, 2))
  fs.writeFileSync(path.join(outDir, "source-identity.json"), JSON.stringify(meta, null, 2))
  const csv = [
    "id,handle,title,category_state,auth_category,collection_state,auth_collection,mutation_status,automatic_apply",
  ]
  for (const r of result.rows) {
    csv.push(
      [
        r.id,
        JSON.stringify(r.handle || ""),
        JSON.stringify(r.title || ""),
        r.category_state,
        r.auth_category || "",
        r.collection_state,
        r.auth_collection || "",
        "none",
        "false",
      ].join(",")
    )
  }
  fs.writeFileSync(path.join(outDir, "owner-review.csv"), csv.join("\n") + "\n")
  const dtoCsv = result.rows
    .filter((r) => r.category_state === "not_exposed_by_endpoint" || r.collection_state === "not_exposed_by_endpoint")
    .map((r) => `${r.id},${r.category_state},${r.collection_state}`)
  fs.writeFileSync(
    path.join(outDir, "dto-gaps.csv"),
    "id,category_state,collection_state\n" + dtoCsv.join("\n") + (dtoCsv.length ? "\n" : "")
  )
  const summary = `# Authoritative catalog DQ compare

- generated_at: ${payload.generated_at}
- bundle_id: ${meta.bundle_id || "n/a"}
- BE: ${meta.backend_revision || "n/a"}
- SF: ${meta.storefront_revision || "n/a"}
- buyer count: ${payload.buyer_visible_count}
- structured count: ${payload.structured_source_count}
- matched: ${payload.matched_count}
- category present in authoritative: ${result.counts.category_present_auth}
- category missing in source: ${result.counts.category_missing_source}
- category not exposed by /store/products: ${result.counts.category_not_exposed}
- collection present in authoritative: ${result.counts.collection_present_auth}
- collection missing in source: ${result.counts.collection_missing_source}
- mutations: none
`
  fs.writeFileSync(path.join(outDir, "summary.md"), summary)
  const checksum = crypto.createHash("sha256").update(JSON.stringify(payload) + summary).digest("hex")
  payload.checksum_sha256 = checksum
  fs.writeFileSync(path.join(outDir, "inventory.json"), JSON.stringify(payload, null, 2))
  fs.writeFileSync(path.join(outDir, "checksums.txt"), `inventory.json ${checksum}\n`)
  fs.writeFileSync(
    path.join(outDir, "regeneration-command.txt"),
    "node scripts/catalog/compare-catalog-sources.cjs --out <dir> --list-api <store/products> --auth-api <store/catalog-products>\n"
  )
  console.log(JSON.stringify({ ok: true, counts: result.counts, checksum, outDir }, null, 2))
}

main().catch((e) => {
  console.error("FAIL", e.message || e)
  process.exit(1)
})
