/**
 * Editorial copy pass: content families -> boards, quality report and the description apply packet.
 * Read-only: never calls Medusa, never writes live data.
 *
 *   # 1) freeze a snapshot from Store API dumps (optional; the committed snapshot is the default input)
 *   yarn dlx -q tsx scripts/editorial-copy-board.ts \
 *     --products /path/store-products.json --browse /path/catalog-products.json \
 *     --dir ../../docs/product-copy/editorial-pass-20261010
 *   # 2) regenerate boards from the committed snapshot
 *   yarn dlx -q tsx scripts/editorial-copy-board.ts --dir ../../docs/product-copy/editorial-pass-20261010 [--strict]
 *
 * Inputs under --dir: families/*.json, collections.json, categories.json, source/catalog-snapshot.json,
 * optional final-polish-audit.json (editorial statuses before/after) with source/baseline-packet.json
 * (frozen PR #305 packet; its canonical sha must match the audit's baseline.packet_sha256).
 * Outputs under --dir: *-board.csv, editorial-quality.json, editorial-report.md, apply/editorial-copy-packet.json,
 * owner-copy-review.md (when the audit is present).
 * --strict exits 1 on coverage errors, on any hard quality issue or style flag in proposed copy,
 * and on audit inconsistencies (unexplained change, unpolished non-GOOD family, missing audit entry).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { getBuyerFacingProductTitle } from "../src/lib/product-metadata"
import { getBuyerDescription } from "../src/lib/product-seo"
import {
  buildEditorialPacket,
  classifyCurrentDescription,
  decideAction,
  indexAssignments,
  parseFamilyFile,
  type CurrentCopyClass,
  type EditorialAction,
  type EditorialAssignment,
  type FamilyFile,
} from "../../backend/src/lib/editorial-copy/families"
import { computeArtifactSha, parseEditorialCopyPacket } from "../../backend/src/lib/editorial-copy/packet"
import {
  duplicateGroups,
  findBannedPhrases,
  findCopyIssues,
  findStyleIssues,
  repetitionReport,
  splitParagraphs,
  type CopyIssue,
  type CorpusEntry,
  type StyleIssue,
} from "../../backend/src/lib/editorial-copy/quality"

type Row = Record<string, unknown>

type SnapshotRow = {
  product_id: string
  handle: string
  sku: string
  status: string
  raw_title: string
  canonical_title: string
  category: string
  description: string | null
  /** What the PDP shows today (after the #301 sanitizer). */
  visible_description: string | null
}

const PACKET_ID = "editorial-pass-20261010"
const HARD_ISSUES: CopyIssue[] = [
  "banned_phrase",
  "seo_word",
  "commercial_claim",
  "latin_word",
  "raw_dimension",
  "sku_code",
  "ascii_ellipsis",
  "long_dash",
  "shared_note",
  "price_cell",
  "title_echo",
  "opening_model_template",
  "infantile",
  "too_long",
  "empty",
]

function arg(name: string): string | null {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] ?? null : null
}

const dir = arg("--dir")
if (!dir) {
  console.error("usage: editorial-copy-board.ts --dir <editorial-pass dir> [--products <json> --browse <json>] [--strict]")
  process.exit(2)
}
const root = resolve(dir)
const strict = process.argv.includes("--strict")
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T

/* ---------- snapshot ---------- */

function buildSnapshot(productsPath: string, browsePath: string): SnapshotRow[] {
  const products = readJson<{ products: Row[] }>(productsPath).products
  const browseRaw = readJson<Row[] | { products: Row[] }>(browsePath)
  const browse = Array.isArray(browseRaw) ? browseRaw : browseRaw.products
  const category = new Map(
    browse.map((p) => [String(p.handle), String(((p.metadata ?? {}) as Row).buyer_item_type ?? "")])
  )
  return products
    .map((p) => {
      const variants = Array.isArray(p.variants) ? (p.variants as Row[]) : []
      const description = typeof p.description === "string" ? p.description : null
      return {
        product_id: String(p.id),
        handle: String(p.handle),
        sku: String(variants[0]?.sku ?? ""),
        status: String(p.status ?? ""),
        raw_title: String(p.title ?? ""),
        canonical_title: getBuyerFacingProductTitle(p).replace(/[\u00a0\u202f]/g, " "),
        category: category.get(String(p.handle)) ?? "",
        description,
        visible_description: getBuyerDescription(p),
      }
    })
    .sort((a, b) => (a.handle < b.handle ? -1 : 1))
}

const snapshotPath = resolve(root, "source/catalog-snapshot.json")
const productsArg = arg("--products")
if (productsArg) {
  const browseArg = arg("--browse")
  if (!browseArg) {
    console.error("--products requires --browse")
    process.exit(2)
  }
  mkdirSync(resolve(root, "source"), { recursive: true })
  writeFileSync(snapshotPath, `${JSON.stringify({ products: buildSnapshot(productsArg, browseArg) }, null, 1)}\n`)
}
const snapshot = readJson<{ products: SnapshotRow[] }>(snapshotPath).products
const snapshotSha = computeArtifactSha({ products: snapshot })

/* ---------- families ---------- */

