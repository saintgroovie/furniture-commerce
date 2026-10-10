/**
 * Fidelity: editorial description packet / plan / rollback / family sources.
 * Run: yarn dlx tsx src/lib/editorial-copy/editorial-copy.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import {
  EDITORIAL_COPY_FIELD,
  EDITORIAL_COPY_PACKET_VERSION,
  computeArtifactSha,
  parseEditorialCopyPacket,
  parseEditorialRollbackArtifact,
  sha256Text,
  stableStringify,
  type EditorialCopyPacket,
} from "./packet"
import {
  buildDescriptionUpdates,
  buildRollbackArtifact,
  planEditorialCopy,
  planEditorialRollback,
  type LiveProductRow,
} from "./plan"
import {
  buildEditorialPacket,
  classifyCurrentDescription,
  composeMemberDescription,
  decideAction,
  indexAssignments,
  parseFamilyFile,
  type FamilyFile,
} from "./families"
import { findCopyIssues } from "./quality"

const BEFORE_A = "Комод. Цены в прайс-листе"
const AFTER_A = "Комод с 3 ящиками.\n\nЦвет выбирается из 4 вариантов."
const AFTER_B = "Стул на изогнутых ножках.\n\nСиденье мягкое."

function packet(items?: EditorialCopyPacket["items"]): EditorialCopyPacket {
  return {
    packet_version: EDITORIAL_COPY_PACKET_VERSION,
    packet_id: "test-packet",
    field: EDITORIAL_COPY_FIELD,
    generated_from: "fixture",
    items: items ?? [
      { product_id: "prod_A1", handle: "co-05-1", field: "description", before_sha256: sha256Text(BEFORE_A), after: AFTER_A },
      { product_id: "prod_B2", handle: "pv-23-1", field: "description", before_sha256: sha256Text(null), after: AFTER_B },
    ],
  }
}

const liveClean = (): LiveProductRow[] => [
  { id: "prod_A1", handle: "co-05-1", description: BEFORE_A },
  { id: "prod_B2", handle: "pv-23-1", description: null },
]

/* ---------- packet parsing is strict ---------- */
{
  assert.equal(parseEditorialCopyPacket(packet()).ok, true)

  const extraTop = { ...packet(), status: "published" }
  assert.equal(parseEditorialCopyPacket(extraTop).ok, false, "unknown top-level key must be rejected")

  for (const forbidden of ["title", "handle_new", "status", "price", "subtitle", "metadata"]) {
    const p = packet()
    ;(p.items[0] as Record<string, unknown>)[forbidden] = "x"
    assert.equal(parseEditorialCopyPacket(p).ok, false, `item key ${forbidden} must be rejected`)
  }

  const otherField = packet()
  ;(otherField.items[0] as Record<string, unknown>).field = "title"
  assert.equal(parseEditorialCopyPacket(otherField).ok, false, "only description field is allowed")
  assert.equal(parseEditorialCopyPacket({ ...packet(), field: "title" }).ok, false)

  const badId = packet()
  badId.items[0].product_id = "variant_1"
  assert.equal(parseEditorialCopyPacket(badId).ok, false)

  const dupId = packet()
  dupId.items[1].product_id = "prod_A1"
  assert.equal(parseEditorialCopyPacket(dupId).ok, false)

  const unsorted = packet([...packet().items].reverse())
  assert.equal(parseEditorialCopyPacket(unsorted).ok, false, "items must be sorted by handle")

  const badSha = packet()
  badSha.items[0].before_sha256 = "ABC"
  assert.equal(parseEditorialCopyPacket(badSha).ok, false)

  for (const bad of ["", "  text", "a\r\nb", "a\n\n\nb", "a\u0007b", "x".repeat(2001)]) {
    const p = packet()
    p.items[0].after = bad
    assert.equal(parseEditorialCopyPacket(p).ok, false, `after ${JSON.stringify(bad.slice(0, 10))} must be rejected`)
  }
  assert.equal(parseEditorialCopyPacket({ ...packet(), items: [] }).ok, false)
}

