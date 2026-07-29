/**
 * RoomSet index card meta: V1 Cloud must not inherit Greenwich from shared style.
 *
 *   node_modules/.bin/tsx src/lib/room-set-card-meta.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  formatRoomSetCardMeta,
  resolveRoomSetCardIdentityLabel,
  ROOMSET_CARD_IDENTITY_BY_SLUG,
} from "./room-set-card-meta"

const MANIFEST_SHA_EXPECTED =
  "71ef39d2699330bb2c0bca59f968bc695151b87d9ad9b7f23d9b35be0c07b67e"

// --- F001: Greenwich / Cloud chips ---

assert.equal(
  formatRoomSetCardMeta({
    slug: "spalnya-greenwich",
    room_type: "спальня",
    style: "Greenwich",
  }),
  "спальня · Greenwich"
)

assert.equal(
  formatRoomSetCardMeta({
    slug: "spalnya-cloud",
    room_type: "спальня",
    style: "Greenwich", // shared collection style in immutable manifest
  }),
  "спальня · Cloud",
  "Cloud must not display Greenwich from style"
)

assert.equal(
  resolveRoomSetCardIdentityLabel({
    slug: "spalnya-cloud",
    style: "Greenwich",
  }),
  "Cloud"
)

// Product order / first linked product must not affect meta (slug-only identity)
assert.equal(
  formatRoomSetCardMeta({
    slug: "spalnya-cloud",
    room_type: "спальня",
    style: "Greenwich",
  }),
  formatRoomSetCardMeta({
    slug: "spalnya-cloud",
    room_type: "спальня",
    style: "AnythingFromFirstProduct",
  })
)

// Unknown RoomSet: calm fallback to style; never invent V1 Cloud→Greenwich via slug map miss
assert.equal(
  formatRoomSetCardMeta({
    slug: "unknown-room",
    room_type: "спальня",
    style: "сканди",
  }),
  "спальня · сканди"
)

assert.equal(
  formatRoomSetCardMeta({
    slug: "unknown-room",
    room_type: "спальня",
    style: "",
  }),
  "спальня"
)

assert.equal(ROOMSET_CARD_IDENTITY_BY_SLUG["spalnya-greenwich"], "Greenwich")
assert.equal(ROOMSET_CARD_IDENTITY_BY_SLUG["spalnya-cloud"], "Cloud")

// Card component wires the helper (not raw style join)
const card = readFileSync(
  resolve(__dirname, "../components/room-set-card.tsx"),
  "utf8"
)
assert.match(card, /formatRoomSetCardMeta/)
assert.doesNotMatch(
  card,
  /\[roomSet\.room_type,\s*roomSet\.style\]/,
  "must not join raw style for V1 cards"
)

// Buyer card order contract remains Greenwich → Cloud in manifest
const manifestPath = resolve(
  __dirname,
  "../../../backend/src/scripts/seed-rooms-v1-manifest.ts"
)
const manifestSrc = readFileSync(manifestPath, "utf8")
assert.match(
  manifestSrc,
  /ROOMS_V1_BUYER_CARD_ORDER\s*=\s*\[[\s\S]*?"spalnya-greenwich"[\s\S]*?"spalnya-cloud"/
)
assert.match(manifestSrc, /style:\s*"Greenwich"/)
assert.match(
  manifestSrc,
  /slug:\s*"spalnya-cloud"[\s\S]*?style:\s*"Greenwich"/,
  "immutable manifest still stores collection style Greenwich on Cloud"
)

// Manifest SHA pin unchanged (content hash of expected constant + file pin)
assert.match(
  manifestSrc,
  new RegExp(MANIFEST_SHA_EXPECTED.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
)
assert.equal(
  createHash("sha256").update(MANIFEST_SHA_EXPECTED, "utf8").digest("hex").length,
  64
)

console.log("room-set-card-meta.fidelity.test.ts: ok")
