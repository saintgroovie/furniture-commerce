#!/usr/bin/env node
const assert = require("assert")
const fs = require("fs")
const os = require("os")
const path = require("path")
const { classifyMedia } = require("../lib/media-classify.cjs")
const { buildMutationPreview, isBlankPending } = require("../lib/mutation-preview.cjs")
const {
  ensureWorkspace,
  applyDecision,
  undoLast,
  loadState,
  appendHistoryEvent,
  saveState,
} = require("../lib/decision-store.cjs")
const { enrichMedia } = require("../lib/media-enrich.cjs")
const { validatePacket } = require("../lib/packet-validate.cjs")
const { decisionKey } = require("../lib/decision-key.cjs")

function testBlankPending() {
  assert.strictEqual(isBlankPending(null), true)
  assert.strictEqual(isBlankPending({ status: "pending" }), true)
  assert.strictEqual(isBlankPending({ status: "approved", decision: "approve_proposed_category" }), false)
}

function testMediaClassify() {
  const no = classifyMedia({ confirmed_no_image: true, images: [] })
  assert.strictEqual(no.status, "confirmed_no_image")
  assert.strictEqual(no.auto_defer_allowed, true)

  const amb = classifyMedia({ media_binding: "ambiguous", images: ["http://x/a.jpg"] })
  assert.strictEqual(amb.status, "ambiguous_media_binding")
  assert.strictEqual(amb.auto_defer_allowed, false)

  const ok = classifyMedia({ image_url: "https://example.com/a.jpg" })
  assert.strictEqual(ok.status, "media_present")
}

function testMutationPreviewNoOp() {
  const rows = [
    {
      product_id: "prod_1",
      handle: "h",
      bucket: "category_gap",
      field_keys: ["category"],
      current_category: null,
      proposed_category: "beds",
    },
  ]
  const preview = buildMutationPreview(rows, {}, { packet_id: "p" })
  assert.strictEqual(preview.result, "no_approved_mutations")
  assert.strictEqual(preview.mutations.length, 0)

  const withPending = buildMutationPreview(
    rows,
    { "prod_1::category_gap::category": { status: "pending", decision: "" } },
    {}
  )
  assert.strictEqual(withPending.result, "no_approved_mutations")

  const withApproved = buildMutationPreview(
    rows,
    {
      "prod_1::category_gap::category": {
        status: "approved",
        decision: "approve_proposed_category",
        current_value: null,
        proposed_value: "beds",
        source_fingerprint: "abc",
        reviewer: "owner",
      },
    },
    {}
  )
  assert.strictEqual(withApproved.approved_count, 1)
  assert.strictEqual(withApproved.mutations[0].product_id, "prod_1")
  assert.strictEqual(withApproved.authorized_for_apply, false)

  const noFp = buildMutationPreview(
    rows,
    {
      "prod_1::category_gap::category": {
        status: "approved",
        decision: "approve_proposed_category",
        current_value: null,
        proposed_value: "beds",
        reviewer: "owner",
      },
    },
    {}
  )
  assert.strictEqual(noFp.result, "no_approved_mutations")
}

