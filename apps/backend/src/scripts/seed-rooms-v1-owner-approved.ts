/**
 * Owner-approved RoomSet V1 seed (staging + gated production).
 *
 * Creates exactly two active RoomSets from home-scene provenance:
 *   - spalnya-cloud (created first → older created_at)
 *   - spalnya-greenwich (created second → newer → first in store list DESC)
 *
 * NEVER touches the five historical seed slugs.
 * NEVER deletes rows. NEVER mutates products/prices.
 * NEVER auto-runs on startup / migrate / health / deploy.
 *
 * Target contract (fail-closed):
 *   ROOMSET_SEED_TARGET=staging|production
 *   ROOMSET_SEED_SCOPE=rooms-v1-owner-approved
 *   ROOMSET_SEED_MODE=dry-run|apply
 *   DATABASE_URL db name must match target exactly
 *   production also requires:
 *     ROOMSET_SEED_CONFIRM=ROOMSET_V1_PRODUCTION_OWNER_APPROVED
 *     ROOMSET_SEED_PRODUCTION_ACK=I_UNDERSTAND_THIS_WRITES_PRODUCTION
 *
 * See docs/operator/rooms-v1-seed.md
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { ROOM_SET_MODULE } from "../modules/room-set"
import type RoomSetModuleService from "../modules/room-set/service"
import {
  FORBIDDEN_HISTORICAL_SLUGS,
  ROOMS_V1_BUYER_CARD_ORDER,
  ROOMS_V1_CREATE_ORDER,
  ROOMS_V1_SPECS,
  ROOMSET_V1_MANIFEST_ID,
  type RoomsV1Spec,
} from "./seed-rooms-v1-manifest"
import {
  classifyItemsAction,
  itemHandles,
  type ItemRow,
  type ItemsAction,
} from "./seed-rooms-v1-plan"
import { assertRoomsetSeedGate } from "./seed-rooms-v1-target-gate"

export {
  FORBIDDEN_HISTORICAL_SLUGS,
  ROOMS_V1_BUYER_CARD_ORDER,
  ROOMS_V1_CREATE_ORDER,
  ROOMS_V1_SPECS,
  ROOMSET_V1_MANIFEST_ID,
}
export type { RoomsV1Spec }

type Counts = {
  inserted_roomsets: number
  updated_roomsets: number
  inserted_items: number
  inserted_links: number
  completed_orphan_links: number
  noop_roomsets: number
  noop_items: number
  deleted_rows: number
  conflicts: number
  historical_reactivated: number
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
    conflicts: 0,
    historical_reactivated: 0,
  }
}

function semanticMutations(c: Counts): number {
  return (
    c.inserted_roomsets +
    c.updated_roomsets +
    c.inserted_items +
    c.inserted_links +
    c.completed_orphan_links
  )
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

  const gate = assertRoomsetSeedGate()
  if (!gate.ok) {
    throw new Error(gate.message)
  }
  const apply = gate.apply
  const mode = gate.mode === "apply" ? "APPLY" : "DRY-RUN"

  logger.info(
    `[rooms-v1] gate_ok target=${gate.target} scope=${gate.scope} mode=${gate.mode} ` +
      `db=${gate.dbName} host=${gate.hostname} manifest_id=${gate.manifestId} ` +
      `manifest_sha=${gate.manifestSha}`
  )

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
      counts.historical_reactivated++
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

  logger.info(
    `[rooms-v1] ${mode}: target_ok=${gate.target} handles_ok=${allHandles.length}`
  )

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
      counts.conflicts++
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
  // Publish rule: never leave a buyer-visible RoomSet with incomplete items.
  // Create/repair while inactive, then activate only after composition is exact.
  for (const plan of plans) {
    const { spec } = plan
    let roomSetId = plan.existing?.id
    const needsItemWork = plan.itemsAction !== "noop"

    if (plan.action === "create") {
      logger.info(
        `[rooms-v1] CREATE room_set slug=${spec.slug} (inactive until items complete)`
      )
      if (apply) {
        const created = asOne(
          await roomSetService.createRoomSets({
            title: spec.title,
            slug: spec.slug,
            hero_image: spec.hero_image,
            room_type: spec.room_type,
            style: spec.style,
            is_active: false,
          })
        )
        roomSetId = created.id
      } else {
        roomSetId = `dry-run-${spec.slug}`
      }
      counts.inserted_roomsets++
    } else if (plan.action === "update_meta" || needsItemWork) {
      logger.info(
        `[rooms-v1] UPDATE room_set slug=${spec.slug} id=${roomSetId} ` +
          `(prepare${needsItemWork ? "; deactivate_until_items_ok" : ""})`
      )
      if (apply && roomSetId) {
        await roomSetService.updateRoomSets({
          id: roomSetId,
          title: spec.title,
          hero_image: spec.hero_image,
          room_type: spec.room_type,
          style: spec.style,
          is_active: needsItemWork ? false : true,
        })
      }
      if (plan.action === "update_meta") counts.updated_roomsets++
      else counts.noop_roomsets++
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
          (it) => !Array.isArray(it.products) || it.products.length === 0
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
      if (apply && plan.existing && plan.existing.is_active !== true) {
        await roomSetService.updateRoomSets({
          id: roomSetId,
          is_active: true,
        })
      }
      continue
    }

    if (
      plan.itemsAction === "complete_orphan_links" ||
      plan.itemsAction === "reconcile_partial"
    ) {
      for (let idx = 0; idx < plan.items.length; idx++) {
        const handle = spec.product_handles[idx]
        const productId = productIdByHandle.get(handle)!
        const item = plan.items[idx]
        const products = item.products
        if (Array.isArray(products) && products.length === 1) {
          const existingHandle = products[0]?.handle
          if (existingHandle === handle) continue
          if (existingHandle != null) {
            throw new Error(
              `FAIL_CLOSED: item sort=${idx} handle drift ${existingHandle}!=${handle}`
            )
          }
          throw new Error(
            `FAIL_CLOSED: item sort=${idx} unresolved product stub (not a true orphan)`
          )
        }
        if (Array.isArray(products) && products.length > 1) {
          throw new Error(`FAIL_CLOSED: item sort=${idx} ambiguous product links`)
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
    } else {
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

    logger.info(`[rooms-v1] ACTIVATE room_set slug=${spec.slug}`)
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
  }

  for (const slug of FORBIDDEN_HISTORICAL_SLUGS) {
    const list = await roomSetService.listRoomSets({ slug }, { take: 1 })
    const row = list[0] as { is_active?: boolean } | undefined
    if (row && row.is_active === true) {
      counts.historical_reactivated++
      throw new Error(
        `FAIL_CLOSED: historical slug ${slug} became active during run`
      )
    }
  }

  logger.info(
    `[rooms-v1] ${mode} summary ` +
      JSON.stringify({
        target: gate.target,
        db_name: gate.dbName,
        mode: gate.mode,
        manifest_id: gate.manifestId,
        manifest_sha: gate.manifestSha,
        ...counts,
        semantic_mutations: semanticMutations(counts),
        create_order: ROOMS_V1_CREATE_ORDER,
        buyer_card_order: ROOMS_V1_BUYER_CARD_ORDER,
      })
  )
}