/* ---------- canonical SHA ignores formatting, not content ---------- */
{
  const p = packet()
  const reordered = JSON.parse(JSON.stringify({ items: p.items, field: p.field, packet_id: p.packet_id, generated_from: p.generated_from, packet_version: p.packet_version }))
  assert.equal(computeArtifactSha(p), computeArtifactSha(reordered))
  const changed = packet()
  changed.items[0].after = AFTER_A + " "
  assert.notEqual(computeArtifactSha(p), computeArtifactSha(changed))
  assert.equal(stableStringify({ b: 1, a: [2, { d: 3, c: 4 }] }), '{"a":[2,{"c":4,"d":3}],"b":1}')
}

/* ---------- plan: clean update, payload is description-only ---------- */
{
  const plan = planEditorialCopy(packet(), liveClean())
  assert.equal(plan.ok, true)
  assert.deepEqual(plan.counts, { update: 2, noop: 0, failed: 0 })
  const updates = buildDescriptionUpdates(plan)
  assert.equal(updates.length, 2)
  for (const u of updates) {
    assert.deepEqual(Object.keys(u).sort(), ["data", "id"])
    assert.deepEqual(Object.keys(u.data), ["description"], "only description may be written")
    for (const banned of ["title", "handle", "status", "subtitle", "metadata", "variants", "prices"]) {
      assert.equal(banned in u.data, false)
    }
  }
  assert.deepEqual(updates[0], { id: "prod_A1", data: { description: AFTER_A } })

  // Repeated planning is deterministic.
  assert.deepEqual(planEditorialCopy(packet(), liveClean()), plan)
  assert.deepEqual(buildDescriptionUpdates(planEditorialCopy(packet(), liveClean())), updates)
}

/* ---------- plan: fail closed ---------- */
{
  const unknown = planEditorialCopy(packet(), [liveClean()[0]])
  assert.equal(unknown.ok, false)
  assert.equal(unknown.failures[0].code, "unknown_product")
  assert.throws(() => buildDescriptionUpdates(unknown), /FAIL_CLOSED/)

  const drift = liveClean()
  drift[0].description = BEFORE_A + " (edited by owner)"
  const driftPlan = planEditorialCopy(packet(), drift)
  assert.equal(driftPlan.ok, false)
  assert.equal(driftPlan.failures[0].code, "before_drift")
  assert.throws(() => buildDescriptionUpdates(driftPlan), /FAIL_CLOSED/)
  assert.throws(() => buildRollbackArtifact(driftPlan, { packet_id: "x", packet_sha256: "0".repeat(64) }), /FAIL_CLOSED/)

  const handle = liveClean()
  handle[1].handle = "pv-23-2"
  assert.equal(planEditorialCopy(packet(), handle).failures[0].code, "handle_mismatch")

  const dup = [...liveClean(), liveClean()[0]]
  assert.equal(planEditorialCopy(packet(), dup).failures[0].code, "duplicate_live_row")

  // One bad row poisons the whole plan - no partial apply.
  const partial = planEditorialCopy(packet(), [liveClean()[0], { id: "prod_B2", handle: "pv-23-1", description: "unexpected" }])
  assert.equal(partial.ok, false)
  assert.equal(partial.counts.update, 1)
  assert.throws(() => buildDescriptionUpdates(partial), /FAIL_CLOSED/)
}

/* ---------- idempotency: second run is a noop ---------- */
{
  const applied: LiveProductRow[] = [
    { id: "prod_A1", handle: "co-05-1", description: AFTER_A },
    { id: "prod_B2", handle: "pv-23-1", description: AFTER_B },
  ]
  const plan = planEditorialCopy(packet(), applied)
  assert.equal(plan.ok, true)
  assert.deepEqual(plan.counts, { update: 0, noop: 2, failed: 0 })
  assert.deepEqual(buildDescriptionUpdates(plan), [])
}