function testIndependentFieldsAndUndo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wr-owner-dec-"))
  // minimal identity
  fs.writeFileSync(path.join(dir, "packet-source"), "x")
  const ws = path.join(dir, "ws")
  const pkt = path.join(dir, "pkt")
  fs.mkdirSync(pkt)
  fs.writeFileSync(
    path.join(pkt, "source-identity.json"),
    JSON.stringify({ packet_id: "t", source_bundle_id: "b", source_checksum_sha256: "a".repeat(64) })
  )
  ensureWorkspace(ws, pkt)
  applyDecision(
    ws,
    {
      product_id: "prod_1",
      bucket: "category_gap",
      field: "category",
      decision: "approve_proposed_category",
      status: "approved",
      reviewer: "leonid",
      current_value: null,
      proposed_value: "beds",
      source_fingerprint: "abc123",
    },
    "a".repeat(64)
  )
  let st = loadState(ws)
  assert.strictEqual(st.decisions["prod_1::category_gap::category"].status, "approved")
  assert.ok(st.history.length >= 1)
  assert.throws(
    () =>
      applyDecision(
        ws,
        {
          product_id: "prod_1",
          bucket: "category_gap",
          field: "category",
          decision: "defer",
          source_fingerprint: "abc123",
          also_set_collection: "x",
        },
        "a".repeat(64)
      ),
    /independent_fields_violation/
  )
  // title_fallback must not collide
  applyDecision(
    ws,
    {
      product_id: "prod_1",
      bucket: "title_fallback",
      field: "category",
      decision: "defer",
      status: "deferred",
      reviewer: "leonid",
      current_value: null,
      proposed_value: "beds",
      source_fingerprint: "abc123",
    },
    "a".repeat(64)
  )
  st = loadState(ws)
  assert.strictEqual(st.decisions["prod_1::category_gap::category"].status, "approved")
  assert.strictEqual(st.decisions["prod_1::title_fallback::category"].status, "deferred")
  undoLast(ws)
  st = loadState(ws)
  assert.ok(st.history.some((h) => h.event_type === "undo"))
  assert.ok(st.history.filter((h) => h.event_type === "undo").every((h) => h.bucket && h.decision_key))
  assert.ok(!st.decisions["prod_1::title_fallback::category"] || st.decisions["prod_1::title_fallback::category"].status === "pending")
  // second consecutive undo restores category_gap approval -> pending
  undoLast(ws)
  st = loadState(ws)
  assert.strictEqual(st.history.filter((h) => h.event_type === "undo").length, 2)
  assert.ok(!st.decisions["prod_1::category_gap::category"] || st.decisions["prod_1::category_gap::category"].status === "pending")
}

function testAutoDeferHistoryJsonl() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wr-owner-autodefer-"))
  const ws = path.join(dir, "ws")
  const pkt = path.join(dir, "pkt")
  fs.mkdirSync(pkt)
  fs.writeFileSync(
    path.join(pkt, "source-identity.json"),
    JSON.stringify({ packet_id: "t", source_bundle_id: "b", source_checksum_sha256: "a".repeat(64) })
  )
  ensureWorkspace(ws, pkt)
  const state = loadState(ws)
  const key = decisionKey("prod_x", "category_gap", "category")
  state.decisions[key] = {
    product_id: "prod_x",
    bucket: "category_gap",
    field: "category",
    decision: "auto_deferred_no_image",
    status: "auto_deferred_no_image",
    source_fingerprint: "fp1",
    confirms_product_fields: false,
  }
  appendHistoryEvent(ws, state, {
    ts: new Date().toISOString(),
    event_type: "auto_defer_no_image",
    decision_key: key,
    product_id: "prod_x",
    bucket: "category_gap",
    field: "category",
    previous_state: { status: "pending" },
    next_state: state.decisions[key],
    actor: "system-auto-defer",
    packet_checksum: "a".repeat(64),
  })
  saveState(ws, state)
  const jsonl = fs.readFileSync(path.join(ws, "history.jsonl"), "utf8").trim().split("\n")
  assert.ok(jsonl.some((line) => JSON.parse(line).event_type === "auto_defer_no_image"))
  undoLast(ws)
  const after = loadState(ws)
  assert.ok(after.history.some((h) => h.event_type === "undo" && typeof h.undoes_index === "number"))
  assert.ok(!after.decisions[key] || after.decisions[key].status === "pending")
}

function testEnrich() {
  const rows = enrichMedia(
    [{ product_id: "p1", title: "T" }],
    { p1: { id: "p1", thumbnail: "/static/a.jpg", images: [] } },
    "https://woodright-demo.ru"
  )
  assert.strictEqual(rows[0].image_url, "https://woodright-demo.ru/static/a.jpg")
  assert.strictEqual(rows[0].confirmed_no_image, false)

  const empty = enrichMedia([{ product_id: "p2" }], { p2: { id: "p2" } }, "https://woodright-demo.ru")
  assert.strictEqual(empty[0].confirmed_no_image, true)
}

function testLivePacketIfPresent() {
  const pkt =
    "/Users/leonidmbp/Documents/projects/woodright-owner-artifacts/catalog-owner-review-20260722T095022Z"
  if (!fs.existsSync(pkt)) return
  const r = validatePacket(pkt)
  assert.strictEqual(r.ok, true, r.errors && r.errors.join("; "))
}

function main() {
  testBlankPending()
  testMediaClassify()
  testMutationPreviewNoOp()
  testIndependentFieldsAndUndo()
  testAutoDeferHistoryJsonl()
  testEnrich()
  testLivePacketIfPresent()
  console.log("PASS owner-decision-workspace unit tests")
}

main()
