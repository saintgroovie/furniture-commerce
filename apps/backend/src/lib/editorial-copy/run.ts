/**
 * Importer core for `product.description`, with I/O injected so it can be tested without Medusa.
 *
 * Flow: canonical input SHA -> gate -> strict parse -> read live rows for the input ids only ->
 * plan (any unknown id / handle mismatch / drift / duplicate fails the run before a write) ->
 * report -> (apply) rollback artifact, description-only updates, re-read + strict verify.
 */
import { assertEditorialCopyGate } from "../../scripts/apply-editorial-copy-gate"
import {
  EDITORIAL_COPY_FIELD,
  computeArtifactSha,
  parseEditorialCopyPacket,
  parseEditorialRollbackArtifact,
} from "./packet"
import {
  buildDescriptionUpdates,
  buildRollbackArtifact,
  planEditorialCopy,
  planEditorialRollback,
  verifyAfterWrite,
  type EditorialPlan,
  type LiveProductRow,
} from "./plan"

export type EditorialProductModule = {
  listProducts: (
    filters: { id: string[] },
    config: { select: string[]; take: number }
  ) => Promise<Array<{ id: string; handle: string; description?: string | null }>>
  updateProducts: (id: string, data: { description: string | null }) => Promise<unknown>
}

export type EditorialRunDeps = {
  productModule: EditorialProductModule
  env: NodeJS.ProcessEnv
  /** Parsed JSON of the packet or rollback artifact. */
  input: unknown
  /** Persist a JSON artifact; returns where it went. Required before any write. */
  writeJson: (name: string, data: unknown) => string
  log: (line: string) => void
  stamp: string
}

export type EditorialRunResult = {
  mode: string
  target: string
  counts: EditorialPlan["counts"]
  written: number
  reportPath: string
  rollbackPath: string | null
}

function toLive(rows: Array<{ id: string; handle: string; description?: string | null }>): LiveProductRow[] {
  return rows.map((r) => ({
    id: r.id,
    handle: r.handle,
    description: typeof r.description === "string" ? r.description : null,
  }))
}

export async function runEditorialCopy(deps: EditorialRunDeps): Promise<EditorialRunResult> {
  const inputSha = computeArtifactSha(deps.input)
  const gate = assertEditorialCopyGate({ env: deps.env, inputSha })
  if (!gate.ok) throw new Error(gate.message)

  let ids: string[]
  let packetId: string
  let planFor: (live: LiveProductRow[]) => EditorialPlan
  if (gate.rollback) {
    const parsed = parseEditorialRollbackArtifact(deps.input)
    if (!parsed.ok) throw new Error(`FAIL_CLOSED: invalid rollback artifact: ${parsed.errors.join("; ")}`)
    const artifact = parsed.value
    ids = artifact.items.map((i) => i.product_id)
    packetId = artifact.packet_id
    planFor = (live) => planEditorialRollback(artifact, live)
  } else {
    const parsed = parseEditorialCopyPacket(deps.input)
    if (!parsed.ok) throw new Error(`FAIL_CLOSED: invalid packet: ${parsed.errors.join("; ")}`)
    const packet = parsed.value
    ids = packet.items.map((i) => i.product_id)
    packetId = packet.packet_id
    planFor = (live) => planEditorialCopy(packet, live)
  }

  const select = ["id", "handle", EDITORIAL_COPY_FIELD]
  const read = async () =>
    ids.length ? toLive(await deps.productModule.listProducts({ id: ids }, { select, take: ids.length + 1 })) : []
  const plan = planFor(await read())

  const reportPath = deps.writeJson(`editorial-copy-${gate.mode}-${deps.stamp}.json`, {
    target: gate.target,
    mode: gate.mode,
    db: gate.dbName,
    input_sha256: inputSha,
    packet_id: packetId,
    counts: plan.counts,
    failures: plan.failures,
    diff: plan.items
      .filter((i) => i.action === "update")
      .map((i) => ({ handle: i.handle, product_id: i.product_id, before: i.before, after: i.after })),
  })
  deps.log(`[editorial-copy] ${gate.mode.toUpperCase()} target=${gate.target} db=${gate.dbName} counts=${JSON.stringify(plan.counts)} report=${reportPath}`)

  if (!plan.ok) {
    for (const f of plan.failures.slice(0, 20)) deps.log(`[editorial-copy] ${f.code} ${f.handle}: ${f.detail}`)
    throw new Error(`FAIL_CLOSED: ${plan.counts.failed} row(s) failed the before-state check; nothing written`)
  }
  const base = { mode: gate.mode, target: gate.target, counts: plan.counts, reportPath }
  if (!gate.writes) return { ...base, written: 0, rollbackPath: null }

  const updates = buildDescriptionUpdates(plan)
  let rollbackPath: string | null = null
  if (!gate.rollback) {
    const rollback = buildRollbackArtifact(plan, { packet_id: packetId, packet_sha256: inputSha })
    rollbackPath = deps.writeJson(`editorial-copy-rollback-${deps.stamp}.json`, rollback)
    deps.log(`[editorial-copy] rollback artifact ${rollbackPath} sha256=${computeArtifactSha(rollback)}`)
  }

  for (const u of updates) {
    await deps.productModule.updateProducts(u.id, { description: u.data.description })
  }

  const verifyFailures = verifyAfterWrite(plan, await read())
  if (verifyFailures.length) {
    throw new Error(
      `FAIL_CLOSED: post-write verify failed: ${verifyFailures.map((f) => `${f.handle}:${f.code}`).join(", ")}`
    )
  }
  deps.log(`[editorial-copy] wrote ${updates.length} description(s); verified ${plan.items.length} row(s)`)
  return { ...base, written: updates.length, rollbackPath }
}