/* ---------- rollback artifact round-trip ---------- */
{
  const p = packet()
  const plan = planEditorialCopy(p, liveClean())
  const artifact = buildRollbackArtifact(plan, { packet_id: p.packet_id, packet_sha256: computeArtifactSha(p) })
  const parsed = parseEditorialRollbackArtifact(JSON.parse(JSON.stringify(artifact)))
  assert.equal(parsed.ok, true, JSON.stringify(parsed))
  assert.equal(artifact.items.length, 2)
  assert.equal(artifact.items[1].restore_description, null)

  const applied: LiveProductRow[] = [
    { id: "prod_A1", handle: "co-05-1", description: AFTER_A },
    { id: "prod_B2", handle: "pv-23-1", description: AFTER_B },
  ]
  const rb = planEditorialRollback(artifact, applied)
  assert.equal(rb.ok, true)
  assert.deepEqual(buildDescriptionUpdates(rb), [
    { id: "prod_A1", data: { description: BEFORE_A } },
    { id: "prod_B2", data: { description: null } },
  ])

  // Rollback refuses if the row moved on after apply.
  const moved = [...applied]
  moved[0] = { ...moved[0], description: "owner rewrote it" }
  assert.equal(planEditorialRollback(artifact, moved).failures[0].code, "before_drift")

  // Noop rows are not in the rollback artifact.
  const half = planEditorialCopy(p, [{ id: "prod_A1", handle: "co-05-1", description: AFTER_A }, liveClean()[1]])
  const halfArtifact = buildRollbackArtifact(half, { packet_id: p.packet_id, packet_sha256: computeArtifactSha(p) })
  assert.deepEqual(halfArtifact.items.map((i) => i.product_id), ["prod_B2"])

  const extra = JSON.parse(JSON.stringify(artifact))
  extra.items[0].title = "x"
  assert.equal(parseEditorialRollbackArtifact(extra).ok, false)
}

/* ---------- family sources ---------- */
{
  const file: FamilyFile = {
    collection: "fixture",
    collection_name: "Фикстура",
    families: [
      {
        family_id: "fx-chest",
        family_name: "Комод",
        product_type: "chest",
        shared_copy_basis: "same carcass",
        variant_differences: "drawer count",
        evidence: "fixture",
        confidence: "EXACT",
        paragraphs: ["Комод на точёных ножках.", "Ручки круглые."],
        members: [{ handle: "fx-05-1" }, { handle: "fx-05-2", extra: ["Эта версия ниже."] }],
      },
    ],
    holds: [{ handle: "fx-14-1", family_id: "fx-bed", reason: "photo vs title" }],
  }
  assert.equal(parseFamilyFile(file, "fx").ok, true)
  assert.equal(parseFamilyFile({ ...file, extra: 1 }, "fx").ok, false)
  assert.equal(parseFamilyFile({ ...file, families: [{ ...file.families[0], confidence: "MAYBE" }] }, "fx").ok, false)
  assert.equal(parseFamilyFile({ ...file, families: [{ ...file.families[0], paragraphs: ["a\nb"] }] }, "fx").ok, false)
  assert.equal(parseFamilyFile({ ...file, families: [{ ...file.families[0], members: [{ handle: "x", price: 1 }] }] }, "fx").ok, false)

  assert.equal(composeMemberDescription(file.families[0], file.families[0].members[1]), "Комод на точёных ножках.\n\nРучки круглые.\n\nЭта версия ниже.")

  const idx = indexAssignments([file])
  assert.equal(idx.ok, true)
  if (idx.ok) {
    assert.equal(idx.value.get("fx-14-1")?.kind, "hold")
    assert.equal(idx.value.size, 3)
  }
  const twice = indexAssignments([file, { ...file, families: [{ ...file.families[0], family_id: "fx-other" }], holds: [] }])
  assert.equal(twice.ok, false, "a handle may belong to one family only")

  const rows = [
    { product_id: "prod_Z9", handle: "fx-05-2", description: "old", proposed: "new" },
    { product_id: "prod_Y8", handle: "fx-05-1", description: "same", proposed: "same" },
    { product_id: "prod_X7", handle: "fx-14-1", description: "hold", proposed: null },
    { product_id: "prod_W6", handle: "fx-01-1", description: null, proposed: "added" },
  ]
  const built = buildEditorialPacket(rows, { packet_id: "fx", generated_from: "fx" })
  assert.deepEqual(built.items.map((i) => i.handle), ["fx-01-1", "fx-05-2"], "unchanged and held rows stay out; sorted")
  assert.equal(parseEditorialCopyPacket(built).ok, true)
  assert.equal(computeArtifactSha(buildEditorialPacket([...rows].reverse(), { packet_id: "fx", generated_from: "fx" })), computeArtifactSha(built))

  assert.equal(decideAction("empty", null, "x"), "ADD")
  assert.equal(decideAction("technical", "t", "x"), "ADD")
  assert.equal(decideAction("boilerplate", "x", "x"), "KEEP")
  assert.equal(decideAction("boilerplate", "a", "x"), "REWRITE")
  assert.equal(decideAction("boilerplate", "a", null), "HOLD")
  assert.equal(classifyCurrentDescription(null), "empty")
  assert.equal(classifyCurrentDescription("   "), "empty")
}

