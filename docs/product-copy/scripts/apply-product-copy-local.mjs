/**
 * Guarded local-only apply of product title/subtitle/description.
 *
 * Default: dry-run (writes apply plan + reconciliation).
 * Mutating: requires explicit --apply.
 *
 * Requires:
 *   MEDUSA_ADMIN_EMAIL
 *   MEDUSA_ADMIN_PASSWORD
 * Optional:
 *   MEDUSA_API (must be localhost / 127.0.0.1)
 *   MEDUSA_PUBLISHABLE_KEY (for classification checks via store API)
 *
 * Run:
 *   node docs/product-copy/scripts/apply-product-copy-local.mjs
 *   node docs/product-copy/scripts/apply-product-copy-local.mjs --apply
 */
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, "..")
const applyDir = path.join(root, "apply")
const snapDir = path.join(applyDir, "snapshots")
const journalDir = path.join(applyDir, "journals")

const APPLY = process.argv.includes("--apply")
const API_RAW = process.env.MEDUSA_API ?? "http://127.0.0.1:9000"

const TEXT_FIELDS = ["title", "subtitle", "description"]
const SKIP_HANDLES_IDENTITY = new Set(["ol-08-1", "ol-08-1-mirror"])
const PARTIAL_HANDLES = new Set(["s-ox-05"]) // description must stay untouched

function requireEnv(name) {
  const v = process.env[name]
  if (!v) throw new Error(`missing env var ${name} (no fallback credentials)`)
  return v
}

function assertLocalApi(apiUrl) {
  let u
  try {
    u = new URL(apiUrl)
  } catch {
    throw new Error(`invalid MEDUSA_API: ${apiUrl}`)
  }
  const host = u.hostname.toLowerCase()
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
    throw new Error(`refusing non-local MEDUSA_API host «${host}» — localhost/127.0.0.1 only`)
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`unsupported protocol in MEDUSA_API: ${u.protocol}`)
  }
  return u.origin
}

function parseCsv(text) {
  const lines = text.replace(/\n$/, "").split("\n")
  if (!lines.length) return []
  const header = splitCsvLine(lines[0])
  return lines.slice(1).filter(Boolean).map((line) => {
    const cols = splitCsvLine(line)
    return Object.fromEntries(header.map((h, i) => [h, cols[i] ?? ""]))
  })
}

function splitCsvLine(line) {
  const cols = []
  let cur = ""
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"'
        i++
      } else inQ = !inQ
    } else if (c === "," && !inQ) {
      cols.push(cur)
      cur = ""
    } else cur += c
  }
  cols.push(cur)
  return cols
}

