import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  CANOPY_SCAN_HASH,
  PHOTO_PLACEHOLDER_HASH,
  activeTasks,
  buildCatalogOpsBoard,
  matchPhotoFilename,
  taskMatchesQuery,
  tasksInLane,
  type CatalogOpsProduct,
} from "./catalog-ops-board.ts"

function product(partial: Partial<CatalogOpsProduct> & Pick<CatalogOpsProduct, "handle">): CatalogOpsProduct {
  return {
    id: partial.handle,
    title: partial.title ?? partial.handle,
    status: partial.status ?? "published",
    image_urls: partial.image_urls ?? [`/static/${partial.handle}.jpg`],
    ...partial,
  }
}

const FIVE = ["pr-68-1", "pr-68-2", "pr-84-1", "pr-84-2", "ol-86-1"]

describe("catalog ops board", () => {
  it("folds the five photo gaps into one task and ignores drafts", () => {
    const products: CatalogOpsProduct[] = [
      ...FIVE.slice(0, 4).map((handle) =>
        product({
          handle,
          image_urls: [`/static/imports/${PHOTO_PLACEHOLDER_HASH}.jpg`],
        })
      ),
      product({
        handle: "ol-86-1",
        title: "Каркас для балдахина",
        image_urls: [`/static/imports/${CANOPY_SCAN_HASH}.png`],
      }),
      product({ handle: "a-31-1", status: "draft", title: "Черновик" }),
      product({ handle: "pr-06-1", title: "Столик" }),
    ]
    const board = buildCatalogOpsBoard(products)
    const active = activeTasks(board)
    assert.equal(active.length, 1)
    assert.equal(active[0].task_id, "photo-catalog")
    assert.equal(active[0].affected_count, 5)
    assert.equal(active[0].resolution_type, "NEW_PHOTOGRAPHY")
    assert.equal(active.some((task) => task.problem_type === "draft"), false)
    assert.equal(board.summary.critical, 0)
    assert.equal(board.summary.buyer_visible, 6)
    assert.equal(board.summary.ready_photos, 1)
    assert.equal(board.summary.waiting_photos, 5)
  })

  it("drops a photo item once a real hero replaces the placeholder", () => {
    const products = FIVE.map((handle) =>
      product({
        handle,
        image_urls:
          handle === "pr-68-1"
            ? ["/static/products/princess-rose/pr-68-1_hero.jpg"]
            : [`/static/imports/${PHOTO_PLACEHOLDER_HASH}.jpg`],
      })
    )
    products[4] = product({
      handle: "ol-86-1",
      image_urls: [`/static/imports/${CANOPY_SCAN_HASH}.png`],
    })
    const board = buildCatalogOpsBoard(products)
    const photo = activeTasks(board)[0]
    assert.equal(photo.progress_done, 1)
    assert.equal(photo.affected_count, 4)
    assert.equal(photo.photo_items?.find((item) => item.handle === "pr-68-1")?.status, "uploaded")
  })

  it("closes the photo task when every hero is a real file", () => {
    const board = buildCatalogOpsBoard(FIVE.map((handle) => product({ handle })))
    assert.equal(activeTasks(board).some((task) => task.task_id === "photo-catalog"), false)
  })

  it("keeps recovery as one frozen task and completed work out of the active lane", () => {
    const board = buildCatalogOpsBoard([product({ handle: "ol-08-1" })])
    const frozen = tasksInLane(board, "waiting")
    assert.equal(frozen.length, 1)
    assert.equal(frozen[0].task_id, "recovery-archive")
    assert.equal(frozen[0].affected_count, 93)
    assert.equal(frozen[0].next_action, "Ничего делать сейчас не нужно")
    assert.ok(board.tasks.filter((task) => task.status === "done").length >= 8)
    assert.equal(activeTasks(board).length, 0)
  })

  it("surfaces one price task instead of a card per SKU", () => {
    const board = buildCatalogOpsBoard([
      product({ handle: "aa-1", missing_price: true }),
      product({ handle: "aa-2", missing_price: true }),
    ])
    const active = activeTasks(board)
    assert.equal(active.filter((task) => task.task_id === "missing-price").length, 1)
    assert.equal(active.find((task) => task.task_id === "missing-price")?.affected_count, 2)
  })

  it("matches a dropped filename to one SKU and does not invent a handle", () => {
    assert.deepEqual(matchPhotoFilename("PR-68-1_hero.JPG"), { handle: "pr-68-1", role: "HERO" })
    assert.equal(matchPhotoFilename("random.jpg"), null)
    assert.deepEqual(matchPhotoFilename("ol-86-1_context.png"), {
      handle: "ol-86-1",
      role: "CONTEXT",
    })
    assert.equal(matchPhotoFilename("pr-68-10_hero.jpg"), null)
  })

  it("does not count an invisible product as on the storefront or a file-less product as photographed", () => {
    const board = buildCatalogOpsBoard([
      product({ handle: "hidden-1", published_invisible: true, image_urls: [] }),
      product({ handle: "bare-1", image_urls: [], thumbnail: null }),
    ])
    assert.equal(board.summary.buyer_visible, 1)
    assert.equal(board.summary.ready_photos, 0)
    assert.equal(board.summary.waiting_photos, 1)
    const photo = activeTasks(board).find((task) => task.task_id === "photo-catalog")
    assert.equal(photo?.affected_count, 1)
    assert.equal(photo?.photo_items?.[0]?.group, "other")
  })

  it("keeps mnm-06-1 quiet when facts are still missing", () => {
    const board = buildCatalogOpsBoard([
      product({ handle: "mnm-06-1", title: "Столик", description: "", dimensions: null }),
    ])
    const watch = tasksInLane(board, "watch")
    assert.equal(watch.length, 1)
    assert.equal(watch[0].owner_input_required, false)
    assert.equal(watch[0].severity, "quiet")
  })

  it("finds a task by SKU, title or problem and ignores an unrelated word", () => {
    const board = buildCatalogOpsBoard([
      ...FIVE.slice(0, 4).map((handle) =>
        product({
          handle,
          collection_label: "Принцесса Роза",
          image_urls: [`/static/imports/${PHOTO_PLACEHOLDER_HASH}.jpg`],
        })
      ),
      product({
        handle: "ol-86-1",
        collection_label: "Оливер",
        image_urls: [`/static/imports/${CANOPY_SCAN_HASH}.png`],
      }),
    ])
    const photo = board.tasks.find((task) => task.task_id === "photo-catalog")
    assert.ok(photo)
    assert.equal(taskMatchesQuery(photo, "pr-68-1"), true)
    assert.equal(taskMatchesQuery(photo, "принцесса"), true)
    assert.equal(taskMatchesQuery(photo, "первого фото"), true)
    assert.equal(taskMatchesQuery(photo, "черновик"), false)
  })
})
