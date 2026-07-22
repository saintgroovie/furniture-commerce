/**
 * Merchandising order policy + pagination-slice invariants.
 *
 *   yarn --cwd apps/backend exec tsx src/lib/catalog-merchandising-order.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  MERCHANDISING_ITEM_TIER,
  buildMerchandisingSortKey,
  inferItemTypeKeyFromText,
  resolveMerchandisingItemType,
  sortProductsByMerchandisingOrder,
} from "./catalog-merchandising-order"

function product(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    id: partial.id ?? "id",
    handle: partial.handle ?? "handle",
    title: partial.title ?? "Title",
    metadata: partial.metadata ?? {},
    ...partial,
  }
}

// --- Unit: furniture above accessories ---
{
  const bed = product({
    id: "bed",
    handle: "bed",
    title: "Кровать",
    metadata: { collection: "oliver", category_handle: "krovati" },
  })
  const mirror = product({
    id: "mirror",
    handle: "mirror",
    title: "Зеркало навесное",
    metadata: { collection: "oliver", category_handle: "zerkala" },
  })
  const clock = product({
    id: "clock",
    handle: "clock",
    title: "Часы",
    metadata: { collection: "oliver", category_handle: "chasy" },
  })
  const sorted = sortProductsByMerchandisingOrder([mirror, clock, bed])
  assert.deepEqual(
    sorted.map((p) => p.id),
    ["bed", "mirror", "clock"]
  )
  assert.equal(
    resolveMerchandisingItemType(mirror).tier,
    MERCHANDISING_ITEM_TIER.ACCESSORY
  )
  assert.equal(
    resolveMerchandisingItemType(clock).tier,
    MERCHANDISING_ITEM_TIER.ACCESSORY
  )
  assert.ok(
    resolveMerchandisingItemType(bed).tier <
      resolveMerchandisingItemType(mirror).tier
  )
}

// --- Unknown type preserved, deterministic ---
{
  const unknown = product({
    id: "u1",
    handle: "odd-sku",
    title: "Непонятный объект XYZ",
    metadata: { collection: "oliver" },
  })
  const bed = product({
    id: "b1",
    handle: "bed-1",
    title: "Кровать",
    metadata: { collection: "oliver", category_handle: "krovati" },
  })
  const sorted = sortProductsByMerchandisingOrder([unknown, bed])
  assert.equal(sorted.length, 2)
  assert.equal(sorted[0]!.id, "b1")
  assert.equal(sorted[1]!.id, "u1")
  assert.equal(
    resolveMerchandisingItemType(unknown).tier,
    MERCHANDISING_ITEM_TIER.UNKNOWN
  )
  assert.equal(resolveMerchandisingItemType(unknown).source, "unknown")
}

// --- Tie-breaker stable (title → handle → id) ---
{
  const a = product({
    id: "id-b",
    handle: "h-b",
    title: "Комод А",
    metadata: { collection: "oliver", category_handle: "komody" },
  })
  const b = product({
    id: "id-a",
    handle: "h-a",
    title: "Комод А",
    metadata: { collection: "oliver", category_handle: "komody" },
  })
  const once = sortProductsByMerchandisingOrder([a, b]).map((p) => p.id)
  const twice = sortProductsByMerchandisingOrder([b, a]).map((p) => p.id)
  assert.deepEqual(once, twice)
  assert.deepEqual(once, ["id-a", "id-b"])
}

// --- Normalization: case / spaces do not break mapping ---
{
  const p = product({
    title: "Кровать",
    metadata: { collection: "  Greenwich ", category_handle: " Krovati " },
  })
  const key = buildMerchandisingSortKey(p)
  assert.equal(key.collectionKey, "greenwich")
  assert.equal(key.itemTypeKey, "krovati")
  assert.equal(key.itemTier, MERCHANDISING_ITEM_TIER.ANCHOR)
}

// --- Structured category wins over misleading title substring ---
{
  const bedNamedWeird = product({
    title: "Кровать с зеркальной отделкой",
    metadata: { collection: "oliver", category_handle: "krovati" },
  })
  const resolved = resolveMerchandisingItemType(bedNamedWeird)
  assert.equal(resolved.key, "krovati")
  assert.equal(resolved.source, "category_handle")
  assert.equal(resolved.tier, MERCHANDISING_ITEM_TIER.ANCHOR)
}

// --- Fail-closed: шкаф с зеркалом under zerkala is furniture, not accessory ---
{
  const wardrobe = product({
    id: "ol-01-2",
    handle: "ol-01-2",
    title: "Шкаф для одежды 1-дв. с зеркалом (ручка слева/справа)",
    metadata: { collection: "oliver", category_handle: "zerkala" },
  })
  const resolved = resolveMerchandisingItemType(wardrobe)
  assert.equal(resolved.source, "category_override")
  assert.notEqual(resolved.tier, MERCHANDISING_ITEM_TIER.ACCESSORY)
  assert.equal(resolved.key, "shkafy")
}

// --- Random substring must not create accessory ---
{
  const desk = product({
    title: "Стол письменный Часовой ряд",
    metadata: { collection: "oliver", category_handle: "stoly" },
  })
  assert.equal(resolveMerchandisingItemType(desk).key, "stoly")
  assert.equal(
    resolveMerchandisingItemType(desk).tier,
    MERCHANDISING_ITEM_TIER.ANCHOR
  )
  // Without category, "Часовой" alone should not force clocks if стол present
  assert.equal(
    inferItemTypeKeyFromText("стол письменный часовой ряд"),
    "stoly"
  )
}

// --- Title fallback: nightstand must not become bed via «прикроватная» ---
{
  const nightstand = product({
    title: "Прикроватная тумба с 2 ящиками",
    handle: "greenwich-gr-08-1",
    metadata: { collection: "greenwich" },
  })
  assert.equal(resolveMerchandisingItemType(nightstand).key, "tumby")
  assert.equal(
    resolveMerchandisingItemType(nightstand).tier,
    MERCHANDISING_ITEM_TIER.SUPPORTING
  )
}

// --- Title fallback for Greenwich-style missing category ---
{
  const mirror = product({
    handle: "greenwich-gr-09-1-mirror",
    title: "Зеркало навесное",
    metadata: { collection: "greenwich" },
  })
  const dresser = product({
    handle: "greenwich-gr-05-1",
    title: "Комод",
    metadata: { collection: "greenwich" },
  })
  assert.equal(resolveMerchandisingItemType(mirror).key, "zerkala")
  assert.equal(
    resolveMerchandisingItemType(mirror).source,
    "title_fallback"
  )
  assert.equal(resolveMerchandisingItemType(dresser).key, "komody")
  const sorted = sortProductsByMerchandisingOrder([mirror, dresser])
  assert.deepEqual(
    sorted.map((p) => p.handle),
    ["greenwich-gr-05-1", "greenwich-gr-09-1-mirror"]
  )
}

// --- Collection blocks do not interleave ---
{
  const products = [
    product({
      id: "o-m",
      handle: "o-m",
      title: "Зеркало",
      metadata: { collection: "oliver", category_handle: "zerkala" },
    }),
    product({
      id: "g-b",
      handle: "g-b",
      title: "Кровать",
      metadata: { collection: "greenwich", category_handle: "krovati" },
    }),
    product({
      id: "o-b",
      handle: "o-b",
      title: "Кровать",
      metadata: { collection: "oliver", category_handle: "krovati" },
    }),
    product({
      id: "g-m",
      handle: "g-m",
      title: "Зеркало",
      metadata: { collection: "greenwich", category_handle: "zerkala" },
    }),
  ]
  const sorted = sortProductsByMerchandisingOrder(products)
  const collections = sorted.map(
    (p) => (p.metadata as { collection: string }).collection
  )
  assert.deepEqual(collections, [
    "greenwich",
    "greenwich",
    "oliver",
    "oliver",
  ])
  assert.deepEqual(
    sorted.map((p) => p.id),
    ["g-b", "g-m", "o-b", "o-m"]
  )
}

// --- Unassigned collection preserved after known collections ---
{
  const unassigned = product({
    id: "x",
    title: "Кровать",
    metadata: { category_handle: "krovati" },
  })
  const greenwich = product({
    id: "g",
    title: "Кровать",
    metadata: { collection: "greenwich", category_handle: "krovati" },
  })
  const sorted = sortProductsByMerchandisingOrder([unassigned, greenwich])
  assert.deepEqual(
    sorted.map((p) => p.id),
    ["g", "x"]
  )
}

// --- Input not mutated ---
{
  const original = [
    product({
      id: "2",
      title: "Зеркало",
      metadata: { collection: "oliver", category_handle: "zerkala" },
    }),
    product({
      id: "1",
      title: "Кровать",
      metadata: { collection: "oliver", category_handle: "krovati" },
    }),
  ]
  const freeze = JSON.stringify(original)
  const sorted = sortProductsByMerchandisingOrder(original)
  assert.equal(JSON.stringify(original), freeze)
  assert.notEqual(sorted[0], original[0])
  assert.deepEqual(
    sorted.map((p) => p.id),
    ["1", "2"]
  )
}

// --- First product is not accessory when furniture exists ---
{
  const pool = [
    product({
      id: "m",
      title: "Зеркало навесное",
      handle: "greenwich-gr-09-1-mirror",
      metadata: { collection: "greenwich" },
    }),
    product({
      id: "c",
      title: "Комод",
      handle: "greenwich-gr-05-1",
      metadata: { collection: "greenwich" },
    }),
    product({
      id: "clock",
      title: "Часы",
      metadata: { collection: "oliver", category_handle: "chasy" },
    }),
  ]
  const sorted = sortProductsByMerchandisingOrder(pool)
  const first = resolveMerchandisingItemType(sorted[0]!)
  assert.notEqual(first.tier, MERCHANDISING_ITEM_TIER.ACCESSORY)
  assert.equal(sorted[0]!.id, "c")
}

// --- Simulated pagination: sort before slice; no dupes/gaps ---
{
  const pool: Record<string, unknown>[] = []
  for (let i = 0; i < 50; i++) {
    const isAccessory = i % 10 === 0
    pool.push(
      product({
        id: `id-${i}`,
        handle: `h-${String(i).padStart(2, "0")}`,
        title: isAccessory ? `Зеркало ${i}` : `Кровать ${i}`,
        metadata: {
          collection: i < 25 ? "greenwich" : "oliver",
          category_handle: isAccessory ? "zerkala" : "krovati",
        },
      })
    )
  }
  const sorted = sortProductsByMerchandisingOrder(pool)
  const pageSize = 12
  const page1 = sorted.slice(0, pageSize)
  const page2 = sorted.slice(pageSize, pageSize * 2)
  const ids1 = new Set(page1.map((p) => p.id))
  const ids2 = new Set(page2.map((p) => p.id))
  for (const id of ids1) assert.equal(ids2.has(id), false)
  const reunited = [...page1, ...page2, ...sorted.slice(pageSize * 2)]
  assert.equal(reunited.length, sorted.length)
  assert.deepEqual(
    reunited.map((p) => p.id).sort(),
    pool.map((p) => p.id).sort()
  )
  assert.deepEqual(
    reunited.map((p) => p.id),
    sorted.map((p) => p.id)
  )
  // Repeated sort identical
  assert.deepEqual(
    sortProductsByMerchandisingOrder(pool).map((p) => p.id),
    sorted.map((p) => p.id)
  )
}

// --- Accessories never precede anchor furniture inside one collection ---
{
  const coll = "oliver"
  const products = [
    product({
      id: "acc",
      title: "Зеркало",
      metadata: { collection: coll, category_handle: "zerkala" },
    }),
    product({
      id: "bed",
      title: "Кровать",
      metadata: { collection: coll, category_handle: "krovati" },
    }),
    product({
      id: "shelf",
      title: "Полка",
      metadata: { collection: coll, category_handle: "polki" },
    }),
  ]
  const sorted = sortProductsByMerchandisingOrder(products)
  const tiers = sorted.map((p) => resolveMerchandisingItemType(p).tier)
  let sawAccessory = false
  for (const tier of tiers) {
    if (tier === MERCHANDISING_ITEM_TIER.ACCESSORY) sawAccessory = true
    if (
      sawAccessory &&
      (tier === MERCHANDISING_ITEM_TIER.ANCHOR ||
        tier === MERCHANDISING_ITEM_TIER.SUPPORTING)
    ) {
      assert.fail("accessory preceded furniture within collection order")
    }
  }
}

// --- Equal-rank collections stay contiguous (oliver vs oliver-adult) ---
{
  const products = [
    product({
      id: "oa-m",
      title: "Зеркало",
      metadata: { collection: "oliver-adult", category_handle: "zerkala" },
    }),
    product({
      id: "o-b",
      title: "Кровать",
      metadata: { collection: "oliver", category_handle: "krovati" },
    }),
    product({
      id: "oa-b",
      title: "Кровать",
      metadata: { collection: "oliver-adult", category_handle: "krovati" },
    }),
    product({
      id: "o-m",
      title: "Зеркало",
      metadata: { collection: "oliver", category_handle: "zerkala" },
    }),
  ]
  const sorted = sortProductsByMerchandisingOrder(products)
  const blocks = sorted.map(
    (p) => (p.metadata as { collection: string }).collection
  )
  assert.deepEqual(blocks, [
    "oliver",
    "oliver",
    "oliver-adult",
    "oliver-adult",
  ])
}

// --- Unknown collection slugs stay contiguous ---
{
  const products = [
    product({
      id: "b1",
      title: "Кровать A",
      metadata: { collection: "mystery-b", category_handle: "krovati" },
    }),
    product({
      id: "a1",
      title: "Кровать A",
      metadata: { collection: "mystery-a", category_handle: "krovati" },
    }),
    product({
      id: "b2",
      title: "Комод",
      metadata: { collection: "mystery-b", category_handle: "komody" },
    }),
    product({
      id: "a2",
      title: "Комод",
      metadata: { collection: "mystery-a", category_handle: "komody" },
    }),
  ]
  const sorted = sortProductsByMerchandisingOrder(products)
  const blocks = sorted.map(
    (p) => (p.metadata as { collection: string }).collection
  )
  assert.deepEqual(blocks, [
    "mystery-a",
    "mystery-a",
    "mystery-b",
    "mystery-b",
  ])
}

// --- Accessory-only early collection cannot open catalog when furniture exists ---
{
  const products = [
    product({
      id: "g-m",
      title: "Зеркало навесное",
      metadata: { collection: "greenwich", category_handle: "zerkala" },
    }),
    product({
      id: "o-b",
      title: "Кровать",
      metadata: { collection: "oliver", category_handle: "krovati" },
    }),
  ]
  const sorted = sortProductsByMerchandisingOrder(products)
  assert.equal(sorted[0]!.id, "o-b")
  assert.equal(sorted[1]!.id, "g-m")
  assert.notEqual(
    resolveMerchandisingItemType(sorted[0]!).tier,
    MERCHANDISING_ITEM_TIER.ACCESSORY
  )
}

// Oxford steps: below anchor furniture, above pure accessories
{
  const bed = product({
    id: "bed",
    title: "Кровать",
    metadata: { collection: "oxford", category_handle: "krovati" },
  })
  const steps = product({
    id: "s-ox-05",
    handle: "s-ox-05",
    title: "Ступени с перилами и ящиками Оксфорд",
    metadata: { collection: "oxford", category_handle: "stupeni" },
  })
  const mirror = product({
    id: "m",
    title: "Зеркало",
    metadata: { collection: "oxford", category_handle: "zerkala" },
  })
  assert.equal(resolveMerchandisingItemType(steps).key, "stupeni")
  assert.equal(
    resolveMerchandisingItemType(steps).tier,
    MERCHANDISING_ITEM_TIER.SUPPORTING
  )
  const sorted = sortProductsByMerchandisingOrder([mirror, steps, bed])
  assert.equal(sorted[0]!.id, "bed")
  assert.equal(sorted[1]!.id, "s-ox-05")
  assert.equal(sorted[2]!.id, "m")
}

console.log("catalog-merchandising-order.fidelity.test.ts: ok")
