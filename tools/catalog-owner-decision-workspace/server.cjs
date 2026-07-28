#!/usr/bin/env node
/**
 * Read-only Catalog Owner Decision Workspace (local).
 * - Serves UI on 127.0.0.1:3051
 * - Persists decisions only to durable owner-artifacts path
 * - Never calls Medusa/admin mutation APIs
 */
const http = require("http")
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const { URL } = require("url")
const { validatePacket } = require("./lib/packet-validate.cjs")
const { classifyMedia } = require("./lib/media-classify.cjs")
const { enrichMedia, loadProductsById } = require("./lib/media-enrich.cjs")
const { buildMutationPreview } = require("./lib/mutation-preview.cjs")
const { decisionKey } = require("./lib/decision-key.cjs")
const {
  loadState,
  saveState,
  applyDecision,
  undoLast,
  ensureWorkspace,
  appendHistoryEvent,
} = require("./lib/decision-store.cjs")

const HOST = process.env.OWNER_REVIEW_HOST || "127.0.0.1"
const PORT = Number(process.env.OWNER_REVIEW_PORT || 3051)
const PACKET =
  process.env.OWNER_REVIEW_PACKET ||
  "/Users/leonidmbp/Documents/projects/woodright-owner-artifacts/catalog-owner-review-20260722T095022Z"
const MEDIA_FIXTURE =
  process.env.OWNER_REVIEW_MEDIA_FIXTURE ||
  "/Users/leonidmbp/Documents/projects/woodright-owner-artifacts/catalog-dq-20260721T1719Z/live-products.fixture.json"
const PUBLIC_ORIGIN = process.env.OWNER_REVIEW_PUBLIC_ORIGIN || "https://woodright-demo.ru"
const WORKSPACE =
  process.env.OWNER_REVIEW_WORKSPACE ||
  path.join(
    "/Users/leonidmbp/Documents/projects/woodright-owner-artifacts",
    `catalog-owner-decisions-workspace-${new Date().toISOString().replace(/[:.]/g, "").slice(0, 15)}Z`
  )

const PUBLIC = path.join(__dirname, "public")

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"))
}

function send(res, code, body, type = "application/json; charset=utf-8") {
  const data = typeof body === "string" ? body : JSON.stringify(body, null, 2)
  res.writeHead(code, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Woodright-Owner-Review": "read-only-local",
  })
  res.end(data)
}

function buildRows(packetDir) {
  const decisions = readJson(path.join(packetDir, "review-decisions.json"))
  const engCsv = path.join(packetDir, "engineering-dto-gaps.csv")
  let engineering = []
  if (fs.existsSync(engCsv)) {
    const lines = fs.readFileSync(engCsv, "utf8").trim().split("\n").slice(1)
    engineering = lines
      .filter(Boolean)
      .map((line) => {
        const cols = line.split(",")
        return {
          product_id: cols[0],
          handle: cols[1],
          title: cols[2],
          category_state: cols[3],
          collection_state: cols[4],
          note: cols.slice(5).join(","),
          bucket: "engineering_dto",
          owner_queue: false,
        }
      })
  }
  let baseRows = decisions.rows || []
  if (fs.existsSync(MEDIA_FIXTURE)) {
    const byId = loadProductsById(MEDIA_FIXTURE)
    baseRows = enrichMedia(baseRows, byId, PUBLIC_ORIGIN)
  }
  const rows = baseRows.map((r) => {
    const media = classifyMedia(r)
    return {
      ...r,
      field_keys: fieldKeysForBucket(r.bucket),
      media,
      owner_queue: true,
      automatic_apply_allowed: false,
      agent_proposal_called_approved: false,
    }
  })
  return {
    source: {
      packet_id: decisions.packet_id,
      source_bundle_id: decisions.source_bundle_id,
      source_checksum_sha256: decisions.source_checksum_sha256,
      counts: decisions.counts,
      rejects_store_products_as_completeness: decisions.rejects_store_products_as_completeness !== false,
      media_fixture: fs.existsSync(MEDIA_FIXTURE) ? MEDIA_FIXTURE : null,
    },
    rows,
    engineering,
  }
}

