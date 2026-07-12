/**
 * Kids RoomSet membership fail-closed + lean id fidelity (no Next runtime).
 * Run from apps/storefront:
 *   ../backend/node_modules/.bin/tsx src/lib/kids-membership.fidelity.test.ts
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  KidsMembershipError,
  fetchKidsRoomSetMembership,
  resolveKidsProducts,
  type KidsRoomSetMembership,
} from "./kids"

function emptyMembership(
  overrides: Partial<KidsRoomSetMembership> = {}
): KidsRoomSetMembership {
  return {
    kidsRoomSetProductIds: new Set(),
    nonKidsRoomSetProductIds: new Set(),
    ...overrides,
  }
}

function storeProduct(
  id: string,
  extras: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id,
    title: id,
    handle: id,
    status: "published",
    product_classification: { product_type: "STANDARD" },
    metadata: {},
    ...extras,
  }
}

function leanDetail(productIds: string[]) {
  return {
    room_set: {
      items: productIds.map((id) => ({ product: { id } })),
    },
  }
}

async function main() {
  await assert.rejects(
    () =>
      fetchKidsRoomSetMembership({
        getRoomSets: async () => {
          throw new Error("list down")
        },
        getRoomSetProductIdsBySlug: async () => {
          throw new Error("should not be called")
        },
      }),
    (err: unknown) =>
      err instanceof KidsMembershipError &&
      err.message.includes("Failed to load room sets")
  )

  await assert.rejects(
    () =>
      fetchKidsRoomSetMembership({
        getRoomSets: async () => ({
          room_sets: [
            { slug: "kids-a", room_type: "детская" },
            { slug: "kids-b", room_type: "детская" },
          ],
        }),
        getRoomSetProductIdsBySlug: async (slug: string) => {
          if (slug === "kids-b") throw new Error("detail timeout")
          return leanDetail(["p-kids-a"])
        },
      }),
    (err: unknown) =>
      err instanceof KidsMembershipError && err.message.includes("kids-b")
  )

  await assert.rejects(
    () =>
      fetchKidsRoomSetMembership({
        getRoomSets: async () => ({
          room_sets: [{ slug: "adult-1", room_type: "гостиная" }],
        }),
        getRoomSetProductIdsBySlug: async () =>
          Promise.reject(new Error("TimeoutError: aborted")),
      }),
    (err: unknown) => err instanceof KidsMembershipError
  )

  const membership = await fetchKidsRoomSetMembership({
    getRoomSets: async () => ({
      room_sets: [
        { slug: "kids-only", room_type: "детская" },
        { slug: "living", room_type: "гостиная" },
      ],
    }),
    getRoomSetProductIdsBySlug: async (slug: string) => {
      if (slug === "kids-only") return leanDetail(["room-kids", "shared"])
      return leanDetail(["shared", "adult"])
    },
  })
  assert.equal(membership.kidsRoomSetProductIds.has("room-kids"), true)
  assert.equal(membership.kidsRoomSetProductIds.has("shared"), false)
  assert.equal(membership.nonKidsRoomSetProductIds.has("shared"), true)
  assert.equal(membership.nonKidsRoomSetProductIds.has("adult"), true)

  await assert.rejects(
    () =>
      resolveKidsProducts({
        storeProducts: [storeProduct("p1")],
        membership: Promise.reject(new KidsMembershipError("injected list fail")),
      }),
    (err: unknown) =>
      err instanceof KidsMembershipError &&
      err.message.includes("injected list fail")
  )

  const catalogPage = readFileSync(
    resolve(process.cwd(), "src/app/catalog/page.tsx"),
    "utf8"
  )
  assert.equal(
    /kidsIds\s*=\s*new Set\(\)/.test(catalogPage),
    false,
    "catalog page must not fail-open with empty kidsIds Set"
  )
  assert.match(catalogPage, /fetchKidsRoomSetMembership/)
  assert.match(catalogPage, /Promise\.all/)

  // Rehydrate room-set kids from store by id (lean is not card SoT).
  const roomKids = storeProduct("room-kids-1", {
    metadata: { collection: "oliver" },
  })
  const fromRoom = await resolveKidsProducts({
    storeProducts: [roomKids],
    membership: emptyMembership({
      kidsRoomSetProductIds: new Set(["room-kids-1"]),
    }),
  })
  assert.equal(fromRoom.ids.has("room-kids-1"), true)
  assert.equal(fromRoom.products[0]?.id, "room-kids-1")
  assert.equal(
    (fromRoom.products[0]?.metadata as { collection?: string })?.collection,
    "oliver"
  )

  // Id in membership but missing from store → still in ids (catalog exclusion),
  // not in products (no lean stub card).
  const orphan = await resolveKidsProducts({
    storeProducts: [],
    membership: emptyMembership({
      kidsRoomSetProductIds: new Set(["orphan-1"]),
    }),
  })
  assert.equal(orphan.ids.has("orphan-1"), true)
  assert.equal(orphan.products.length, 0)

  const kidsMeta = storeProduct("kids-1", {
    metadata: { storefront_section: "kids" },
  })
  const adult = storeProduct("adult-1")
  const resolved = await resolveKidsProducts({
    storeProducts: [kidsMeta, adult],
    membership: emptyMembership(),
  })
  assert.equal(resolved.ids.has("kids-1"), true)
  assert.equal(resolved.ids.has("adult-1"), false)

  const shared = storeProduct("shared-1", {
    metadata: { storefront_section: "kids" },
  })
  const excluded = await resolveKidsProducts({
    storeProducts: [shared],
    membership: emptyMembership({
      nonKidsRoomSetProductIds: new Set(["shared-1"]),
    }),
  })
  assert.equal(excluded.ids.has("shared-1"), false)

  // Room-set BESPOKE: not kids assortment; not in kids ids (main excludes via classification).
  const roomBespoke = storeProduct("room-bsp-1", {
    product_classification: { product_type: "BESPOKE" },
  })
  const roomBespokeResolved = await resolveKidsProducts({
    storeProducts: [roomBespoke],
    membership: emptyMembership({
      kidsRoomSetProductIds: new Set(["room-bsp-1"]),
    }),
  })
  assert.equal(roomBespokeResolved.ids.has("room-bsp-1"), false)
  assert.equal(roomBespokeResolved.products.length, 0)

  // Metadata kids + BESPOKE classification still excluded.
  const metaBespoke = storeProduct("meta-bsp-1", {
    metadata: { storefront_section: "kids" },
    product_classification: { product_type: "BESPOKE" },
  })
  const metaBespokeResolved = await resolveKidsProducts({
    storeProducts: [metaBespoke],
    membership: emptyMembership(),
  })
  assert.equal(metaBespokeResolved.ids.has("meta-bsp-1"), false)

  await assert.rejects(
    () =>
      fetchKidsRoomSetMembership({
        getRoomSets: async () => ({}) as { room_sets: never[] },
        getRoomSetProductIdsBySlug: async () => leanDetail([]),
      }),
    (err: unknown) =>
      err instanceof KidsMembershipError &&
      err.message.includes("room_sets missing")
  )

  await assert.rejects(
    () =>
      fetchKidsRoomSetMembership({
        getRoomSets: async () => ({
          room_sets: [{ room_type: "детская" }],
        }),
        getRoomSetProductIdsBySlug: async () => leanDetail([]),
      }),
    (err: unknown) =>
      err instanceof KidsMembershipError && err.message.includes("missing slug")
  )

  await assert.rejects(
    () =>
      fetchKidsRoomSetMembership({
        getRoomSets: async () => ({
          room_sets: [{ slug: "kids-a", room_type: "детская" }],
        }),
        getRoomSetProductIdsBySlug: async () =>
          ({ room_set: { items: [{ product: {} }] } }) as ReturnType<
            typeof leanDetail
          >,
      }),
    (err: unknown) =>
      err instanceof KidsMembershipError &&
      err.message.includes("missing product.id")
  )

  await assert.rejects(
    () =>
      fetchKidsRoomSetMembership({
        getRoomSets: async () => ({
          room_sets: [{ slug: "kids-a", room_type: "детская" }],
        }),
        getRoomSetProductIdsBySlug: async () => ({}) as ReturnType<
          typeof leanDetail
        >,
      }),
    (err: unknown) =>
      err instanceof KidsMembershipError &&
      err.message.includes("Invalid lean room set detail")
  )

  await assert.rejects(
    () =>
      fetchKidsRoomSetMembership({
        getRoomSets: async () =>
          ({ room_sets: [null] }) as { room_sets: Array<{ slug?: string }> },
        getRoomSetProductIdsBySlug: async () => leanDetail([]),
      }),
    (err: unknown) =>
      err instanceof KidsMembershipError &&
      err.message.includes("null or non-object")
  )

  await assert.rejects(
    () =>
      fetchKidsRoomSetMembership({
        getRoomSets: async () => ({
          room_sets: [{ slug: "kids-a", room_type: "детская" }],
        }),
        getRoomSetProductIdsBySlug: async () => null as never,
      }),
    (err: unknown) =>
      err instanceof KidsMembershipError &&
      err.message.includes("null or non-object")
  )

  await assert.rejects(
    () =>
      fetchKidsRoomSetMembership({
        getRoomSets: async () => ({
          room_sets: [{ slug: "kids-a", room_type: "детская" }],
        }),
        getRoomSetProductIdsBySlug: async () =>
          ({ room_set: { items: [null] } }) as never,
      }),
    (err: unknown) =>
      err instanceof KidsMembershipError &&
      err.message.includes("null/non-object")
  )

  // Empty list is valid success.
  const empty = await fetchKidsRoomSetMembership({
    getRoomSets: async () => ({ room_sets: [] }),
    getRoomSetProductIdsBySlug: async () => {
      throw new Error("should not be called")
    },
  })
  assert.equal(empty.kidsRoomSetProductIds.size, 0)
  assert.equal(empty.nonKidsRoomSetProductIds.size, 0)

  console.log("kids-membership.fidelity.test.ts: ok")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
