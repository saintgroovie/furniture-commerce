/**
 * Owner-approved RoomSet V1 seed (staging only).
 *
 * Creates exactly two active RoomSets from home-scene provenance:
 *   - spalnya-cloud (created first → older created_at)
 *   - spalnya-greenwich (created second → newer → first in store list DESC)
 *
 * NEVER touches the five historical seed slugs.
 * NEVER deletes rows. NEVER mutates products/prices.
 *
 * Interruption recovery (idempotent retry):
 *   - complete_orphan_links: full item set exists, product links missing
 *   - reconcile_partial: validated prefix (linked or orphan) + create remaining
 *   Wrong handles → FAIL_CLOSED conflict (no delete)
 *
 * Dry-run (default):
 *   npx medusa exec ./src/scripts/seed-rooms-v1-owner-approved.ts
 *
 * Apply (staging only — requires BOTH flags):
 *   WOODRIGHT_ROOMS_V1_CONFIRM=1 WOODRIGHT_ROOMS_V1_APPLY=1 \
 *     npx medusa exec ./src/scripts/seed-rooms-v1-owner-approved.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { ROOM_SET_MODULE } from "../modules/room-set"
import type RoomSetModuleService from "../modules/room-set/service"
import {
  classifyItemsAction,
  itemHandles,
  type ItemRow,
  type ItemsAction,
} from "./seed-rooms-v1-plan"

/** Historical seed slugs — must never be reactivated or reused by this script. */
export const FORBIDDEN_HISTORICAL_SLUGS = [
  "detskaya-pervenets",
  "detskaya-shkolnika",
  "kabinet",
  "spalnya",
  "gostinaya",
] as const

/**
 * Create order: Cloud first, Greenwich second.
 * Store API lists active RoomSets by created_at DESC → Greenwich then Cloud.
 */
export const ROOMS_V1_CREATE_ORDER = ["spalnya-cloud", "spalnya-greenwich"] as const

export type RoomsV1Spec = {
  slug: string
  title: string
  room_type: string
  style: string
  hero_image: string
  /** Buyer card order (1 = first). Enforced via create order, not a DB column. */
  page_order: number
  product_handles: string[]
}

/** Owner-approved product order (exact). */
export const ROOMS_V1_SPECS: RoomsV1Spec[] = [
  {
    slug: "spalnya-cloud",
    title: "Спальня Cloud",
    room_type: "спальня",
    style: "Greenwich",
    hero_image:
      "/product-static/products/greenwich/beds-shared/GR-BED-POOL_cloud_bedroom2_int_View04.jpg",
    page_order: 2,
    product_handles: [
      "greenwich-gr-12-1",
      "greenwich-gr-67-1",
      "greenwich-gr-02-1",
    ],
  },
  {
    slug: "spalnya-greenwich",
    title: "Спальня Greenwich",
    room_type: "спальня",
    style: "Greenwich",
    hero_image:
      "/product-static/products/greenwich/beds-shared/GR-BED-POOL_frame_noliver_var2_View01.jpg",
    page_order: 1,
    product_handles: [
      "greenwich-gr-12-1",
      "greenwich-gr-08-1",
      "greenwich-gr-67-1",
    ],
  },
]

type Counts = {
  inserted_roomsets: number
  updated_roomsets: number
  inserted_items: number
  inserted_links: number
  completed_orphan_links: number
  noop_roomsets: number
  noop_items: number
  deleted_rows: number
}

type RoomSetRow = {
  id: string
  title?: string
  hero_image?: string | null
  is_active?: boolean
  room_type?: string | null
  style?: string | null
}

function emptyCounts(): Counts {
  return {
    inserted_roomsets: 0,
    updated_roomsets: 0,
    inserted_items: 0,
    inserted_links: 0,
    completed_orphan_links: 0,
    noop_roomsets: 0,
    noop_items: 0,
    deleted_rows: 0,
  }
}

