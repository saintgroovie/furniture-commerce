#!/usr/bin/env node
/**
 * Build owner decision workbook v3 from owner-review packet (read-only; no apply).
 */
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

function csvEscape(v) {
  const s = v == null ? "" : String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function proposeCollectionTaxonomy(row) {
  if (row.bucket !== "collection_null" && row.bucket !== "collection_missing") return ""
  if (row.bucket === "collection_missing") return "likely_missing_collection"
  const t = String(row.title || "").toLowerCase()
  if (/зеркал|зеркало/.test(t) && /(кровать|шкаф|стол)/.test(t)) return "insufficient_evidence"
  if (row.decision_type === "may_be_intentional") return "likely_intentionally_unassigned"
  return "insufficient_evidence"
}

function main() {
  const args = process.argv.slice(2)
  let decisions = null
  let outDir = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--review-decisions") decisions = args[++i]
    if (args[i] === "--out") outDir = args[++i]
  }
  if (!decisions || !outDir) {
    console.error("usage: build-owner-decision-workbook.cjs --review-decisions <json> --out <dir>")
    process.exit(2)
  }
  const doc = JSON.parse(fs.readFileSync(decisions, "utf8"))
  fs.mkdirSync(outDir, { recursive: true })
  const rows = (doc.rows || []).map((r) => ({
    ...r,
    owner_decision: "pending",
    owner_note: "",
    recommended_decision: r.bucket === "collection_null" ? "needs_more_evidence" : "defer",
    proposal_taxonomy: proposeCollectionTaxonomy(r),
    automatic_apply_allowed: false,
    treated_as_approved: false,
  }))
  const category = rows.filter((r) => r.bucket === "category_gap")
  const collection = rows.filter((r) => r.bucket === "collection_missing" || r.bucket === "collection_null")
  const ambiguous = rows.filter((r) => r.bucket === "ambiguous_mirror")
  const titleFb = rows.filter((r) => r.bucket === "title_fallback")

  const headers = [
    "product_id",
    "handle",
    "title",
    "bucket",
    "current_category",
    "proposed_category",
    "confidence",
    "current_collection",
    "proposed_collection",
    "proposal_taxonomy",
    "evidence",
    "recommended_decision",
    "owner_decision",
    "owner_note",
    "automatic_apply_allowed",
  ]

  function writeCsv(name, list) {
    const lines = [headers.join(",")]
    for (const r of list) lines.push(headers.map((h) => csvEscape(r[h])).join(","))
    fs.writeFileSync(path.join(outDir, name), lines.join("\n") + "\n")
  }

  const sourceIdentity = {
    packet_id: `owner-decisions-${new Date().toISOString().replace(/[:.]/g, "").slice(0, 15)}Z`,
    source_owner_review_packet_id: doc.packet_id,
    source_bundle_id: doc.source_bundle_id,
    source_checksum_sha256: doc.source_checksum_sha256,
    generated_at: new Date().toISOString(),
    mutations: false,
    automatic_apply: false,
    approvals: "none",
    blank_decision_means: "pending",
    counts: {
      category: category.length,
      collection: collection.length,
      ambiguous: ambiguous.length,
      title_fallback: titleFb.length,
      engineering_dto_gaps: doc.counts?.engineering_dto_gaps ?? null,
    },
  }

  writeCsv("category-decisions.csv", category)
  writeCsv("collection-decisions.csv", collection)
  writeCsv("ambiguous-mirrors.csv", ambiguous)
  writeCsv("title-fallback.csv", titleFb)

  // engineering-only from sibling file if present
  const engPath = path.join(path.dirname(decisions), "engineering-dto-gaps.csv")
  if (fs.existsSync(engPath)) {
    fs.copyFileSync(engPath, path.join(outDir, "engineering-only.csv"))
  } else {
    fs.writeFileSync(
      path.join(outDir, "engineering-only.csv"),
      "product_id,note\n,Engineering DTO gaps are not owner decisions\n"
    )
  }

  fs.writeFileSync(path.join(outDir, "source-identity.json"), JSON.stringify(sourceIdentity, null, 2) + "\n")
  fs.writeFileSync(
    path.join(outDir, "decision-guide.md"),
    `# Owner decision guide

1. Empty owner_decision = pending (not approve)
2. Category and collection are independent
3. collection null may be intentionally_unassigned
4. Do not approve engineering-only.csv rows as catalog mutations
5. Recommended_decision is agent proposal only
`
  )
  fs.writeFileSync(
    path.join(outDir, "summary.md"),
    `# Owner decision packet

- source: ${doc.packet_id}
- category rows: ${category.length}
- collection rows: ${collection.length}
- ambiguous: ${ambiguous.length}
- title fallback: ${titleFb.length}
- approvals: none
- mutations: none
`
  )

  const decisionDoc = {
    ...sourceIdentity,
    supports_null_taxonomy: true,
    blank_interpreted_as_approve: false,
    rows: rows.map((r) => ({
      product_id: r.product_id,
      bucket: r.bucket,
      owner_decision: "pending",
      treated_as_approved: false,
      proposal_taxonomy: r.proposal_taxonomy,
    })),
  }
  fs.writeFileSync(path.join(outDir, "decision-defaults.json"), JSON.stringify(decisionDoc, null, 2) + "\n")

  const files = fs.readdirSync(outDir).filter((f) => !f.startsWith("."))
  const sums = []
  for (const f of files.sort()) {
    const h = crypto.createHash("sha256").update(fs.readFileSync(path.join(outDir, f))).digest("hex")
    sums.push(`${h}  ${f}`)
  }
  fs.writeFileSync(path.join(outDir, "checksums.sha256"), sums.join("\n") + "\n")
  console.log(JSON.stringify({ ok: true, outDir, counts: sourceIdentity.counts }, null, 2))
}

main()
