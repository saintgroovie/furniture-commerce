/**
 * Catalog operations board.
 * One task is one way of finishing the work. SKUs sit inside the task.
 * Drafts, closed recovery and already-fixed prices are not active cards.
 */

export const PHOTO_PLACEHOLDER_HASH =
  "7956fd268283f4b283d10ca1154010e2490893f15abfcf053943a9f65aa225d4"

export const CANOPY_SCAN_HASH =
  "52996f4283fa02e976be82f225a004c2f87941a54065fa5d2dfd7954ed4b48df"

export type ResolutionType =
  | "AUTOMATIC_FIX"
  | "OWNER_DECISION"
  | "NEW_PHOTOGRAPHY"
  | "NEW_SOURCE_DATA"
  | "CODE_CHANGE"
  | "EXTERNAL_ACTION"
  | "MONITOR_ONLY"

export type BoardLane = "do" | "decide" | "automatic" | "waiting" | "watch" | "done"

export type Severity = "critical" | "needed" | "quiet"

export type PhotoItemStatus =
  | "not_shot"
  | "file_received"
  | "checked"
  | "ready"
  | "uploaded"

export type CatalogOpsProduct = {
  id: string
  handle: string
  title: string
  status: string
  collection_label?: string | null
  thumbnail?: string | null
  image_urls?: string[]
  description?: string | null
  missing_price?: boolean
  published_invisible?: boolean
  dimensions?: { height_mm?: number; width_mm?: number; depth_mm?: number } | null
}

export type PhotoGroupId = "etagere" | "guard" | "canopy"

export type PhotoItem = {
  handle: string
  title: string
  group: PhotoGroupId
  group_label: string
  brief: string
  status: PhotoItemStatus
  reference_url: string | null
}

export type AffectedItem = {
  handle: string
  title: string
}

export type OpsTask = {
  task_id: string
  title: string
  problem: string
  problem_type: string
  severity: Severity
  severity_label: string
  status: "active" | "waiting" | "frozen" | "done"
  lane: BoardLane
  resolution_type: ResolutionType
  affected_items: AffectedItem[]
  affected_count: number
  next_action: string
  primary_action: string
  owner_input_required: boolean
  automation_available: boolean
  why_not_automatic: string | null
  technical_status: string
  evidence: string[]
  photo_items?: PhotoItem[]
  progress_done?: number
  progress_total?: number
  completed_at?: string
}

export type CatalogOpsBoard = {
  summary: {
    buyer_visible: number
    ready_photos: number
    waiting_photos: number
    critical: number
  }
  tasks: OpsTask[]
}

const PHOTO_SPEC: Array<{
  handle: string
  title: string
  group: PhotoGroupId
  group_label: string
  brief: string
}> = [
  {
    handle: "pr-68-1",
    title: "Этажерка малая 3 полки",
    group: "etagere",
    group_label: "Этажерки",
    brief: "Вся малая этажерка, три полки видны, светлый фон",
  },
  {
    handle: "pr-68-2",
    title: "Этажерка большая 6 полок",
    group: "etagere",
    group_label: "Этажерки",
    brief: "Вся большая этажерка, шесть полок в кадре, тот же свет",
  },
  {
    handle: "pr-84-1",
    title: "Бортик к кровати малый",
    group: "guard",
    group_label: "Бортики",
    brief: "Весь малый бортик, длина 70 см, не подменять большим",
  },
  {
    handle: "pr-84-2",
    title: "Бортик к кровати большой",
    group: "guard",
    group_label: "Бортики",
    brief: "Весь большой бортик, длина 100 см, та же рамка",
  },
  {
    handle: "ol-86-1",
    title: "Каркас для балдахина",
    group: "canopy",
    group_label: "Каркас балдахина",
    brief: "Сам держатель 40 на 25 см, без кроватки и без ткани",
  },
]

const FROZEN_GROUPS = [
  { label: "Вилли Винки", count: 24 },
  { label: "Мончелси", count: 38 },
  { label: "Соседние семьи", count: 31 },
]

const COMPLETED: Array<Omit<OpsTask, "affected_items" | "affected_count"> & { affected_items?: AffectedItem[] }> = [
  done("recovery-closed", "Восстановление каталога закрыто", "2026-10-11", "RECOVERY_CLOSED"),
  done("willie-prices", "Цены Вилли Винки сверены", "2026-10-11", "PRICE_RECONCILED"),
  done("monchelsea-ldsp", "ЛДСП Мончелси уже в ценах", "2026-10-11", "LDSP_LIVE"),
  done("categories", "Категории живых товаров поправлены", "2026-10-11", "CATEGORY_FIXED"),
  done("copy", "Описания дописаны по известным фактам", "2026-10-11", "COPY_CLOSED"),
  done("beds", "Кровати собраны в размерные группы", "2026-10-11", "BED_GROUPS_LIVE"),
  done("mirror-dims", "Размеры овального зеркала OL-08-1 отделены от тумбы", "2026-10-11", "MIRROR_DIMS_FIXED"),
  done("draft-boundary", "Черновики не открываются покупателю", "2026-10-11", "DRAFT_FAIL_CLOSE"),
  done("pr-06", "У туалетного столика PR-06-1 две высоты", "2026-10-10", "PR06_HEIGHTS"),
]