function parseDatabaseName(databaseUrl: string): string | null {
  try {
    const u = new URL(databaseUrl)
    const name = u.pathname.replace(/^\//, "").split("?")[0]
    return name || null
  } catch {
    return null
  }
}

/** MedusaService create* may return T or T[] depending on input shape/version. */
function asOne<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value
}

export default async function seedRoomsV1OwnerApproved({
  container,
}: ExecArgs): Promise<void> {
  const logger = container.resolve("logger") as {
    info: (s: string) => void
    warn: (s: string) => void
    error: (s: string) => void
  }

  const confirm = process.env.WOODRIGHT_ROOMS_V1_CONFIRM === "1"
  const apply = process.env.WOODRIGHT_ROOMS_V1_APPLY === "1"
  if (apply && !confirm) {
    throw new Error("Set WOODRIGHT_ROOMS_V1_CONFIRM=1 before APPLY")
  }
  const mode = apply ? "APPLY" : "DRY-RUN"

  const dbUrl = process.env.DATABASE_URL || ""
  if (!dbUrl) {
    throw new Error("FAIL_CLOSED: DATABASE_URL is required")
  }
  const dbName = parseDatabaseName(dbUrl)
  if (dbName !== "woodright_staging") {
    throw new Error(
      `FAIL_CLOSED: refusing database "${dbName ?? "unparseable"}" ` +
        `(required exact name woodright_staging)`
    )
  }

  for (const slug of FORBIDDEN_HISTORICAL_SLUGS) {
    if (ROOMS_V1_SPECS.some((s) => s.slug === slug)) {
      throw new Error(`Refusing: V1 spec reuses forbidden historical slug ${slug}`)
    }
  }

  const roomSetService = container.resolve(ROOM_SET_MODULE) as RoomSetModuleService
  const productModule = container.resolve(Modules.PRODUCT)
  const link = container.resolve("link") as {
    create: (data: Record<string, Record<string, string>>) => Promise<unknown>
  }
  const query = container.resolve("query") as {
    graph: (args: {
      entity: string
      fields: string[]
      filters?: Record<string, unknown>
    }) => Promise<{ data: unknown[] }>
  }

  const counts = emptyCounts()
  const specsByCreateOrder = ROOMS_V1_CREATE_ORDER.map((slug) => {
    const spec = ROOMS_V1_SPECS.find((s) => s.slug === slug)
    if (!spec) throw new Error(`Missing spec for create-order slug ${slug}`)
    return spec
  })

  // --- Pre-mutation: historical must stay inactive ---
  for (const slug of FORBIDDEN_HISTORICAL_SLUGS) {
    const list = await roomSetService.listRoomSets({ slug }, { take: 1 })
    const row = list[0] as { is_active?: boolean } | undefined
    if (row && row.is_active === true) {
      throw new Error(
        `FAIL_CLOSED: historical slug ${slug} is active; refusing V1 seed`
      )
    }
  }

  // --- Resolve live published products ---
  const productIdByHandle = new Map<string, string>()
  const allHandles = [...new Set(specsByCreateOrder.flatMap((s) => s.product_handles))]
  for (const handle of allHandles) {
    const listed = await productModule.listProducts({ handle }, { take: 1 })
    const product = listed?.[0] as
      | { id?: string; deleted_at?: string | Date | null; status?: string }
      | undefined
    if (!product?.id) {
      throw new Error(`FAIL_CLOSED: product missing handle=${handle}`)
    }
    if (product.deleted_at) {
      throw new Error(`FAIL_CLOSED: product soft-deleted handle=${handle}`)
    }
    if (product.status !== "published") {
      throw new Error(
        `FAIL_CLOSED: product not published handle=${handle} status=${String(
          product.status
        )}`
      )
    }
    productIdByHandle.set(handle, String(product.id))
  }

  logger.info(`[rooms-v1] ${mode}: staging_ok handles_ok=${allHandles.length}`)

  type Plan = {
    spec: RoomsV1Spec
    existing: RoomSetRow | null
    items: ItemRow[]
    action: "create" | "update_meta" | "noop_meta"
    itemsAction: ItemsAction
  }

  const plans: Plan[] = []

  // --- Pre-mutation planning (no writes) ---
  for (const spec of specsByCreateOrder) {
    const existingList = await roomSetService.listRoomSets(
      { slug: spec.slug },
      { take: 1 }
    )
    const existing = (existingList[0] as RoomSetRow | undefined) ?? null
    let items: ItemRow[] = []
    if (existing?.id) {
      const { data: itemRows } = await query.graph({
        entity: "room_set_item",
        fields: ["id", "sort_order", "products.id", "products.handle"],
        filters: { room_set_id: existing.id },
      })
      items = ((itemRows ?? []) as ItemRow[]).slice().sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      )
    }

    const desired = spec.product_handles
    const itemsAction = classifyItemsAction(items, desired)

    if (itemsAction === "conflict") {
      const handles = itemHandles(items)
      throw new Error(
        `FAIL_CLOSED: room_set ${spec.slug} has unexpected items ` +
          `[${handles.map((h) => h ?? "∅").join(",")}] sort=[${items
            .map((it) => String(it.sort_order ?? "?"))
            .join(",")}] != desired [${desired.join(
            ","
          )}]. Script does not delete; manual review required.`
      )
    }

    let action: Plan["action"] = "create"
    if (existing) {
      const needsUpdate =
        existing.title !== spec.title ||
        existing.hero_image !== spec.hero_image ||
        existing.is_active !== true ||
        existing.room_type !== spec.room_type ||
        existing.style !== spec.style
      action = needsUpdate ? "update_meta" : "noop_meta"
    }

    plans.push({ spec, existing, items, action, itemsAction })
  }

  // --- Apply / dry-run from plan ---
  for (const plan of plans) {
    const { spec } = plan
    let roomSetId = plan.existing?.id

    if (plan.action === "create") {
      logger.info(`[rooms-v1] CREATE room_set slug=${spec.slug}`)
      if (apply) {
        // Sequential creates with a short gap so created_at DESC card order
        // (Cloud then Greenwich) stays deterministic even on coarse clocks.
        if (counts.inserted_roomsets > 0) {
          await new Promise((r) => setTimeout(r, 75))
        }
        const created = asOne(
          await roomSetService.createRoomSets({
            title: spec.title,
            slug: spec.slug,
            hero_image: spec.hero_image,
            room_type: spec.room_type,
            style: spec.style,
            is_active: true,
          })
        )
        roomSetId = created.id
      } else {
        roomSetId = `dry-run-${spec.slug}`
      }
      counts.inserted_roomsets++
    } else if (plan.action === "update_meta") {
      logger.info(`[rooms-v1] UPDATE room_set slug=${spec.slug} id=${roomSetId}`)
      if (apply && roomSetId) {
        await roomSetService.updateRoomSets({
          id: roomSetId,
          title: spec.title,
          hero_image: spec.hero_image,
          room_type: spec.room_type,
          style: spec.style,
          is_active: true,
        })
      }
      counts.updated_roomsets++
    } else {
      logger.info(`[rooms-v1] NOOP room_set slug=${spec.slug}`)
      counts.noop_roomsets++
    }

    if (!roomSetId || String(roomSetId).startsWith("dry-run-")) {
      if (plan.itemsAction === "create_all") {
        counts.inserted_items += spec.product_handles.length
        counts.inserted_links += spec.product_handles.length
      } else if (plan.itemsAction === "complete_orphan_links") {
        counts.completed_orphan_links += spec.product_handles.length
      } else if (plan.itemsAction === "reconcile_partial") {
        const missing = spec.product_handles.length - plan.items.length
        counts.inserted_items += Math.max(0, missing)
        counts.inserted_links += Math.max(0, missing)
        counts.completed_orphan_links += plan.items.filter(
          (it) => !it.products?.[0]?.handle
        ).length
      } else {
        counts.noop_items += spec.product_handles.length
      }
      continue
    }

    if (plan.itemsAction === "noop") {
      logger.info(
        `[rooms-v1] NOOP items slug=${spec.slug} count=${spec.product_handles.length}`
      )
      counts.noop_items += spec.product_handles.length
      continue
    }

    if (
      plan.itemsAction === "complete_orphan_links" ||
      plan.itemsAction === "reconcile_partial"
    ) {
      // Complete missing links on existing prefix, then create remaining items.
      for (let idx = 0; idx < plan.items.length; idx++) {
        const handle = spec.product_handles[idx]
        const productId = productIdByHandle.get(handle)!
        const item = plan.items[idx]
        const existingHandle = item.products?.[0]?.handle
        if (existingHandle === handle) continue
        if (existingHandle != null && existingHandle !== handle) {
          throw new Error(
            `FAIL_CLOSED: item sort=${idx} handle drift ${existingHandle}!=${handle}`
          )
        }
        if (!item?.id) {
          throw new Error(`FAIL_CLOSED: orphan item missing id at sort=${idx}`)
        }
        logger.info(
          `[rooms-v1] COMPLETE_LINK slug=${spec.slug} sort=${idx} handle=${handle}`
        )
        if (apply) {
          await link.create({
            [Modules.PRODUCT]: { product_id: productId },
            [ROOM_SET_MODULE]: { room_set_item_id: item.id },
          })
        }
        counts.completed_orphan_links++
      }
      for (let idx = plan.items.length; idx < spec.product_handles.length; idx++) {
        const handle = spec.product_handles[idx]
        const productId = productIdByHandle.get(handle)!
        logger.info(
          `[rooms-v1] CREATE item+link slug=${spec.slug} sort=${idx} handle=${handle}`
        )
        if (apply) {
          const item = asOne(
            await roomSetService.createRoomSetItems({
              room_set_id: roomSetId,
              quantity: 1,
              sort_order: idx,
            })
          )
          await link.create({
            [Modules.PRODUCT]: { product_id: productId },
            [ROOM_SET_MODULE]: { room_set_item_id: item.id },
          })
        }
        counts.inserted_items++
        counts.inserted_links++
      }
      continue
    }

    // create_all
    for (let idx = 0; idx < spec.product_handles.length; idx++) {
      const handle = spec.product_handles[idx]
      const productId = productIdByHandle.get(handle)!
      logger.info(
        `[rooms-v1] CREATE item+link slug=${spec.slug} sort=${idx} handle=${handle}`
      )
      if (apply) {
        const item = asOne(
          await roomSetService.createRoomSetItems({
            room_set_id: roomSetId,
            quantity: 1,
            sort_order: idx,
          })
        )
        await link.create({
          [Modules.PRODUCT]: { product_id: productId },
          [ROOM_SET_MODULE]: { room_set_item_id: item.id },
        })
      }
      counts.inserted_items++
      counts.inserted_links++
    }
  }

  // --- Post-mutation: historical still inactive ---
  for (const slug of FORBIDDEN_HISTORICAL_SLUGS) {
    const list = await roomSetService.listRoomSets({ slug }, { take: 1 })
    const row = list[0] as { is_active?: boolean } | undefined
    if (row && row.is_active === true) {
      throw new Error(
        `FAIL_CLOSED: historical slug ${slug} became active during run`
      )
    }
  }

  logger.info(
    `[rooms-v1] ${mode} summary ` +
      JSON.stringify({
        ...counts,
        create_order: ROOMS_V1_CREATE_ORDER,
        buyer_card_order: ["spalnya-greenwich", "spalnya-cloud"],
      })
  )
}