const errors: string[] = []
const files: FamilyFile[] = []
for (const name of readdirSync(resolve(root, "families")).filter((f) => f.endsWith(".json")).sort()) {
  const parsed = parseFamilyFile(readJson(resolve(root, "families", name)), name)
  if (parsed.ok) files.push(parsed.value)
  else errors.push(...(parsed as { errors: string[] }).errors)
}
const indexed = indexAssignments(files)
if (!indexed.ok) errors.push(...(indexed as { errors: string[] }).errors)
const assignments: Map<string, EditorialAssignment> = indexed.ok ? indexed.value : new Map()

const snapshotHandles = new Set(snapshot.map((p) => p.handle))
for (const p of snapshot) if (!assignments.has(p.handle)) errors.push(`no family or hold for ${p.handle}`)
for (const h of assignments.keys()) if (!snapshotHandles.has(h)) errors.push(`family handle not in snapshot: ${h}`)

/* ---------- product rows ---------- */

type BoardRow = {
  product_id: string
  handle: string
  sku: string
  canonical_title: string
  content_family_id: string
  collection: string
  product_type: string
  current_description: string
  proposed_description: string
  action: EditorialAction
  evidence: string
  confidence: string
  provenance: string
  reviewer_notes: string
  current_class: CurrentCopyClass
  after_text: string
  family_name: string
  editorial_quality_before: string
  editorial_quality_after: string
  changed_in_final_polish: string
  polish_reason: string
  style_flags_before: string
  style_flags_after: string
  baseline_text: string
}

const CURRENT_PROVENANCE: Record<CurrentCopyClass, string> = {
  empty: "нет описания",
  technical: "строки прайса при импорте (на PDP скрыты санитайзером #301)",
  boilerplate: "текст июльского прохода агента + общая приписка импорта",
  prefix_mangled: "текст июльского прохода агента с битым префиксом «Тип Имя:» + приписка импорта",
  editorial: "редакционный текст",
}

const rows: BoardRow[] = snapshot.map((p) => {
  const a = assignments.get(p.handle)
  const currentClass = classifyCurrentDescription(p.description, p.raw_title)
  const proposed = a?.kind === "copy" ? a.description : null
  const action = decideAction(currentClass, p.description, proposed)
  const notes: string[] = []
  if (a?.kind === "copy" && a.member.notes) notes.push(a.member.notes)
  if (a?.kind === "hold") notes.push(`HOLD: ${a.hold.reason}`)
  if (p.status !== "published") notes.push(`status=${p.status}`)
  return {
    product_id: p.product_id,
    handle: p.handle,
    sku: p.sku,
    canonical_title: p.canonical_title,
    content_family_id: a?.kind === "copy" ? a.family.family_id : a?.kind === "hold" ? a.hold.family_id : "",
    collection: a?.collection_name ?? "",
    product_type: a?.kind === "copy" ? a.family.product_type : "",
    current_description: p.description ?? "",
    proposed_description: proposed ?? "",
    action,
    evidence: a?.kind === "copy" ? a.family.evidence : a?.kind === "hold" ? a.hold.reason : "",
    confidence: a?.kind === "copy" ? a.family.confidence : "AMBIGUOUS",
    provenance:
      a?.kind === "copy"
        ? `было: ${CURRENT_PROVENANCE[currentClass]}; стало: ${PACKET_ID}, family ${a.family.family_id}, источники - evidence`
        : `было: ${CURRENT_PROVENANCE[currentClass]}; без изменений до решения владельца`,
    reviewer_notes: notes.join(" | "),
    current_class: currentClass,
    after_text: proposed ?? p.visible_description ?? "",
    family_name: a?.kind === "copy" ? a.family.family_name : "",
    editorial_quality_before: "",
    editorial_quality_after: "",
    changed_in_final_polish: "",
    polish_reason: "",
    style_flags_before: "",
    style_flags_after: "",
    baseline_text: "",
  }
})

/* ---------- final polish audit ---------- */

const AUDIT_STATUSES = ["GOOD", "POLISH", "TOO_THIN", "TOO_TECHNICAL", "GENERIC", "AWKWARD", "FACT_RISK", "NEW", "HOLD"] as const
const UNPOLISHED_AFTER = new Set(["POLISH", "TOO_TECHNICAL", "GENERIC", "AWKWARD", "FACT_RISK"])
type AuditEntry = { quality_before: string[]; quality_after: string[]; polish_reason: string; after_note?: string }
type AuditFile = {
  pass_id: string
  baseline: { ref: string; packet_sha256: string; items: number }
  families: Array<AuditEntry & { family_id: string }>
  holds: Array<AuditEntry & { handle: string; family_id: string }>
  statuses: Record<string, string>
  owner_review_examples: string[]
}
const auditPath = resolve(root, "final-polish-audit.json")
const audit = existsSync(auditPath) ? readJson<AuditFile>(auditPath) : null
const styleHardFailures: string[] = []
const productTypeOf = (r: BoardRow) => r.product_type || undefined
const styleOf = (text: string, r: BoardRow): StyleIssue[] => (text ? findStyleIssues(text, { productType: productTypeOf(r) }) : [])

for (const r of rows) {
  const afterFlags = styleOf(r.proposed_description, r)
  r.style_flags_after = afterFlags.join(" ")
  if (afterFlags.length) styleHardFailures.push(`${r.handle}: style ${afterFlags.join(", ")}`)
}