function done(
  task_id: string,
  title: string,
  completed_at: string,
  technical_status: string
): OpsTask {
  return {
    task_id,
    title,
    problem: "Уже сделано",
    problem_type: "completed",
    severity: "quiet",
    severity_label: "Готово",
    status: "done",
    lane: "done",
    resolution_type: "AUTOMATIC_FIX",
    affected_items: [],
    affected_count: 0,
    next_action: "Ничего не делать",
    primary_action: "Скрыто",
    owner_input_required: false,
    automation_available: false,
    why_not_automatic: null,
    technical_status,
    evidence: [],
    completed_at,
  }
}

function severityLabel(severity: Severity): string {
  if (severity === "critical") return "Критично"
  if (severity === "needed") return "Нужно сделать"
  return "Не блокирует"
}

function heroUrl(product: CatalogOpsProduct | undefined): string | null {
  if (!product) return null
  const first = product.image_urls?.find((url) => url.trim())
  if (first) return first
  const thumb = product.thumbnail?.trim()
  return thumb || null
}

export function photoHeroNeedsShoot(handle: string, url: string | null): boolean {
  if (!url) return true
  if (url.includes(PHOTO_PLACEHOLDER_HASH)) return true
  if (handle === "ol-86-1" && url.includes(CANOPY_SCAN_HASH)) return true
  return false
}

export function photoItemStatus(handle: string, url: string | null): PhotoItemStatus {
  return photoHeroNeedsShoot(handle, url) ? "not_shot" : "uploaded"
}

function byHandle(products: CatalogOpsProduct[]): Map<string, CatalogOpsProduct> {
  const map = new Map<string, CatalogOpsProduct>()
  for (const product of products) {
    if (product.status === "draft") continue
    map.set(product.handle, product)
  }
  return map
}

function photoTask(products: CatalogOpsProduct[]): OpsTask | null {
  const live = byHandle(products)
  const present = PHOTO_SPEC.filter((spec) => live.has(spec.handle))
  if (present.length === 0) return null
  const items: PhotoItem[] = present.map((spec) => {
    const product = live.get(spec.handle)
    const url = heroUrl(product)
    return {
      handle: spec.handle,
      title: product?.title || spec.title,
      group: spec.group,
      group_label: spec.group_label,
      brief: spec.brief,
      status: photoItemStatus(spec.handle, url),
      reference_url: url,
    }
  })
  const waiting = items.filter((item) => item.status !== "uploaded")
  if (waiting.length === 0) return null
  return {
    task_id: "photo-catalog",
    title: "Фотосъёмка каталога",
    problem: `${waiting.length} товаров без нормального первого фото`,
    problem_type: "photography",
    severity: "needed",
    severity_label: severityLabel("needed"),
    status: "active",
    lane: "do",
    resolution_type: "NEW_PHOTOGRAPHY",
    affected_items: waiting.map((item) => ({ handle: item.handle, title: item.title })),
    affected_count: waiting.length,
    next_action: "Снять товары по брифу и загрузить файлы одним комплектом",
    primary_action: "Открыть съёмку",
    owner_input_required: true,
    automation_available: false,
    why_not_automatic: "Нужны реальные кадры. Сгенерированное фото не подставляем.",
    technical_status: "NEW_PHOTOGRAPHY",
    evidence: [
      "operator-access/catalog-operations-2026-10-12/media-merchandising/photo-shoot-briefs.md",
    ],
    photo_items: items,
    progress_done: items.length - waiting.length,
    progress_total: items.length,
  }
}

function priceTask(products: CatalogOpsProduct[]): OpsTask | null {
  const rows = products.filter(
    (product) => product.status === "published" && product.missing_price
  )
  if (rows.length === 0) return null
  return {
    task_id: "missing-price",
    title: "Нет цены",
    problem: "У опубликованного товара нет цены, покупатель видит дыру",
    problem_type: "price",
    severity: "critical",
    severity_label: severityLabel("critical"),
    status: "active",
    lane: "do",
    resolution_type: "NEW_SOURCE_DATA",
    affected_items: rows.map((product) => ({ handle: product.handle, title: product.title })),
    affected_count: rows.length,
    next_action: "Открыть список и поставить цену из принятого прайса",
    primary_action: "Открыть товары",
    owner_input_required: false,
    automation_available: false,
    why_not_automatic: null,
    technical_status: "MISSING_PRICE",
    evidence: [],
  }
}