/* ---------- copy quality checks ---------- */
{
  const codes = (t: string, title?: string) => findCopyIssues(t, { title })
  assert.ok(codes("Это идеальный выбор для спальни и не только, а ещё здесь много текста для длины строки.").includes("banned_phrase"))
  assert.ok(codes("Купить комод можно в Москве - так будет удобнее, чем заказывать в другом месте сейчас.").includes("seo_word"))
  assert.ok(codes("Доставка займёт неделю, а комод встанет у стены и будет служить долго для всей семьи.").includes("commercial_claim"))
  assert.ok(codes("Комод Scale с тремя ящиками и круглыми ручками на высоких точёных ножках в спальне у окна.").includes("latin_word"))
  assert.ok(!codes("Мебель Woodright собирается в одну линию: комоды, шкафы и тумбы с одинаковыми ножками и ручками.").includes("latin_word"))
  assert.ok(codes("Короткий текст.").includes("too_short"))
  assert.ok(codes("Комод — с ящиками и круглыми ручками на высоких точёных ножках, у окна или в простенке спальни.").includes("long_dash"))
}

/* ---------- the committed packet ---------- */
function findRepoRoot(start: string): string | null {
  let dir = resolve(start)
  for (;;) {
    if (existsSync(join(dir, "docs", "product-copy", "editorial-pass-20261010"))) return dir
    const up = dirname(dir)
    if (up === dir) return null
    dir = up
  }
}
{
  const root = findRepoRoot(process.cwd())
  assert.ok(root, "editorial-pass-20261010 docs must be reachable from cwd")
  const base = join(root as string, "docs", "product-copy", "editorial-pass-20261010")
  const raw = JSON.parse(readFileSync(join(base, "apply", "editorial-copy-packet.json"), "utf8"))
  const parsed = parseEditorialCopyPacket(raw)
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.errors.slice(0, 5).join("; "))
  const shaLine = readFileSync(join(base, "apply", "editorial-copy-packet.sha256"), "utf8").trim()
  assert.equal(shaLine.split(/\s+/)[0], computeArtifactSha(raw), "packet SHA file must match the canonical packet SHA")

  // Every packet row comes from exactly one family member and matches its composed text.
  const files = readdirSync(join(base, "families"))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const r = parseFamilyFile(JSON.parse(readFileSync(join(base, "families", f), "utf8")), f)
      assert.equal(r.ok, true, r.ok ? "" : r.errors.slice(0, 5).join("; "))
      return (r as { ok: true; value: FamilyFile }).value
    })
  const idx = indexAssignments(files)
  assert.equal(idx.ok, true, idx.ok ? "" : idx.errors.slice(0, 5).join("; "))
  if (parsed.ok && idx.ok) {
    for (const item of parsed.value.items) {
      const a = idx.value.get(item.handle)
      assert.equal(a?.kind, "copy", `${item.handle} must be a family member`)
      if (a?.kind === "copy") assert.equal(item.after, a.description, `${item.handle} packet text drifted from family source`)
      const issues = findCopyIssues(item.after, {}).filter((i) => i !== "too_short")
      assert.deepEqual(issues, [], `${item.handle}: ${JSON.stringify(issues)}`)
    }
  }
}

console.log("editorial-copy fidelity: ok")