/** Baseline texts come only from the frozen baseline packet whose canonical sha the audit declares. */
function loadBaselineTexts(declared: AuditFile["baseline"]): Map<string, string> {
  const path = resolve(root, "source/baseline-packet.json")
  if (!existsSync(path)) {
    errors.push("audit: source/baseline-packet.json missing")
    return new Map()
  }
  const raw = readJson<unknown>(path)
  const sha = computeArtifactSha(raw)
  if (sha !== declared.packet_sha256) errors.push(`audit: baseline packet sha ${sha} != declared ${declared.packet_sha256}`)
  const parsed = parseEditorialCopyPacket(raw)
  if (!parsed.ok) {
    errors.push(`audit: baseline packet invalid: ${(parsed as { errors: string[] }).errors.join("; ")}`)
    return new Map()
  }
  if (parsed.value.items.length !== declared.items) errors.push(`audit: baseline packet has ${parsed.value.items.length} items, declared ${declared.items}`)
  return new Map(parsed.value.items.map((i) => [i.handle, i.after]))
}

if (audit) {
  const baselineTexts = loadBaselineTexts(audit.baseline)
  const dupes = (keys: string[]) => keys.filter((k, i) => keys.indexOf(k) !== i)
  for (const id of new Set(dupes(audit.families.map((f) => f.family_id)))) errors.push(`audit: duplicate family entry ${id}`)
  for (const h of new Set(dupes(audit.holds.map((x) => x.handle)))) errors.push(`audit: duplicate hold entry ${h}`)
  const famAudit = new Map(audit.families.map((f) => [f.family_id, f]))
  const holdAudit = new Map(audit.holds.map((h) => [h.handle, h]))
  const knownFamilies = new Set(files.flatMap((f) => f.families.map((fam) => fam.family_id)))
  for (const id of famAudit.keys()) if (!knownFamilies.has(id)) errors.push(`audit: unknown family ${id}`)
  for (const h of baselineTexts.keys()) if (!snapshotHandles.has(h)) errors.push(`audit: baseline handle not in snapshot: ${h}`)
  const checkStatuses = (where: string, e: AuditEntry) => {
    for (const s of [...e.quality_before, ...e.quality_after]) {
      if (!(AUDIT_STATUSES as readonly string[]).includes(s)) errors.push(`audit ${where}: unknown status ${s}`)
    }
    if (!e.quality_before.length || !e.quality_after.length) errors.push(`audit ${where}: empty status list`)
    if (e.quality_before.some((s) => s !== "GOOD") && !e.polish_reason.trim()) errors.push(`audit ${where}: polish_reason required`)
    const unpolished = e.quality_after.filter((s) => UNPOLISHED_AFTER.has(s))
    if (unpolished.length) errors.push(`audit ${where}: unpolished after-status ${unpolished.join(" ")}`)
    if (e.quality_after.includes("TOO_THIN") && !e.after_note?.trim()) errors.push(`audit ${where}: TOO_THIN after needs after_note`)
  }
  for (const [id, e] of famAudit) checkStatuses(`family ${id}`, e)
  for (const [h, e] of holdAudit) checkStatuses(`hold ${h}`, e)

  const familyChanged = new Map<string, boolean>()
  for (const r of rows) {
    const base = baselineTexts.get(r.handle)
    if (base === undefined) continue
    if (r.content_family_id && r.proposed_description && r.proposed_description !== base) familyChanged.set(r.content_family_id, true)
  }
  for (const r of rows) {
    const base = baselineTexts.get(r.handle)
    r.baseline_text = base ?? ""
    const e = r.action === "HOLD" ? holdAudit.get(r.handle) : famAudit.get(r.content_family_id)
    if (!e) {
      errors.push(`audit: no entry for ${r.action === "HOLD" ? `hold ${r.handle}` : `family ${r.content_family_id}`}`)
      continue
    }
    const isNew = e.quality_before.includes("NEW")
    if (r.action !== "HOLD") {
      if (isNew && base !== undefined) errors.push(`audit: ${r.handle} marked NEW but has a baseline text`)
      if (!isNew && base === undefined) errors.push(`audit: ${r.handle} has no baseline text and is not marked NEW`)
    }
    const changed = base === undefined ? (r.proposed_description ? "new" : "no") : r.proposed_description !== base ? "yes" : "no"
    const famChanged = familyChanged.get(r.content_family_id) ?? false
    if (r.action !== "HOLD" && !isNew) {
      const good = e.quality_before.every((s) => s === "GOOD")
      if (good && famChanged) errors.push(`audit: family ${r.content_family_id} changed but quality_before is GOOD`)
      if (!good && !famChanged) errors.push(`audit: family ${r.content_family_id} is ${e.quality_before.join(" ")} but text is unchanged`)
    }
    r.editorial_quality_before = e.quality_before.join(" ")
    r.editorial_quality_after = e.quality_after.join(" ")
    r.changed_in_final_polish = changed
    r.polish_reason = [e.polish_reason, e.after_note].filter(Boolean).join(" | ")
    r.style_flags_before = styleOf(base ?? "", r).join(" ")
  }
  for (const h of audit.owner_review_examples) if (!snapshotHandles.has(h)) errors.push(`audit: review example not in snapshot: ${h}`)
}

/* ---------- quality ---------- */

const classCounts: Record<string, number> = {}
for (const r of rows) classCounts[r.current_class] = (classCounts[r.current_class] ?? 0) + 1