function fieldKeysForBucket(bucket) {
  if (bucket === "category_gap" || bucket === "title_fallback") return ["category"]
  if (bucket === "collection_missing" || bucket === "collection_null") return ["collection"]
  if (bucket === "ambiguous_mirror") return ["mirror_classification"]
  return []
}

function main() {
  const validation = validatePacket(PACKET)
  if (!validation.ok) {
    console.error("INVALID PACKET", validation.errors.join("; "))
    process.exit(1)
  }
  ensureWorkspace(WORKSPACE, PACKET)
  const catalog = buildRows(PACKET)
  // auto-defer confirmed no-image into state on boot (idempotent)
  const state = loadState(WORKSPACE)
  let changed = false
  for (const row of catalog.rows) {
    if (row.media.status !== "confirmed_no_image") continue
    for (const field of row.field_keys) {
      const key = decisionKey(row.product_id, row.bucket, field)
      const cur = state.decisions[key]
      if (cur && cur.status && cur.status !== "pending") continue
      const fp = validation.fingerprint_by_row[`${row.product_id}::${row.bucket}`] || validation.fingerprint_by_id[row.product_id]
      if (!fp) continue
      state.decisions[key] = {
        product_id: row.product_id,
        field,
        bucket: row.bucket,
        current_value: field === "category" ? row.current_category : row.current_collection,
        proposed_value: field === "category" ? row.proposed_category : row.proposed_collection,
        decision: "auto_deferred_no_image",
        status: "auto_deferred_no_image",
        owner_comment: "Изображения пока не найдены",
        reviewed_at: new Date().toISOString(),
        reviewer: "system-auto-defer",
        source_fingerprint: fp,
        automatic_apply_allowed: false,
        confirms_product_fields: false,
      }
      appendHistoryEvent(WORKSPACE, state, {
        ts: new Date().toISOString(),
        event_type: "auto_defer_no_image",
        decision_key: key,
        product_id: row.product_id,
        bucket: row.bucket,
        field,
        previous_state: cur || { status: "pending" },
        next_state: state.decisions[key],
        actor: "system-auto-defer",
        packet_checksum: catalog.source.source_checksum_sha256,
      })
      changed = true
    }
  }
  if (changed) saveState(WORKSPACE, state)

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, `http://${HOST}:${PORT}`)
    // Block any production mutation-looking paths
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && u.pathname.startsWith("/store/")) {
      return send(res, 403, { ok: false, error: "production write API forbidden" })
    }
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && u.pathname.startsWith("/admin/")) {
      return send(res, 403, { ok: false, error: "admin write API forbidden" })
    }

    if (req.method === "GET" && u.pathname === "/api/health") {
      return send(res, 200, {
        ok: true,
        read_only: true,
        write_api: false,
        port: PORT,
        workspace: WORKSPACE,
        packet: PACKET,
      })
    }

    if (req.method === "GET" && u.pathname === "/api/bootstrap") {
      const st = loadState(WORKSPACE)
      return send(res, 200, {
        source: catalog.source,
        validation,
        workspace: WORKSPACE,
        rows: catalog.rows,
        engineering: catalog.engineering,
        decisions: st.decisions,
        summary: summarize(catalog, st),
      })
    }

    if (req.method === "GET" && u.pathname === "/api/preview") {
      const st = loadState(WORKSPACE)
      return send(res, 200, buildMutationPreview(catalog.rows, st.decisions, catalog.source))
    }

    if (req.method === "POST" && u.pathname === "/api/decision") {
      let body = ""
      req.on("data", (c) => (body += c))
      req.on("end", () => {
        try {
          const payload = JSON.parse(body || "{}")
          const bound = bindDecisionFromPacket(catalog, validation, payload)
          if (bound.status === "approved" && !bound.reviewer) {
            return send(res, 400, { ok: false, error: "reviewer required" })
          }
          const st = applyDecision(WORKSPACE, bound, catalog.source.source_checksum_sha256)
          return send(res, 200, { ok: true, decisions: st.decisions, summary: summarize(catalog, st) })
        } catch (e) {
          return send(res, 400, { ok: false, error: String(e.message || e) })
        }
      })
      return
    }

    if (req.method === "POST" && u.pathname === "/api/undo") {
      const st = undoLast(WORKSPACE)
      return send(res, 200, { ok: true, decisions: st.decisions, summary: summarize(catalog, st) })
    }

    if (req.method === "GET" && u.pathname === "/api/export") {
      const st = loadState(WORKSPACE)
      return send(res, 200, {
        source: catalog.source,
        decisions: st.decisions,
        history: st.history,
        preview: buildMutationPreview(catalog.rows, st.decisions, catalog.source),
        exported_at: new Date().toISOString(),
      })
    }

    // static
    let rel = u.pathname === "/" ? "/index.html" : u.pathname
    const file = path.normalize(path.join(PUBLIC, rel))
    if (!file.startsWith(PUBLIC)) return send(res, 403, { error: "forbidden" })
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, { error: "not found" })
    const ext = path.extname(file)
    const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" }
    return send(res, 200, fs.readFileSync(file, "utf8"), types[ext] || "application/octet-stream")
  })

  server.listen(PORT, HOST, () => {
    console.log(
      JSON.stringify(
        {
          ok: true,
          url: `http://${HOST}:${PORT}/`,
          workspace: WORKSPACE,
          packet: PACKET,
          write_api: false,
        },
        null,
        2
      )
    )
  })
}