function invisibleTask(products: CatalogOpsProduct[]): OpsTask | null {
  const rows = products.filter(
    (product) => product.status === "published" && product.published_invisible
  )
  if (rows.length === 0) return null
  return {
    task_id: "published-invisible",
    title: "Товар опубликован, но не находится",
    problem: "Покупатель не видит карточку, хотя статус опубликован",
    problem_type: "visibility",
    severity: "critical",
    severity_label: severityLabel("critical"),
    status: "active",
    lane: "automatic",
    resolution_type: "AUTOMATIC_FIX",
    affected_items: rows.map((product) => ({ handle: product.handle, title: product.title })),
    affected_count: rows.length,
    next_action: "Исправить видимость пакетом",
    primary_action: "Разобрать видимость",
    owner_input_required: false,
    automation_available: true,
    why_not_automatic: null,
    technical_status: "PUBLISHED_INVISIBLE",
    evidence: [],
  }
}

function watchTask(products: CatalogOpsProduct[]): OpsTask | null {
  const product = products.find((row) => row.handle === "mnm-06-1" && row.status === "published")
  if (!product) return null
  const description = (product.description ?? "").trim()
  const dims = product.dimensions
  const hasDims = Boolean(dims && (dims.height_mm || dims.width_mm || dims.depth_mm))
  if (description && hasDims) return null
  return {
    task_id: "mnm-06-1-facts",
    title: "Туалетный столик Мончелси без новых фактов",
    problem: "Текста и размеров нет. Покупке это не мешает",
    problem_type: "facts",
    severity: "quiet",
    severity_label: severityLabel("quiet"),
    status: "waiting",
    lane: "watch",
    resolution_type: "MONITOR_ONLY",
    affected_items: [{ handle: product.handle, title: product.title }],
    affected_count: 1,
    next_action: "Ничего не делать, пока не появятся размеры или описание",
    primary_action: "Оставить как есть",
    owner_input_required: false,
    automation_available: false,
    why_not_automatic: "Фактов больше нет. Додумывать текст и размеры нельзя.",
    technical_status: "HOLD_INSUFFICIENT_FACTS",
    evidence: [],
  }
}

function frozenTask(): OpsTask {
  const count = FROZEN_GROUPS.reduce((sum, group) => sum + group.count, 0)
  return {
    task_id: "recovery-archive",
    title: "Архив восстановления",
    problem: `${count} позиций требуют новых исходников`,
    problem_type: "recovery_archive",
    severity: "quiet",
    severity_label: "Не блокирует",
    status: "frozen",
    lane: "waiting",
    resolution_type: "NEW_SOURCE_DATA",
    affected_items: FROZEN_GROUPS.map((group) => ({
      handle: group.label,
      title: `${group.count}`,
    })),
    affected_count: count,
    next_action: "Ничего делать сейчас не нужно",
    primary_action: "Не открывать",
    owner_input_required: false,
    automation_available: false,
    why_not_automatic: "Исходники исчерпаны. Без нового источника позиции не публикуем.",
    technical_status: "RECOVERY_EVIDENCE_EXHAUSTED",
    evidence: [],
  }
}

export function buildCatalogOpsBoard(products: CatalogOpsProduct[]): CatalogOpsBoard {
  const published = products.filter((product) => product.status === "published")
  const photo = photoTask(products)
  const tasks: OpsTask[] = []
  const price = priceTask(products)
  const invisible = invisibleTask(products)
  if (invisible) tasks.push(invisible)
  if (price) tasks.push(price)
  if (photo) tasks.push(photo)
  const watch = watchTask(products)
  if (watch) tasks.push(watch)
  tasks.push(frozenTask())
  tasks.push(...COMPLETED)
  const waitingPhotos = photo?.affected_count ?? 0
  return {
    summary: {
      buyer_visible: published.length,
      ready_photos: Math.max(0, published.length - waitingPhotos),
      waiting_photos: waitingPhotos,
      critical: tasks.filter((task) => task.severity === "critical" && task.status === "active").length,
    },
    tasks,
  }
}

export function tasksInLane(board: CatalogOpsBoard, lane: BoardLane): OpsTask[] {
  return board.tasks.filter((task) => task.lane === lane && task.status !== "done")
}

export function activeTasks(board: CatalogOpsBoard): OpsTask[] {
  return board.tasks.filter((task) => task.status === "active")
}

const ROLE_BY_TOKEN: Record<string, "HERO" | "ANGLE" | "DETAIL" | "CONTEXT"> = {
  hero: "HERO",
  angle: "ANGLE",
  detail: "DETAIL",
  context: "CONTEXT",
}

export function matchPhotoFilename(name: string): { handle: string; role: string } | null {
  const lower = name.toLowerCase()
  const spec = PHOTO_SPEC.find((row) => lower.includes(row.handle))
  if (!spec) return null
  const role = Object.entries(ROLE_BY_TOKEN).find(([token]) => lower.includes(token))?.[1] ?? "HERO"
  return { handle: spec.handle, role }
}

export function frozenGroupSummary(): Array<{ label: string; count: number }> {
  return FROZEN_GROUPS.map((group) => ({ ...group }))
}