function textMetrics(
  entries: Array<{ key: string; family: string; text: string; title: string }>,
  holdCount: number,
  technicalCount: number
) {
  const issues = new Map<string, CopyIssue[]>()
  for (const e of entries) issues.set(e.key, findCopyIssues(e.text, { title: e.title }))
  const count = (i: CopyIssue) => [...issues.values()].filter((list) => list.includes(i)).length
  const corpus: CorpusEntry[] = entries.filter((e) => e.text.trim()).map(({ key, family, text }) => ({ key, family, text }))
  const allDup = duplicateGroups(corpus)
  const crossDup = duplicateGroups(corpus, { crossFamilyOnly: true })
  const lengths = corpus.map((e) => e.text.replace(/\s+/g, " ").trim().length).sort((a, b) => a - b)
  const pct = (q: number) => (lengths.length ? lengths[Math.min(lengths.length - 1, Math.floor(q * lengths.length))] : 0)
  return {
    metrics: {
      pdp_total: entries.length,
      empty: count("empty") - technicalCount,
      technical_import: technicalCount + count("price_cell"),
      boilerplate_shared_note: count("shared_note"),
      exact_duplicate_groups: allDup.exact.length,
      exact_duplicate_products: allDup.exact.reduce((s, g) => s + g.keys.length, 0),
      exact_duplicate_groups_cross_family: crossDup.exact.length,
      near_duplicate_groups: allDup.near.length,
      near_duplicate_groups_cross_family: crossDup.near.length,
      raw_dimensions: count("raw_dimension"),
      sku_internal_code: count("sku_code"),
      ascii_ellipsis: count("ascii_ellipsis"),
      title_mismatch_latin_or_echo: [...issues.values()].filter((l) => l.includes("latin_word") || l.includes("title_echo")).length,
      banned_phrases: count("banned_phrase"),
      seo_words: count("seo_word"),
      commercial_claims: count("commercial_claim"),
      long_dash: count("long_dash"),
      opening_model_template: count("opening_model_template"),
      too_short_under_150: count("too_short"),
      too_long_over_900: count("too_long"),
      hold: holdCount,
      length_p10: pct(0.1),
      length_median: pct(0.5),
      length_p90: pct(0.9),
      length_max: lengths[lengths.length - 1] ?? 0,
    },
    issues,
    duplicates: { all: allDup, crossFamily: crossDup },
    repetition: repetitionReport(corpus),
  }
}

const familyOf = (r: BoardRow) => r.content_family_id || r.handle
const before = textMetrics(
  rows.map((r) => ({ key: r.handle, family: familyOf(r), text: snapshot.find((p) => p.handle === r.handle)?.visible_description ?? "", title: r.canonical_title })),
  0,
  classCounts.technical ?? 0
)
const holdCount = rows.filter((r) => r.action === "HOLD").length
const after = textMetrics(
  rows.map((r) => ({ key: r.handle, family: familyOf(r), text: r.after_text, title: r.canonical_title })),
  holdCount,
  rows.filter((r) => r.action === "HOLD" && r.current_class === "technical").length
)

const hardFailures: string[] = []
for (const r of rows) {
  if (!r.proposed_description) continue
  const hard = (after.issues.get(r.handle) ?? []).filter((i) => HARD_ISSUES.includes(i))
  if (hard.length) hardFailures.push(`${r.handle}: ${hard.join(", ")}`)
}
hardFailures.push(...styleHardFailures)

/* ---------- families board ---------- */

type FamilyBoardRow = {
  family_id: string
  family_name: string
  members: string
  product_type: string
  collection: string
  shared_copy_basis: string
  variant_differences: string
  evidence: string
  confidence: string
}
const familyRows: FamilyBoardRow[] = files.flatMap((f) =>
  f.families.map((fam) => ({
    family_id: fam.family_id,
    family_name: fam.family_name,
    members: fam.members.map((m) => m.handle).join(" "),
    product_type: fam.product_type,
    collection: f.collection_name,
    shared_copy_basis: fam.shared_copy_basis,
    variant_differences: fam.variant_differences,
    evidence: fam.evidence,
    confidence: fam.confidence,
  }))
)

/* ---------- collections / categories ---------- */

type CollectionSrc = {
  collection: string
  name: string
  current_intro: string
  proposed_short_intro: string
  proposed_editorial_copy: string
  evidence: string
  action: string
  confidence: string
}
const collectionsSrc = readJson<{ ui_status: string; collections: CollectionSrc[] }>(resolve(root, "collections.json"))
const productsByCollection = new Map<string, number>()
for (const a of assignments.values()) productsByCollection.set(a.collection, (productsByCollection.get(a.collection) ?? 0) + 1)
const collectionRows = collectionsSrc.collections.map((c) => {
  const issues = [
    ...findCopyIssues(c.proposed_short_intro, { minLength: 100 }).filter((i) => i !== "too_long"),
    ...(c.proposed_editorial_copy ? findCopyIssues(c.proposed_editorial_copy, { minLength: 300 }) : []),
  ]
  const shortLen = c.proposed_short_intro.replace(/\s+/g, " ").length
  if (shortLen > 300) issues.push("too_long")
  for (const i of issues) if (HARD_ISSUES.includes(i)) hardFailures.push(`collection ${c.collection}: ${i}`)
  return {
    collection: c.name,
    collection_handle: c.collection,
    product_count: String(productsByCollection.get(c.collection) ?? 0),
    current_intro: c.current_intro,
    proposed_short_intro: c.proposed_short_intro,
    proposed_editorial_copy: c.proposed_editorial_copy,
    evidence: c.evidence,
    action: c.action,
    confidence: c.confidence,
    short_intro_length: String(shortLen),
    editorial_length: String(c.proposed_editorial_copy.replace(/\s+/g, " ").length),
    quality_issues: [...new Set(issues)].join(" "),
    ui_status: collectionsSrc.ui_status,
  }
})
for (const coll of productsByCollection.keys()) {
  if (!collectionsSrc.collections.some((c) => c.collection === coll)) errors.push(`collection without copy: ${coll}`)
}