function bindDecisionFromPacket(catalog, validation, payload) {
  const productId = payload.product_id
  const bucket = payload.bucket
  if (!productId || !bucket) throw new Error("product_id and bucket required")
  const row = catalog.rows.find((r) => r.product_id === productId && r.bucket === bucket)
  if (!row) throw new Error("row_not_in_validated_packet")
  const field = (row.field_keys || [])[0]
  if (!field) throw new Error("field_not_defined_for_bucket")
  // Never trust client status/fingerprint/current/proposed for identity
  const allowed = new Set([
    "approve_proposed_category",
    "choose_other_category",
    "intentionally_uncategorized",
    "assign_proposed_collection",
    "choose_other_collection",
    "intentionally_unassigned",
    "legacy_or_paused",
    "defer",
    "needs_more_evidence",
    "reject_proposal",
    "pure_mirror_accessory",
    "furniture_with_mirror",
    "other",
  ])
  if (!allowed.has(payload.decision)) throw new Error("invalid_decision")
  const fp = validation.fingerprint_by_row[`${productId}::${bucket}`] || validation.fingerprint_by_id[productId]
  if (!fp) throw new Error("missing_source_fingerprint")
  return {
    product_id: productId,
    bucket,
    field,
    decision: payload.decision,
    owner_comment: payload.owner_comment || "",
    reviewer: payload.reviewer || "owner",
    current_value: field === "category" ? row.current_category : field === "collection" ? row.current_collection : null,
    proposed_value: field === "category" ? row.proposed_category : field === "collection" ? row.proposed_collection : null,
    chosen_value: String(payload.decision || "").startsWith("choose_other") ? payload.chosen_value || null : null,
    after_value: String(payload.decision || "").startsWith("choose_other") ? payload.chosen_value || null : null,
    source_fingerprint: fp,
  }
}

function summarize(catalog, st) {
  const decisions = Object.values(st.decisions || {})
  const by = (s) => decisions.filter((d) => d.status === s).length
  return {
    owner_rows: catalog.rows.length,
    engineering_only: catalog.engineering.length,
    pending: catalog.rows.reduce((n, r) => {
      for (const f of r.field_keys) {
        const d = st.decisions[decisionKey(r.product_id, r.bucket, f)]
        if (!d || d.status === "pending" || d.status === "proposed") n++
      }
      return n
    }, 0),
    approved: by("approved"),
    rejected: by("rejected"),
    deferred: by("deferred") + by("auto_deferred_no_image"),
    needs_more_evidence: by("needs_more_evidence"),
    auto_deferred_no_image: by("auto_deferred_no_image"),
  }
}

if (require.main === module) main()
module.exports = { buildRows, summarize }
