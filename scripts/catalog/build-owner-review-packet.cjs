#!/usr/bin/env node
/**
 * Build owner-review packet v2 from authoritative compare endpoint-comparison.json.
 * Read-only. No mutations. Separates DTO engineering gaps from owner data rows.
 */
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

function csvEscape(v) {
  const s = v == null ? "" : String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function main() {
  const args = process.argv.slice(2)
  let input = null
  let outDir = null
  let inventory = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--endpoint-comparison") input = args[++i]
    if (args[i] === "--inventory") inventory = args[++i]
    if (args[i] === "--out") outDir = args[++i]
  }
  if (!input || !outDir) {
    console.error(
      "usage: build-owner-review-packet.cjs --endpoint-comparison <json> --out <dir> [--inventory <json>]"
    )
    process.exit(2)
  }
  const cmp = JSON.parse(fs.readFileSync(input, "utf8"))
  const inv = inventory ? JSON.parse(fs.readFileSync(inventory, "utf8")) : cmp
  const rows = cmp.rows || []
  const categoryGaps = []
  const collectionMissing = []
  const collectionNull = []
  const titleFallback = []
  const ambiguous = []
  const dtoGaps = []

  for (const r of rows) {
    const base = {
      product_id: r.id,
      handle: r.handle,
      title: r.title,
      current_category: r.auth_category,
      proposed_category: "",
      current_collection: r.auth_collection,
      proposed_collection: "",
      evidence: "",
      confidence: "low",
      decision_type: "owner_data",
      owner_decision: "pending",
      owner_note: "",
      automatic_apply_allowed: false,
      mutation_status: "none",
    }
    if (r.category_state === "missing_in_source" || r.category_state === "null_in_source") {
      categoryGaps.push({
        ...base,
        bucket: "category_gap",
        evidence: `authoritative metadata.category_handle ${r.category_state}`,
        confidence: "medium",
        proposed_category: "",
      })
    }
    if (r.collection_state === "missing_in_source") {
      collectionMissing.push({
        ...base,
        bucket: "collection_missing",
        evidence: "metadata.collection key absent in authoritative source",
        confidence: "medium",
      })
    }
    if (r.collection_state === "null_in_source") {
      collectionNull.push({
        ...base,
        bucket: "collection_null",
        evidence: "metadata.collection is null - may be intentional",
        confidence: "low",
        decision_type: "may_be_intentional",
      })
    }
    const title = String(r.title || "").toLowerCase()
    const isMirror = /зеркал/.test(title)
    const isFurniture = /(кровать|шкаф|стол|стул|комод|тумб|диван|кресл|стеллаж)/.test(title)
    if (isMirror && isFurniture) {
      ambiguous.push({
        ...base,
        bucket: "ambiguous_mirror",
        evidence: "furniture title contains mirror keyword",
        confidence: "medium",
      })
    }
    if (!r.auth_category && (r.category_state === "missing_in_source" || r.category_state === "null_in_source")) {
      titleFallback.push({
        ...base,
        bucket: "title_fallback",
        evidence: "no structured category; buyer may use title fallback",
        confidence: "low",
      })
    }
    if (r.category_state === "not_exposed_by_endpoint" || r.collection_state === "not_exposed_by_endpoint") {
      dtoGaps.push({
        product_id: r.id,
        handle: r.handle,
        title: r.title,
        category_state: r.category_state,
        collection_state: r.collection_state,
        note: "Engineering DTO/projection gap - not an owner classification task",
        automatic_apply_allowed: false,
      })
    }
  }

  fs.mkdirSync(outDir, { recursive: true })
  const packetId = `owner-review-${new Date().toISOString().replace(/[:.]/g, "").slice(0, 15)}Z`
  const sourceIdentity = {
    packet_id: packetId,
    source_bundle_id: inv.bundle_id,
    backend_revision: inv.backend_revision,
    storefront_revision: inv.storefront_revision,
    backend_digest: inv.backend_digest,
    storefront_digest: inv.storefront_digest,
    source_checksum_sha256: inv.checksum_sha256,
    marker: inv.marker,
    generated_at: new Date().toISOString(),
    rejects_store_products_as_completeness: true,
    mutations: false,
    automatic_apply: false,
    counts: {
      category_gaps: categoryGaps.length,
      collection_missing: collectionMissing.length,
      collection_null: collectionNull.length,
      title_fallback: titleFallback.length,
      ambiguous_mirrors: ambiguous.length,
      engineering_dto_gaps: dtoGaps.length,
      buyer_visible: inv.buyer_visible_count,
    },
  }

  const allOwner = [...categoryGaps, ...collectionMissing, ...collectionNull, ...titleFallback, ...ambiguous]
  const decisionDoc = {
    ...sourceIdentity,
    rows: allOwner.map((r) => ({
      product_id: r.product_id,
      handle: r.handle,
      title: r.title,
      bucket: r.bucket,
      current_category: r.current_category,
      proposed_category: r.proposed_category,
      current_collection: r.current_collection,
      proposed_collection: r.proposed_collection,
      evidence: r.evidence,
      confidence: r.confidence,
      owner_decision: "pending",
      automatic_apply_allowed: false,
      agent_proposal_called_approved: false,
    })),
  }

  function writeCsv(name, headers, list) {
    const lines = [headers.join(",")]
    for (const row of list) {
      lines.push(headers.map((h) => csvEscape(row[h])).join(","))
    }
    fs.writeFileSync(path.join(outDir, name), lines.join("\n") + "\n")
  }

  const ownerHeaders = [
    "product_id",
    "handle",
    "title",
    "bucket",
    "current_category",
    "proposed_category",
    "current_collection",
    "proposed_collection",
    "evidence",
    "confidence",
    "owner_decision",
    "owner_note",
    "automatic_apply_allowed",
  ]
  writeCsv("owner-review.csv", ownerHeaders, allOwner.map((r) => ({ ...r, owner_note: "" })))
  writeCsv("category-gaps.csv", ownerHeaders, categoryGaps.map((r) => ({ ...r, owner_note: "" })))
  writeCsv("collection-gaps.csv", ownerHeaders, [...collectionMissing, ...collectionNull].map((r) => ({ ...r, owner_note: "" })))
  writeCsv("title-fallback.csv", ownerHeaders, titleFallback.map((r) => ({ ...r, owner_note: "" })))
  writeCsv("ambiguous-mirrors.csv", ownerHeaders, ambiguous.map((r) => ({ ...r, owner_note: "" })))
  writeCsv(
    "engineering-dto-gaps.csv",
    ["product_id", "handle", "title", "category_state", "collection_state", "note", "automatic_apply_allowed"],
    dtoGaps
  )

  fs.writeFileSync(path.join(outDir, "source-identity.json"), JSON.stringify(sourceIdentity, null, 2) + "\n")
  fs.writeFileSync(path.join(outDir, "review-decisions.json"), JSON.stringify(decisionDoc, null, 2) + "\n")
  const summary = `# Owner-review packet

- packet_id: ${packetId}
- source bundle: ${sourceIdentity.source_bundle_id}
- source checksum: ${sourceIdentity.source_checksum_sha256}
- category gaps: ${categoryGaps.length}
- collection missing: ${collectionMissing.length}
- collection null: ${collectionNull.length}
- title fallback: ${titleFallback.length}
- ambiguous mirrors: ${ambiguous.length}
- engineering DTO gaps: ${dtoGaps.length}
- decisions applied: none
- mutations: none
- automatic_apply: false

Category and collection are independent decisions.
Null collection may be intentional.
DTO gaps are engineering work, not owner classification.
`
  fs.writeFileSync(path.join(outDir, "summary.md"), summary)
  fs.writeFileSync(
    path.join(outDir, "decision-guide.md"),
    `# Как принимать решения

1. Смотрите только строки owner-review / category / collection - не engineering-dto-gaps.csv
2. Category = что за предмет; collection = к какой коллекции относится
3. collection=null может быть намеренно - выберите intentionally_unassigned
4. Не утверждайте proposal агента без явного решения
5. High confidence не означает auto-apply
6. Допустимые решения: approve_proposal, choose_other, intentionally_unassigned, defer, reject, needs_more_evidence
`
  )
  fs.writeFileSync(
    path.join(outDir, "regeneration-command.txt"),
    "node scripts/catalog/build-owner-review-packet.cjs --endpoint-comparison <endpoint-comparison.json> --inventory <inventory.json> --out <dir>\n"
  )
  const checksum = crypto.createHash("sha256").update(JSON.stringify(decisionDoc)).digest("hex")
  fs.writeFileSync(path.join(outDir, "checksums.txt"), `review-decisions.json ${checksum}\n`)
  console.log(JSON.stringify({ ok: true, packet_id: packetId, counts: sourceIdentity.counts, checksum, outDir }, null, 2))
}

main()