type CategorySrc = { category: string; label: string; proposed_short_intro: string; evidence: string; action: string; confidence: string }
const categoriesSrc = readJson<{ taxonomy_source: string; ui_status: string; categories: CategorySrc[] }>(resolve(root, "categories.json"))
const categoryRows = categoriesSrc.categories.map((c) => {
  const members = snapshot.filter((p) => p.category === c.category)
  const colls = [...new Set(members.map((p) => assignments.get(p.handle)?.collection_name ?? ""))].filter(Boolean).sort()
  const issues = findCopyIssues(c.proposed_short_intro, { minLength: 40 }).filter((i) => i !== "too_short")
  for (const i of issues) if (HARD_ISSUES.includes(i)) hardFailures.push(`category ${c.category}: ${i}`)
  return {
    category: c.label,
    category_key: c.category,
    product_count: String(members.length),
    collections: colls.join(", "),
    current_intro: "",
    proposed_short_intro: c.proposed_short_intro,
    evidence: c.evidence,
    action: c.action,
    confidence: c.confidence,
    quality_issues: issues.join(" "),
    ui_status: categoriesSrc.ui_status,
  }
})
for (const key of new Set(snapshot.map((p) => p.category).filter(Boolean))) {
  if (!categoriesSrc.categories.some((c) => c.category === key)) errors.push(`category without copy: ${key}`)
}

/* ---------- packet ---------- */

const packet = buildEditorialPacket(
  rows.map((r) => ({
    product_id: r.product_id,
    handle: r.handle,
    description: snapshot.find((p) => p.handle === r.handle)?.description ?? null,
    proposed: r.proposed_description || null,
  })),
  { packet_id: PACKET_ID, generated_from: `source/catalog-snapshot.json sha256=${snapshotSha}` }
)
const packetCheck = parseEditorialCopyPacket(packet)
if (!packetCheck.ok) errors.push(...(packetCheck as { errors: string[] }).errors.map((e) => `packet: ${e}`))
const packetSha = computeArtifactSha(packet)

/* ---------- write ---------- */