function csvEscape(v) {
  const s = String(v ?? "")
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function skuSet(product) {
  const skus = (product.variants ?? []).map((v) => v.sku).filter(Boolean).sort()
  return skus.join("|")
}

function mediaCount(product) {
  const imgs = product.images?.length ?? 0
  const thumb = product.thumbnail ? 1 : 0
  return { images: imgs, thumbnail: thumb }
}

function priceFingerprint(product) {
  const prices = []
  for (const v of product.variants ?? []) {
    for (const p of v.prices ?? []) {
      prices.push(`${v.sku ?? v.id}:${p.currency_code}:${p.amount}`)
    }
  }
  return prices.sort().join("|")
}

async function login(api) {
  const email = requireEnv("MEDUSA_ADMIN_EMAIL")
  const password = requireEnv("MEDUSA_ADMIN_PASSWORD")
  const res = await fetch(`${api}/auth/user/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`admin login failed: ${res.status}`)
  const data = await res.json()
  if (!data.token) throw new Error("admin login response missing token")
  return { authorization: `Bearer ${data.token}` }
}

async function fetchAllAdminProducts(api, headers, fields) {
  const products = []
  let offset = 0
  for (;;) {
    const res = await fetch(
      `${api}/admin/products?limit=100&offset=${offset}&fields=${encodeURIComponent(fields)}`,
      { headers }
    )
    if (!res.ok) throw new Error(`products fetch failed: ${res.status}`)
    const data = await res.json()
    products.push(...(data.products ?? []))
    offset += data.products.length
    if (offset >= data.count || data.products.length === 0) break
  }
  return products
}

async function fetchClassifications(api) {
  const pubKey = process.env.MEDUSA_PUBLISHABLE_KEY ?? ""
  const classByProduct = new Map()
  for (let storeOffset = 0; ; storeOffset += 100) {
    const storeRes = await fetch(
      `${api}/store/products?limit=100&offset=${storeOffset}&fields=${encodeURIComponent("id,*product_classification")}`,
      { headers: pubKey ? { "x-publishable-api-key": pubKey } : {} }
    )
    if (!storeRes.ok) {
      console.warn(`store products fetch failed: ${storeRes.status} (classification will be null)`)
      break
    }
    const storeData = await storeRes.json()
    for (const p of storeData.products ?? []) {
      if (p.product_classification) {
        classByProduct.set(p.id, p.product_classification.product_type)
      }
    }
    if (storeOffset + 100 >= (storeData.count ?? 0)) break
  }
  return classByProduct
}

function buildApprovedUpdates(registerRows, dryRunPayload) {
  /** @type {Map<string, {id:string,handle:string,fields:Record<string,string>,status:string}>} */
  const byId = new Map()

  for (const row of registerRows) {
    const handle = row.handle
    const field = row.field
    if (!TEXT_FIELDS.includes(field)) {
      throw new Error(`unknown field in register: ${field} (${handle})`)
    }
    if (SKIP_HANDLES_IDENTITY.has(handle)) continue
    if (PARTIAL_HANDLES.has(handle) && field === "description") continue

    if (!byId.has(row.product_id)) {
      byId.set(row.product_id, {
        id: row.product_id,
        handle,
        fields: {},
        status: row.status,
      })
    }
    const entry = byId.get(row.product_id)
    if (entry.handle !== handle) {
      throw new Error(`handle mismatch for ${row.product_id}: ${entry.handle} vs ${handle}`)
    }
    if (entry.fields[field] != null) {
      throw new Error(`duplicate register row: ${row.product_id} + ${field}`)
    }
    entry.fields[field] = row.new_text
  }

  // Cross-check dry-run payload for safe handles
  const dryById = new Map(dryRunPayload.updates.map((u) => [u.id, u]))
  for (const [id, entry] of byId) {
    const dry = dryById.get(id)
    if (!dry) throw new Error(`register update missing from dry-run payload: ${entry.handle}`)
    for (const field of Object.keys(entry.fields)) {
      if (dry[field] !== entry.fields[field]) {
        throw new Error(`payload/register mismatch ${entry.handle}.${field}`)
      }
    }
    for (const k of Object.keys(dry)) {
      if (k === "id" || k === "handle") continue
      if (!TEXT_FIELDS.includes(k)) {
        throw new Error(`forbidden field in dry-run payload: ${k} (${entry.handle})`)
      }
    }
  }

  return [...byId.values()]
}

function reconcileProduct({
  expected,
  current,
  approved,
  registerOldByField,
}) {
  const notes = []
  let apply_status = "ready"
  let identity_match = true

  if (!current) {
    return {
      product_id: expected.id,
      expected_handle: expected.handle,
      current_handle: "",
      expected_sku: expected.sku,
      current_sku: "",
      expected_collection: expected.collection,
      current_collection: "",
      identity_match: false,
      current_text_matches_export: false,
      apply_status: "skip_missing_product",
      notes: "product missing from live export",
      fields: {},
    }
  }

  const expectedSku = expected.sku
  const currentSku = skuSet(current)
  const expectedCollection = expected.collection
  const currentCollection = current.collection?.title ?? ""
  const expectedClass = expected.classification
  const currentClass = current._classification ?? ""

  if (current.handle !== expected.handle) {
    identity_match = false
    notes.push(`handle drift: expected ${expected.handle}, got ${current.handle}`)
  }
  if (expectedSku && currentSku && expectedSku !== currentSku.split("|")[0] && !currentSku.split("|").includes(expectedSku)) {
    // register stores first variant SKU; accept if present in set
    identity_match = false
    notes.push(`sku drift: expected ${expectedSku}, got ${currentSku}`)
  } else if (expectedSku && currentSku && !currentSku.split("|").includes(expectedSku)) {
    identity_match = false
    notes.push(`sku missing: expected ${expectedSku}, got ${currentSku}`)
  }
  if (expectedCollection && currentCollection && expectedCollection !== currentCollection) {
    identity_match = false
    notes.push(`collection drift: expected ${expectedCollection}, got ${currentCollection}`)
  }
  if (expectedClass && currentClass && expectedClass !== currentClass) {
    identity_match = false
    notes.push(`classification drift: expected ${expectedClass}, got ${currentClass}`)
  }

  // Text match vs original export (used as old_text baseline)
  let current_text_matches_export = true
  for (const field of TEXT_FIELDS) {
    const exportVal = (expected[field] ?? "").toString()
    const liveVal = (current[field] ?? "").toString()
    if (exportVal !== liveVal) {
      // Allow already-applied approved new text (idempotent re-run)
      const approvedVal = approved?.fields?.[field]
      if (approvedVal != null && liveVal === approvedVal) {
        notes.push(`${field}: already applied (idempotent)`)
        continue
      }
      // Allow known title normalization already in live DB matching register new_text
      const regOld = registerOldByField.get(`${expected.id}|${field}`)
      if (regOld != null && liveVal === regOld.new_text) {
        notes.push(`${field}: live already equals approved new_text`)
        continue
      }
      if (regOld != null && liveVal !== regOld.old_text && liveVal !== regOld.new_text) {
        current_text_matches_export = false
        notes.push(`${field}: source drift (live differs from export old and approved new)`)
      } else if (regOld == null && exportVal !== liveVal) {
        current_text_matches_export = false
        notes.push(`${field}: live differs from baseline export`)
      }
    }
  }

  if (SKIP_HANDLES_IDENTITY.has(expected.handle)) {
    apply_status = "skip_identity_conflict"
    notes.push("skipped until metadata identity conflict is resolved manually")
  } else if (PARTIAL_HANDLES.has(expected.handle) && !approved) {
    apply_status = "skip_needs_product_data"
    notes.push("no approved fields for apply")
  } else if (!identity_match) {
    apply_status = "skip_identity_conflict"
  } else if (!current_text_matches_export && !notes.some((n) => n.includes("already applied") || n.includes("equals approved"))) {
    apply_status = "skip_source_drift"
  } else if (!approved || Object.keys(approved.fields).length === 0) {
    if (PARTIAL_HANDLES.has(expected.handle)) {
      apply_status = "skip_needs_product_data"
      notes.push("description withheld; title/subtitle should be in approved set")
    } else {
      apply_status = "skip_needs_product_data"
    }
  } else {
    apply_status = "ready"
    if (PARTIAL_HANDLES.has(expected.handle)) {
      notes.push("s-ox-05: apply title+subtitle only; description untouched")
    }
  }

  return {
    product_id: expected.id,
    expected_handle: expected.handle,
    current_handle: current.handle,
    expected_sku: expectedSku,
    current_sku: currentSku,
    expected_collection: expectedCollection,
    current_collection: currentCollection,
    identity_match,
    current_text_matches_export,
    apply_status,
    notes: notes.join("; "),
    fields: approved?.fields ?? {},
  }
}

async function main() {
  const api = assertLocalApi(API_RAW)
  await mkdir(applyDir, { recursive: true })
  await mkdir(snapDir, { recursive: true })
  await mkdir(journalDir, { recursive: true })

  const registerRows = parseCsv(await readFile(path.join(root, "product-copy-change-register.csv"), "utf8"))
  const unresolvedRows = parseCsv(await readFile(path.join(root, "product-copy-unresolved.csv"), "utf8"))
  const dryRunPayload = JSON.parse(
    await readFile(path.join(root, "dry-run", "product-copy-import.dry-run.json"), "utf8")
  )
  const baselineExport = JSON.parse(await readFile(path.join(root, "export", "products-export.json"), "utf8"))

  // Aggregate integrity of register
  const fieldCounts = { title: 0, subtitle: 0, description: 0, other: 0 }
  const dupKeys = new Map()
  let sameText = 0
  for (const r of registerRows) {
    if (TEXT_FIELDS.includes(r.field)) fieldCounts[r.field]++
    else fieldCounts.other++
    const k = `${r.product_id}|${r.field}`
    dupKeys.set(k, (dupKeys.get(k) || 0) + 1)
    if (r.old_text === r.new_text) sameText++
  }
  const dups = [...dupKeys.entries()].filter(([, c]) => c > 1)
  if (dups.length) throw new Error(`duplicate register keys: ${dups.map(([k]) => k).join(", ")}`)
  if (sameText) throw new Error(`register contains ${sameText} old_text==new_text rows`)
  if (fieldCounts.other) throw new Error(`register contains unknown fields`)
  const total = fieldCounts.title + fieldCounts.subtitle + fieldCounts.description
  if (total !== registerRows.length) throw new Error(`register total mismatch ${total} vs ${registerRows.length}`)

  const approvedUpdates = buildApprovedUpdates(registerRows, dryRunPayload)
  const approvedById = new Map(approvedUpdates.map((u) => [u.id, u]))
  const registerOldByField = new Map(
    registerRows.map((r) => [`${r.product_id}|${r.field}`, { old_text: r.old_text, new_text: r.new_text }])
  )

  console.log("logging in…")
  const headers = await login(api)

  const fields = [
    "id",
    "handle",
    "title",
    "subtitle",
    "description",
    "status",
    "thumbnail",
    "metadata",
    "*collection",
    "*images",
    "*variants",
    "*variants.prices",
    "*options",
  ].join(",")

  console.log("fetching live catalog…")
  const liveProducts = await fetchAllAdminProducts(api, headers, fields)
  const classByProduct = await fetchClassifications(api)
  for (const p of liveProducts) p._classification = classByProduct.get(p.id) ?? null

  const liveStamp = new Date().toISOString().replace(/[:.]/g, "-")
  const liveExportPath = path.join(snapDir, `live-export-preapply-${liveStamp}.json`)
  await writeFile(
    liveExportPath,
    JSON.stringify({ exported_at: new Date().toISOString(), count: liveProducts.length, products: liveProducts }, null, 2)
  )
  // Also refresh the working export/ path for downstream tools (gitignored)
  await mkdir(path.join(root, "export"), { recursive: true })
  await writeFile(
    path.join(root, "export", "products-export.json"),
    JSON.stringify({ exported_at: new Date().toISOString(), count: liveProducts.length, products: liveProducts }, null, 2)
  )

  const baselineById = new Map(baselineExport.products.map((p) => [p.id, p]))
  const liveById = new Map(liveProducts.map((p) => [p.id, p]))

  // Expected identity from register (unique products)
  const expectedProducts = new Map()
  for (const r of registerRows) {
    if (!expectedProducts.has(r.product_id)) {
      const base = baselineById.get(r.product_id)
      expectedProducts.set(r.product_id, {
        id: r.product_id,
        handle: r.handle,
        sku: r.sku,
        collection: r.collection,
        classification: r.classification,
        title: base?.title ?? "",
        subtitle: base?.subtitle ?? "",
        description: base?.description ?? "",
      })
    }
  }
  // Include baseline products that may only appear as no-op (none expected — all 157 in register)
  for (const p of baselineExport.products) {
    if (!expectedProducts.has(p.id)) {
      expectedProducts.set(p.id, {
        id: p.id,
        handle: p.handle,
        sku: p.variants?.[0]?.sku ?? "",
        collection: p.collection?.title ?? "",
        classification: p._classification ?? "",
        title: p.title ?? "",
        subtitle: p.subtitle ?? "",
        description: p.description ?? "",
      })
    }
  }

  const reconciliation = []
  for (const expected of expectedProducts.values()) {
    const row = reconcileProduct({
      expected,
      current: liveById.get(expected.id),
      approved: approvedById.get(expected.id),
      registerOldByField,
    })
    reconciliation.push(row)
  }

  // Force unresolved handles to explicit skip statuses even if somehow marked ready
  for (const row of reconciliation) {
    if (SKIP_HANDLES_IDENTITY.has(row.expected_handle)) {
      row.apply_status = "skip_identity_conflict"
      row.fields = {}
      if (!row.notes.includes("skipped until")) {
        row.notes = [row.notes, "skipped until metadata identity conflict is resolved manually"]
          .filter(Boolean)
          .join("; ")
      }
    }
  }

  // s-ox-05: ensure description not in fields
  for (const row of reconciliation) {
    if (row.expected_handle === "s-ox-05") {
      delete row.fields.description
      if (row.apply_status === "ready" && Object.keys(row.fields).length === 0) {
        row.apply_status = "skip_needs_product_data"
      }
    }
  }

  const reconCsvPath = path.join(applyDir, "product-copy-preapply-reconciliation.csv")
  const reconHeader = [
    "product_id",
    "expected_handle",
    "current_handle",
    "expected_sku",
    "current_sku",
    "expected_collection",
    "current_collection",
    "identity_match",
    "current_text_matches_export",
    "apply_status",
    "notes",
  ]
  await writeFile(
    reconCsvPath,
    [
      reconHeader.join(","),
      ...reconciliation.map((r) =>
        reconHeader.map((h) => csvEscape(r[h] === true || r[h] === false ? String(r[h]) : r[h])).join(",")
      ),
    ].join("\n") + "\n"
  )

  const ready = reconciliation.filter((r) => r.apply_status === "ready")
  const skipped = reconciliation.filter((r) => r.apply_status !== "ready")
  const fieldPlan = { title: 0, subtitle: 0, description: 0 }
  for (const r of ready) {
    for (const f of Object.keys(r.fields)) fieldPlan[f] = (fieldPlan[f] || 0) + 1
  }

  const plan = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? "apply" : "dry-run",
    endpoint: api,
    localhost_only: true,
    catalog_count_live: liveProducts.length,
    catalog_count_baseline: baselineExport.count ?? baselineExport.products.length,
    register_field_counts: { ...fieldCounts, total },
    register_integrity: {
      duplicates: 0,
      same_text_rows: 0,
      unknown_fields: 0,
      arithmetic_note:
        "47 title + 157 subtitle + 156 description = 360. Prior 359/360 report used wrong subtitle count (156 instead of 157; s-ox-05 has subtitle).",
    },
    unresolved_policy: {
      "s-ox-05": "apply title+subtitle only; description empty / not sent",
      "ol-08-1": "skip_identity_conflict — full skip until metadata fixed",
      "ol-08-1-mirror": "skip_identity_conflict — full skip until metadata fixed",
    },
    ready_products: ready.length,
    skipped_products: skipped.length,
    expected_http_updates: ready.length,
    fields_to_apply: fieldPlan,
    forbidden_fields: ["prices", "sku", "handle", "variants", "options", "images", "thumbnail", "status", "collection_id", "categories", "metadata"],
    skipped: skipped.map((r) => ({
      product_id: r.product_id,
      handle: r.expected_handle,
      apply_status: r.apply_status,
      notes: r.notes,
    })),
    ready_handles_sample: ready.slice(0, 20).map((r) => r.expected_handle),
    live_export_path: liveExportPath,
    unresolved_csv_rows: unresolvedRows.length,
  }

  const planPath = path.join(applyDir, "product-copy-apply-plan.json")
  await writeFile(planPath, JSON.stringify(plan, null, 2))

  console.log(
    JSON.stringify(
      {
        mode: plan.mode,
        endpoint: api,
        register: plan.register_field_counts,
        ready: plan.ready_products,
        skipped: plan.skipped_products,
        fields_to_apply: fieldPlan,
        expected_http_updates: plan.expected_http_updates,
        drift: skipped.filter((r) => r.apply_status === "skip_source_drift").length,
        identity_conflict: skipped.filter((r) => r.apply_status === "skip_identity_conflict").length,
        missing: skipped.filter((r) => r.apply_status === "skip_missing_product").length,
        needs_product_data: skipped.filter((r) => r.apply_status === "skip_needs_product_data").length,
      },
      null,
      2
    )
  )

  if (!APPLY) {
    console.log(`dry-run complete → ${planPath}`)
    return
  }

  // Hard stop conditions before mutating
  if (liveProducts.length !== 157) {
    throw new Error(`refusing apply: live catalog count ${liveProducts.length} !== 157`)
  }
  if (ready.some((r) => !r.identity_match)) {
    throw new Error("refusing apply: ready set contains identity mismatch")
  }
  if (Object.keys(fieldPlan).some((k) => !TEXT_FIELDS.includes(k))) {
    throw new Error("refusing apply: non-text fields in plan")
  }

  const beforeSnap = ready.map((r) => {
    const p = liveById.get(r.product_id)
    return {
      id: p.id,
      handle: p.handle,
      title: p.title,
      subtitle: p.subtitle,
      description: p.description,
      status: p.status,
      collection: p.collection?.title ?? null,
      classification: p._classification,
      sku: skuSet(p),
      media: mediaCount(p),
      prices: priceFingerprint(p),
      metadata_keys: Object.keys(p.metadata ?? {}).sort(),
    }
  })
  const beforePath = path.join(snapDir, `before-${liveStamp}.json`)
  await writeFile(beforePath, JSON.stringify({ at: new Date().toISOString(), products: beforeSnap }, null, 2))

  const journalPath = path.join(journalDir, `apply-${liveStamp}.jsonl`)
  const successes = []
  const failures = []

  for (const r of ready) {
    // Fresh identity check immediately before update
    const liveRes = await fetch(
      `${api}/admin/products/${r.product_id}?fields=${encodeURIComponent("id,handle,title,subtitle,description,status,*collection,*variants")}`,
      { headers }
    )
    if (!liveRes.ok) {
      failures.push({ id: r.product_id, handle: r.expected_handle, error: `precheck GET ${liveRes.status}` })
      await appendFile(
        journalPath,
        JSON.stringify({ ts: new Date().toISOString(), phase: "precheck", id: r.product_id, status: liveRes.status, ok: false }) + "\n"
      )
      throw new Error(`stop on unexpected precheck failure for ${r.expected_handle}: ${liveRes.status}`)
    }
    const { product: live } = await liveRes.json()
    if (live.handle !== r.expected_handle) {
      throw new Error(`identity conflict at apply time: ${r.expected_handle} vs ${live.handle}`)
    }
    if (r.expected_sku && !(live.variants ?? []).some((v) => v.sku === r.expected_sku)) {
      throw new Error(`sku conflict at apply time: ${r.expected_handle} missing sku ${r.expected_sku}`)
    }

    const body = {}
    for (const f of TEXT_FIELDS) {
      if (r.fields[f] != null) body[f] = r.fields[f]
    }
    if (!Object.keys(body).length) continue

    const reqMeta = {
      ts: new Date().toISOString(),
      phase: "update",
      id: r.product_id,
      handle: r.expected_handle,
      fields: Object.keys(body),
    }
    const upd = await fetch(`${api}/admin/products/${r.product_id}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    const updText = await upd.text()
    await appendFile(
      journalPath,
      JSON.stringify({ ...reqMeta, status: upd.status, ok: upd.ok, body_keys: Object.keys(body), response_len: updText.length }) + "\n"
    )
    if (!upd.ok) {
      failures.push({ id: r.product_id, handle: r.expected_handle, error: `POST ${upd.status}`, body: updText.slice(0, 500) })
      throw new Error(`stop on unexpected update failure for ${r.expected_handle}: ${upd.status}`)
    }
    successes.push({ id: r.product_id, handle: r.expected_handle, fields: Object.keys(body) })
  }

  // After snapshot
  const afterProducts = await fetchAllAdminProducts(api, headers, fields)
  for (const p of afterProducts) p._classification = classByProduct.get(p.id) ?? p._classification ?? null
  const afterById = new Map(afterProducts.map((p) => [p.id, p]))
  const afterSnap = ready.map((r) => {
    const p = afterById.get(r.product_id)
    return {
      id: p.id,
      handle: p.handle,
      title: p.title,
      subtitle: p.subtitle,
      description: p.description,
      status: p.status,
      collection: p.collection?.title ?? null,
      classification: p._classification,
      sku: skuSet(p),
      media: mediaCount(p),
      prices: priceFingerprint(p),
      metadata_keys: Object.keys(p.metadata ?? {}).sort(),
    }
  })
  const afterPath = path.join(snapDir, `after-${liveStamp}.json`)
  await writeFile(afterPath, JSON.stringify({ at: new Date().toISOString(), products: afterSnap }, null, 2))

  // Integrity diff (non-text)
  const integrityIssues = []
  for (const b of beforeSnap) {
    const a = afterSnap.find((x) => x.id === b.id)
    if (!a) {
      integrityIssues.push({ id: b.id, issue: "missing after" })
      continue
    }
    for (const k of ["handle", "status", "collection", "classification", "sku", "prices"]) {
      if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) {
        integrityIssues.push({ id: b.id, handle: b.handle, field: k, before: b[k], after: a[k] })
      }
    }
    if (JSON.stringify(b.media) !== JSON.stringify(a.media)) {
      integrityIssues.push({ id: b.id, handle: b.handle, field: "media", before: b.media, after: a.media })
    }
    if (JSON.stringify(b.metadata_keys) !== JSON.stringify(a.metadata_keys)) {
      integrityIssues.push({ id: b.id, handle: b.handle, field: "metadata_keys", before: b.metadata_keys, after: a.metadata_keys })
    }
  }

  const result = {
    at: new Date().toISOString(),
    endpoint: api,
    success_count: successes.length,
    skipped_count: skipped.length,
    failure_count: failures.length,
    successes,
    skipped: plan.skipped,
    failures,
    integrity_issues: integrityIssues,
    before_path: beforePath,
    after_path: afterPath,
    journal_path: journalPath,
    catalog_count_after: afterProducts.length,
  }
  await writeFile(path.join(applyDir, "product-copy-apply-result.json"), JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ applied: successes.length, skipped: skipped.length, failed: failures.length, integrity_issues: integrityIssues.length }, null, 2))
  if (integrityIssues.length) {
    throw new Error(`non-text field changes detected: ${integrityIssues.length}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
