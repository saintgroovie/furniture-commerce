/**
 * Fidelity: importer core against an in-memory product module (no Medusa, no DB).
 * Run: yarn dlx tsx src/lib/editorial-copy/run.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { EDITORIAL_COPY_FIELD, EDITORIAL_COPY_PACKET_VERSION, computeArtifactSha, sha256Text, type EditorialCopyPacket } from "./packet"
import { runEditorialCopy, type EditorialProductModule } from "./run"

type Row = { id: string; handle: string; description: string | null; title: string; status: string }

function fakeModule(rows: Row[], opts: { dropOnRead?: string; duplicateOnRead?: string; ignoreWrites?: boolean } = {}) {
  const db = new Map(rows.map((r) => [r.id, { ...r }]))
  const writes: Array<{ id: string; data: Record<string, unknown> }> = []
  let reads = 0
  const mod: EditorialProductModule = {
    async listProducts(filters, config) {
      reads++
      assert.deepEqual(config.select, ["id", "handle", "description"], "reads select only id / handle / description")
      const out = filters.id.filter((id) => db.has(id)).map((id) => {
        const r = db.get(id)!
        return { id: r.id, handle: r.handle, description: r.description }
      })
      // Post-write read faults (second read onwards).
      if (reads > 1 && opts.dropOnRead) return out.filter((r) => r.id !== opts.dropOnRead)
      if (reads > 1 && opts.duplicateOnRead) return [...out, out.find((r) => r.id === opts.duplicateOnRead)!]
      return out
    },
    async updateProducts(id, data) {
      writes.push({ id, data: { ...data } })
      if (!opts.ignoreWrites) db.get(id)!.description = data.description
    },
  }
  return { mod, db, writes }
}

const AFTER_A = "Комод с 3 ящиками.\n\nЦвет выбирается из 4 вариантов."
const AFTER_B = "Стул на изогнутых ножках."
const rows = (): Row[] => [
  { id: "prod_A1", handle: "co-05-1", description: "old A", title: "Комод", status: "published" },
  { id: "prod_B2", handle: "pv-23-1", description: null, title: "Стул", status: "published" },
]
const packet: EditorialCopyPacket = {
  packet_version: EDITORIAL_COPY_PACKET_VERSION,
  packet_id: "run-test",
  field: EDITORIAL_COPY_FIELD,
  generated_from: "fixture",
  items: [
    { product_id: "prod_A1", handle: "co-05-1", field: "description", before_sha256: sha256Text("old A"), after: AFTER_A },
    { product_id: "prod_B2", handle: "pv-23-1", field: "description", before_sha256: sha256Text(null), after: AFTER_B },
  ],
}
const SHA = computeArtifactSha(packet)
const LOCAL = "postgres://u:p@localhost:5432/medusa-store"

function deps(mod: EditorialProductModule, env: Record<string, string>, input: unknown = packet) {
  const files = new Map<string, unknown>()
  const logs: string[] = []
  return {
    files,
    logs,
    d: {
      productModule: mod,
      env: { DATABASE_URL: LOCAL, EDITORIAL_COPY_TARGET: "local", ...env } as NodeJS.ProcessEnv,
      input,
      writeJson: (name: string, data: unknown) => {
        files.set(name, JSON.parse(JSON.stringify(data)))
        return `/out/${name}`
      },
      log: (l: string) => logs.push(l),
      stamp: "T",
    },
  }
}

async function main() {
  /* dry-run: no writes, report only */
  {
    const f = fakeModule(rows())
    const { d, files } = deps(f.mod, { EDITORIAL_COPY_MODE: "dry-run" })
    const r = await runEditorialCopy(d)
    assert.equal(r.written, 0)
    assert.deepEqual(r.counts, { update: 2, noop: 0, failed: 0 })
    assert.equal(f.writes.length, 0)
    assert.deepEqual([...files.keys()], ["editorial-copy-dry-run-T.json"])
  }

  /* apply: rollback first, description-only writes, verified; untouched fields stay */
  let rollback: unknown
  {
    const f = fakeModule(rows())
    const { d, files } = deps(f.mod, { EDITORIAL_COPY_MODE: "apply", EDITORIAL_COPY_INPUT_SHA: SHA })
    const r = await runEditorialCopy(d)
    assert.equal(r.written, 2)
    assert.deepEqual(f.writes.map((w) => Object.keys(w.data)), [["description"], ["description"]])
    assert.equal(f.db.get("prod_A1")!.description, AFTER_A)
    assert.equal(f.db.get("prod_A1")!.title, "Комод")
    assert.equal(f.db.get("prod_A1")!.status, "published")
    rollback = files.get("editorial-copy-rollback-T.json")
    assert.ok(rollback, "rollback artifact written")

    // Re-run is a noop.
    const again = await runEditorialCopy(deps(f.mod, { EDITORIAL_COPY_MODE: "apply", EDITORIAL_COPY_INPUT_SHA: SHA }).d)
    assert.equal(again.written, 0)
    assert.deepEqual(again.counts, { update: 0, noop: 2, failed: 0 })

    // Rollback restores the exact previous values, including null.
    const rbSha = computeArtifactSha(rollback)
    const rb = await runEditorialCopy(deps(f.mod, { EDITORIAL_COPY_MODE: "rollback", EDITORIAL_COPY_INPUT_SHA: rbSha }, rollback).d)
    assert.equal(rb.written, 2)
    assert.equal(f.db.get("prod_A1")!.description, "old A")
    assert.equal(f.db.get("prod_B2")!.description, null)
  }

  /* fail closed before any write */
  {
    const unknown = fakeModule([rows()[0]])
    await assert.rejects(runEditorialCopy(deps(unknown.mod, { EDITORIAL_COPY_MODE: "apply", EDITORIAL_COPY_INPUT_SHA: SHA }).d), /FAIL_CLOSED/)
    assert.equal(unknown.writes.length, 0, "unknown product: nothing written")

    const drifted = rows()
    drifted[0].description = "owner edit"
    const drift = fakeModule(drifted)
    const { d, files } = deps(drift.mod, { EDITORIAL_COPY_MODE: "apply", EDITORIAL_COPY_INPUT_SHA: SHA })
    await assert.rejects(runEditorialCopy(d), /before-state/)
    assert.equal(drift.writes.length, 0, "drift: nothing written")
    assert.equal(files.has("editorial-copy-rollback-T.json"), false)

    const noSha = fakeModule(rows())
    await assert.rejects(runEditorialCopy(deps(noSha.mod, { EDITORIAL_COPY_MODE: "apply" }).d), /EDITORIAL_COPY_INPUT_SHA/)
    assert.equal(noSha.writes.length, 0)

    const prod = fakeModule(rows())
    await assert.rejects(
      runEditorialCopy({ ...deps(prod.mod, { EDITORIAL_COPY_MODE: "dry-run" }).d, env: { DATABASE_URL: "postgres://u:p@db:5432/woodright_production", EDITORIAL_COPY_TARGET: "production", EDITORIAL_COPY_MODE: "dry-run" } as NodeJS.ProcessEnv }),
      /FAIL_CLOSED/
    )

    const bad = fakeModule(rows())
    await assert.rejects(runEditorialCopy(deps(bad.mod, { EDITORIAL_COPY_MODE: "dry-run" }, { ...packet, extra: 1 }).d), /invalid packet/)
  }

  /* post-write verify is strict */
  for (const [label, opts] of [
    ["missing row", { dropOnRead: "prod_B2" }],
    ["duplicate row", { duplicateOnRead: "prod_A1" }],
    ["write ignored", { ignoreWrites: true }],
  ] as const) {
    const f = fakeModule(rows(), opts)
    await assert.rejects(
      runEditorialCopy(deps(f.mod, { EDITORIAL_COPY_MODE: "apply", EDITORIAL_COPY_INPUT_SHA: SHA }).d),
      /post-write verify failed/,
      label
    )
  }

  /* null rollback with the row missing afterwards must not pass as "restored to null" */
  {
    const f = fakeModule(rows())
    await runEditorialCopy(deps(f.mod, { EDITORIAL_COPY_MODE: "apply", EDITORIAL_COPY_INPUT_SHA: SHA }).d)
    const rbModule = fakeModule(
      [...f.db.values()].map((r) => ({ ...r })),
      { dropOnRead: "prod_B2" }
    )
    const rbSha = computeArtifactSha(rollback)
    await assert.rejects(
      runEditorialCopy(deps(rbModule.mod, { EDITORIAL_COPY_MODE: "rollback", EDITORIAL_COPY_INPUT_SHA: rbSha }, rollback).d),
      /prod_B2|pv-23-1:missing_after_write/
    )
  }

  console.log("editorial-copy run fidelity: ok")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