function csv(rowsIn: Array<Record<string, string>>, columns: string[]): string {
  const cell = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`
  return `${[columns.join(","), ...rowsIn.map((r) => columns.map((c) => cell(r[c] ?? "")).join(","))].join("\n")}\n`
}

const PRODUCT_COLUMNS = [
  "product_id",
  "handle",
  "sku",
  "canonical_title",
  "content_family_id",
  "collection",
  "product_type",
  "current_description",
  "proposed_description",
  "action",
  "evidence",
  "confidence",
  "provenance",
  "reviewer_notes",
  ...(audit
    ? ["editorial_quality_before", "editorial_quality_after", "changed_in_final_polish", "polish_reason", "style_flags_before", "style_flags_after"]
    : []),
]
writeFileSync(resolve(root, "product-editorial-copy-board.csv"), csv(rows as unknown as Array<Record<string, string>>, PRODUCT_COLUMNS))
writeFileSync(
  resolve(root, "content-family-board.csv"),
  csv(familyRows, ["family_id", "family_name", "members", "product_type", "collection", "shared_copy_basis", "variant_differences", "evidence", "confidence"])
)
writeFileSync(
  resolve(root, "collection-editorial-copy-board.csv"),
  csv(collectionRows, [
    "collection",
    "collection_handle",
    "product_count",
    "current_intro",
    "proposed_short_intro",
    "proposed_editorial_copy",
    "evidence",
    "action",
    "confidence",
    "short_intro_length",
    "editorial_length",
    "quality_issues",
    "ui_status",
  ])
)
writeFileSync(
  resolve(root, "category-editorial-copy-board.csv"),
  csv(categoryRows, [
    "category",
    "category_key",
    "product_count",
    "collections",
    "current_intro",
    "proposed_short_intro",
    "evidence",
    "action",
    "confidence",
    "quality_issues",
    "ui_status",
  ])
)
mkdirSync(resolve(root, "apply"), { recursive: true })
writeFileSync(resolve(root, "apply/editorial-copy-packet.json"), `${JSON.stringify(packet, null, 1)}\n`)
writeFileSync(resolve(root, "apply/editorial-copy-packet.sha256"), `${packetSha}  editorial-copy-packet.json (canonical JSON)\n`)

const actionCounts: Record<string, number> = {}
for (const r of rows) actionCounts[r.action] = (actionCounts[r.action] ?? 0) + 1
const families = files.flatMap((f) => f.families)
const familySummary = {
  families_total: families.length,
  multi_member_families: families.filter((f) => f.members.length > 1).length,
  products_in_multi_member_families: families.filter((f) => f.members.length > 1).reduce((s, f) => s + f.members.length, 0),
  single_member_families: families.filter((f) => f.members.length === 1).length,
  by_confidence: Object.fromEntries(
    ["EXACT", "STRONG", "AMBIGUOUS"].map((c) => [c, families.filter((f) => f.confidence === c).length])
  ),
}

function tally(values: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const v of values) out[v] = (out[v] ?? 0) + 1
  return Object.fromEntries(Object.entries(out).sort())
}
const splitList = (s: string) => s.split(" ").filter(Boolean)
const openingKey = (text: string) => (text.toLowerCase().match(/[\p{L}\d-]+/gu) ?? []).slice(0, 2).join(" ")
function crossFamilyOpenings(list: Array<{ family: string; text: string }>) {
  const byOpening = new Map<string, Set<string>>()
  for (const e of list) {
    if (!e.text) continue
    const k = openingKey(e.text)
    byOpening.set(k, (byOpening.get(k) ?? new Set()).add(e.family))
  }
  return [...byOpening]
    .filter(([, fams]) => fams.size >= 3)
    .map(([opening, fams]) => ({ opening, families: fams.size }))
    .sort((a, b) => b.families - a.families || (a.opening < b.opening ? -1 : 1))
}
const copyRows = rows.filter((r) => r.action !== "HOLD")
const finalPolish = audit
  ? {
      pass_id: audit.pass_id,
      baseline: audit.baseline,
      families_quality_before: tally(audit.families.flatMap((f) => f.quality_before)),
      families_quality_after: tally(audit.families.flatMap((f) => f.quality_after)),
      products_quality_before: tally(rows.flatMap((r) => splitList(r.editorial_quality_before))),
      products_quality_after: tally(rows.flatMap((r) => splitList(r.editorial_quality_after))),
      products_good_at_once: copyRows.filter((r) => r.editorial_quality_before === "GOOD").length,
      products_changed: rows.filter((r) => r.changed_in_final_polish === "yes").length,
      products_new: rows.filter((r) => r.changed_in_final_polish === "new").length,
      products_unchanged: copyRows.filter((r) => r.changed_in_final_polish === "no").length,
      holds: rows.filter((r) => r.action === "HOLD").map((r) => r.handle),
      style_flags_before: tally(rows.flatMap((r) => splitList(r.style_flags_before))),
      style_flags_after: tally(rows.flatMap((r) => splitList(r.style_flags_after))),
      products_with_style_flags_before: rows.filter((r) => r.style_flags_before).length,
      products_with_style_flags_after: rows.filter((r) => r.style_flags_after).length,
      openings_in_3plus_families_before: crossFamilyOpenings(rows.map((r) => ({ family: familyOf(r), text: r.baseline_text }))),
      openings_in_3plus_families_after: crossFamilyOpenings(copyRows.map((r) => ({ family: familyOf(r), text: r.proposed_description }))),
    }
  : null

const quality = {
  packet_id: PACKET_ID,
  snapshot_sha256: snapshotSha,
  packet_sha256: packetSha,
  packet_items: packet.items.length,
  action_counts: actionCounts,
  current_class_counts: classCounts,
  families: familySummary,
  before: before.metrics,
  after: after.metrics,
  final_polish: finalPolish,
  hard_failures: hardFailures,
  coverage_errors: errors,
  after_duplicates_cross_family: after.duplicates.crossFamily,
  after_exact_duplicate_groups: after.duplicates.all.exact,
  repetition_after: after.repetition,
  repetition_before: {
    repeated_sentences: before.repetition.repeated_sentences.slice(0, 15),
    repeated_first_sentences: before.repetition.repeated_first_sentences.slice(0, 15),
    top_trigrams: before.repetition.top_trigrams.slice(0, 15),
  },
  issues_after: Object.fromEntries([...after.issues].filter(([, v]) => v.length)),
}
writeFileSync(resolve(root, "editorial-quality.json"), `${JSON.stringify(quality, null, 1)}\n`)

/* ---------- human report ---------- */

const sorted = [...rows].sort((a, b) => (a.handle < b.handle ? -1 : 1))
const sampled = sorted.filter((_, i) => i % 8 === 0)
const mustCover: Array<[string, (r: BoardRow) => boolean]> = [
  ["Мончелси", (r) => r.collection === "Мончелси"],
  ["Вилли Винки", (r) => r.collection === "Вилли Винки"],
  ["детская", (r) => r.collection === "Оливер, детская"],
  ["семейство вариантов", (r) => (familyRows.find((f) => f.family_id === r.content_family_id)?.members.split(" ").length ?? 0) > 2],
  ["было пусто", (r) => r.current_class === "empty"],
  ["было техническое", (r) => r.current_class === "technical"],
  ["битый префикс", (r) => r.current_class === "prefix_mangled"],
  ["HOLD", (r) => r.action === "HOLD"],
]
const examples = [...sampled]
for (const [, pred] of mustCover) {
  if (!examples.some(pred)) {
    const extra = sorted.find(pred)
    if (extra) examples.push(extra)
  }
}

const md: string[] = []
const oneLine = (s: string) => s.replace(/\s*\n+\s*/g, " / ").replace(/\|/g, "/")
md.push("# Editorial copy pass - отчёт генератора", "")
md.push(`Snapshot sha256: \`${snapshotSha}\``, `Packet: \`apply/editorial-copy-packet.json\` - ${packet.items.length} строк, sha256 (canonical JSON) \`${packetSha}\``, "")
md.push("## Действия по PDP", "", "| action | count |", "|---|---|", ...Object.entries(actionCounts).sort().map(([k, v]) => `| ${k} | ${v} |`), "")
md.push("## Что было на PDP", "", "| класс | count |", "|---|---|", ...Object.entries(classCounts).sort().map(([k, v]) => `| ${k} | ${v} |`), "")
md.push("## Семейства", "", "```json", JSON.stringify(familySummary, null, 1), "```", "")
md.push("## Метрики до / после", "", "| метрика | до | после |", "|---|---|---|")
for (const k of Object.keys(after.metrics) as Array<keyof typeof after.metrics>) md.push(`| ${k} | ${before.metrics[k]} | ${after.metrics[k]} |`)
md.push("", "Дубли внутри одного семейства - общий текст вариантов (так задумано). Межсемейные дубли:", "")
md.push(`- exact: ${after.duplicates.crossFamily.exact.length}`, `- near (Jaccard >= 0,75): ${after.duplicates.crossFamily.near.length}`)
for (const g of after.duplicates.crossFamily.near) md.push(`  - ${g.keys.join(", ")} (${g.similarity})`)
md.push("", "## Повторы после (между семействами)", "")
md.push("### Предложения в 2+ семействах", "", "| текст | семейств | вхождений |", "|---|---|---|")
for (const r of after.repetition.repeated_sentences.slice(0, 25)) md.push(`| ${oneLine(r.text)} | ${r.families.length} | ${r.occurrences} |`)
md.push("", "### Первые предложения в 2+ семействах", "", "| текст | семейств |", "|---|---|")
for (const r of after.repetition.repeated_first_sentences.slice(0, 15)) md.push(`| ${oneLine(r.text)} | ${r.families.join(", ")} |`)
md.push("", "### Частые 4-граммы (3+ семейства)", "", "| n-грамма | семейств | вхождений |", "|---|---|---|")
for (const r of after.repetition.top_fourgrams.slice(0, 20)) md.push(`| ${r.text} | ${r.families.length} | ${r.occurrences} |`)
md.push("", "### Концовки предложений (3+ семейства)", "", "| последние 3 слова | семейств |", "|---|---|")
for (const r of after.repetition.repeated_endings.slice(0, 15)) md.push(`| ${r.text} | ${r.families.length} |`)
md.push("", "### Для сравнения: повторы до", "", "| текст | семейств | вхождений |", "|---|---|---|")
for (const r of before.repetition.repeated_sentences.slice(0, 10)) md.push(`| ${oneLine(r.text).slice(0, 160)} | ${r.families.length} | ${r.occurrences} |`)
md.push("", `## Примеры до / после (${examples.length})`, "", "Выборка: каждый 8-й PDP по handle, плюс добор недостающих типов (Мончелси, Вилли Винки, детская, семейство вариантов, пустое, техническое, битый префикс, HOLD).", "")
for (const r of examples) {
  const was = snapshot.find((p) => p.handle === r.handle)?.visible_description ?? ""
  md.push(`### ${r.canonical_title} (\`${r.handle}\`) - ${r.action}`, "")
  md.push(`- семейство: \`${r.content_family_id}\`; было: ${r.current_class}`)
  md.push(`- до: ${was ? oneLine(was) : "(пусто)"}`)
  md.push(`- после: ${r.proposed_description ? oneLine(r.proposed_description) : "(без изменений - HOLD)"}`, "")
}
md.push("## Банлист и проверки", "", `Запрещённые фразы после: ${rows.filter((r) => findBannedPhrases(r.after_text).length).length}.`)
md.push(`Жёсткие проблемы в новом тексте: ${hardFailures.length ? hardFailures.join("; ") : "нет"}.`)
md.push(`Ошибки покрытия: ${errors.length ? errors.join("; ") : "нет"}.`, "")
const paragraphDistribution: Record<string, number> = {}
for (const r of rows) {
  if (!r.proposed_description) continue
  const n = String(splitParagraphs(r.proposed_description).length)
  paragraphDistribution[n] = (paragraphDistribution[n] ?? 0) + 1
}
md.push("## Абзацы в новых текстах", "", "| абзацев | PDP |", "|---|---|", ...Object.entries(paragraphDistribution).sort().map(([k, v]) => `| ${k} | ${v} |`))

function statusTable(fp: NonNullable<typeof finalPolish>): string[] {
  const keys = [...new Set([...Object.keys(fp.families_quality_before), ...Object.keys(fp.families_quality_after)])]
  const order = (k: string) => (AUDIT_STATUSES as readonly string[]).indexOf(k)
  keys.sort((a, b) => order(a) - order(b))
  return [
    "| статус | семейств до | семейств после | PDP до | PDP после |",
    "|---|---|---|---|---|",
    ...keys.map(
      (k) =>
        `| ${k} | ${fp.families_quality_before[k] ?? 0} | ${fp.families_quality_after[k] ?? 0} | ${fp.products_quality_before[k] ?? 0} | ${fp.products_quality_after[k] ?? 0} |`
    ),
  ]
}
if (finalPolish) {
  md.push("", "## Финальная редакторская шлифовка", "")
  md.push(`База: ${finalPolish.baseline.ref}, packet sha256 \`${finalPolish.baseline.packet_sha256}\` (${finalPolish.baseline.items} строк).`, "")
  md.push("Статусы ставятся на семейство (общий текст вариантов). Один текст может иметь несколько статусов, поэтому суммы больше числа семейств.", "")
  md.push(...statusTable(finalPolish), "")
  md.push(
    `- GOOD сразу (PDP): ${finalPolish.products_good_at_once}`,
    `- изменено в шлифовке (PDP): ${finalPolish.products_changed}`,
    `- новых PDP: ${finalPolish.products_new}`,
    `- без изменений (PDP): ${finalPolish.products_unchanged}`,
    `- HOLD: ${finalPolish.holds.join(", ") || "нет"}`,
    `- стилевые флаги (телеграф, обрывки, перегруз тире, подпись вместо начала, слишком коротко): до ${finalPolish.products_with_style_flags_before} PDP, после ${finalPolish.products_with_style_flags_after} PDP`,
    ""
  )
  md.push("| флаг | до | после |", "|---|---|---|")
  for (const k of [...new Set([...Object.keys(finalPolish.style_flags_before), ...Object.keys(finalPolish.style_flags_after)])].sort()) {
    md.push(`| ${k} | ${finalPolish.style_flags_before[k] ?? 0} | ${finalPolish.style_flags_after[k] ?? 0} |`)
  }
  md.push("", "Одинаковые первые 2 слова в 3+ семействах (монотонность):", "")
  md.push(`- до: ${finalPolish.openings_in_3plus_families_before.map((o) => `«${o.opening}» ×${o.families}`).join(", ") || "нет"}`)
  md.push(`- после: ${finalPolish.openings_in_3plus_families_after.map((o) => `«${o.opening}» ×${o.families}`).join(", ") || "нет"}`)
}
writeFileSync(resolve(root, "editorial-report.md"), `${md.join("\n")}\n`)

if (audit && finalPolish) {
  const byHandle = new Map(rows.map((r) => [r.handle, r]))
  const quote = (text: string) => splitParagraphs(text).map((p) => `> ${p}`).join("\n>\n")
  const review: string[] = []
  review.push("# Owner copy review - финальная редакторская шлифовка", "")
  review.push(
    "Что это: тексты описаний PDP после финальной шлифовки PR #305. Факты не менялись, менялась форма: телеграфные протоколы, обрывки и подписи к фото переписаны в связный каталожный текст. Утверждения без опоры на evidence убраны.",
    "",
    `Пакет: \`apply/editorial-copy-packet.json\`, ${packet.items.length} строк, sha256 \`${packetSha}\`. Snapshot sha256 \`${snapshotSha}\`.`,
    "",
    "Статус: READY_FOR_OWNER_COPY_APPROVAL. Production не изменялся, apply выполняется только после отдельного решения владельца.",
    ""
  )
  review.push("## Сводка", "", ...statusTable(finalPolish), "")
  review.push(
    `- GOOD сразу: ${finalPolish.products_good_at_once} PDP`,
    `- изменено в шлифовке: ${finalPolish.products_changed} PDP`,
    `- новые PDP из свежего snapshot: ${finalPolish.products_new}`,
    `- HOLD: ${finalPolish.holds.length}`,
    ""
  )
  review.push(`## Примеры до → после (${audit.owner_review_examples.length})`, "")
  review.push("«Было» - текст из пакета PR #305 до шлифовки. ADD - на сайте сейчас пусто, REWRITE - текст заменяет текущий.", "")
  for (const h of audit.owner_review_examples) {
    const r = byHandle.get(h)
    if (!r) continue
    review.push(`### ${r.canonical_title} (\`${r.handle}\`)`, "")
    review.push(
      `- коллекция: ${r.collection}; тип: ${r.product_type}; действие: ${r.action}; семейство \`${r.content_family_id}\``,
      `- статус: ${r.editorial_quality_before} → ${r.editorial_quality_after}${r.changed_in_final_polish === "no" ? " (без изменений)" : ""}`
    )
    if (r.polish_reason) review.push(`- почему: ${r.polish_reason}`)
    review.push("", "Было:", "", r.baseline_text ? quote(r.baseline_text) : "> (PDP не было в пакете PR #305)", "", "Стало:", "", quote(r.proposed_description), "")
  }
  review.push("## HOLD", "", "Эти PDP остаются без изменений до ответа владельца.", "")
  for (const r of rows.filter((x) => x.action === "HOLD")) {
    review.push(`- \`${r.handle}\` ${r.canonical_title}: ${r.polish_reason}`)
  }
  review.push("", "## Статусы", "", ...Object.entries(audit.statuses).map(([k, v]) => `- ${k} - ${v}`))
  writeFileSync(resolve(root, "owner-copy-review.md"), `${review.join("\n")}\n`)
}

console.log(JSON.stringify({ actionCounts, packet_items: packet.items.length, packetSha, before: before.metrics, after: after.metrics }, null, 1))
if (errors.length) console.error(`coverage errors:\n${errors.join("\n")}`)
if (hardFailures.length) console.error(`hard issues:\n${hardFailures.join("\n")}`)
if (strict && (errors.length || hardFailures.length)) process.exit(1)
